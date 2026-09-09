import { beforeEach, describe, expect, it, vi } from "vitest";

const user = { findUnique: vi.fn(), update: vi.fn(), upsert: vi.fn() };

vi.mock("@/lib/prisma", () => ({
  default: { user, pointsTransaction: { findFirst: vi.fn() } },
}));
vi.mock("@/lib/gamification", () => ({ awardPoints: vi.fn(), POINTS_RULES: { DAILY_LOGIN: 1 } }));
const compare = vi.fn();
const hash = vi.fn();
vi.mock("bcryptjs", () => ({ compare, hash }));

describe("credential authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXTAUTH_SECRET = "test-secret-that-is-long-enough";
  });

  async function authorize(credentials: { mobile: string; password: string }) {
    const { authOptions } = await import("./auth");
    const provider = authOptions.providers.find((item) => item.id === "credentials");
    if (!provider || !("authorize" in provider.options)) throw new Error("Credentials provider not found");
    return provider.options.authorize(credentials, { headers: { "user-agent": "test" } });
  }

  it("does not create an account for an unknown mobile", async () => {
    user.findUnique.mockResolvedValue(null);

    await expect(authorize({ mobile: "9876543210", password: "password123" })).resolves.toBeNull();
    expect(user.update).not.toHaveBeenCalled();
  });

  it("rejects pending accounts before checking a password", async () => {
    user.findUnique.mockResolvedValue({ id: "teacher-1", password: "hash", accountStatus: "PENDING" });

    await expect(authorize({ mobile: "9876543210", password: "password123" }))
      .rejects.toThrow("awaiting administrator approval");
  });

  it("upgrades a matching legacy plain-text password after login", async () => {
    user.findUnique.mockResolvedValue({
      id: "admin-1",
      mobileNumber: "9876543210",
      password: "legacy-password",
      accountStatus: "APPROVED",
      role: "ADMIN",
      email: "admin@example.com",
      firstName: "Admin",
    });
    hash.mockResolvedValue("$2b$12$upgraded-password-hash");
    user.update.mockImplementation(async ({ data }) => ({
      id: "admin-1",
      role: "ADMIN",
      accountStatus: "APPROVED",
      email: "admin@example.com",
      firstName: "Admin",
      ...data,
    }));

    await expect(authorize({ mobile: "9876543210", password: "legacy-password" }))
      .resolves.toMatchObject({ id: "admin-1", role: "ADMIN" });

    expect(compare).not.toHaveBeenCalled();
    expect(hash).toHaveBeenCalledWith("legacy-password", 12);
    expect(user.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ password: "$2b$12$upgraded-password-hash" }),
    }));
  });

  it("does not accept an incorrect legacy plain-text password", async () => {
    user.findUnique.mockResolvedValue({
      id: "admin-1",
      password: "legacy-password",
      accountStatus: "APPROVED",
    });

    await expect(authorize({ mobile: "9876543210", password: "wrong-password" })).resolves.toBeNull();
    expect(hash).not.toHaveBeenCalled();
    expect(user.update).not.toHaveBeenCalled();
  });
});
