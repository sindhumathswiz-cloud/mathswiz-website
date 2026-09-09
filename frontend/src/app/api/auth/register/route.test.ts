import { beforeEach, describe, expect, it, vi } from "vitest";

const user = {
  findUnique: vi.fn(),
  create: vi.fn(),
};

vi.mock("@/lib/prisma", () => ({ default: { user } }));
vi.mock("bcryptjs", () => ({ hash: vi.fn().mockResolvedValue("secure-hash") }));

describe("POST /api/auth/register", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects public ADMIN registration", async () => {
    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        firstName: "Ada",
        lastName: "Admin",
        mobileNumber: "9876543210",
        password: "password123",
        role: "ADMIN",
      }),
    }));

    expect(response.status).toBe(400);
    expect(user.create).not.toHaveBeenCalled();
  });

  it("hashes passwords and never returns them", async () => {
    user.findUnique.mockResolvedValue(null);
    user.create.mockResolvedValue({
      id: "student-1",
      mobileNumber: "9876543210",
      role: "STUDENT",
      accountStatus: "APPROVED",
      password: "secure-hash",
    });

    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        firstName: "Stu",
        lastName: "Dent",
        mobileNumber: "9876543210",
        password: "password123",
        role: "STUDENT",
      }),
    }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ password: "secure-hash" }),
    }));
    expect(JSON.stringify(body)).not.toContain("secure-hash");
    expect(JSON.stringify(body)).not.toContain("password123");
  });
});
