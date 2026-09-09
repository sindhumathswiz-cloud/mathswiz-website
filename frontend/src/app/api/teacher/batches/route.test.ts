import { beforeEach, describe, expect, it, vi } from "vitest";

const getServerSession = vi.fn();
const findMany = vi.fn();

vi.mock("next-auth", () => ({ getServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  default: { batch: { findMany, findUnique: vi.fn(), create: vi.fn() } },
}));

describe("teacher batch ownership", () => {
  beforeEach(() => vi.clearAllMocks());

  it("scopes teachers to their own batches", async () => {
    getServerSession.mockResolvedValue({ user: { id: "teacher-1", role: "TEACHER" } });
    findMany.mockResolvedValue([]);
    const { GET } = await import("./route");

    expect((await GET()).status).toBe(200);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { teacherId: "teacher-1" } }));
  });

  it("allows administrators to list all batches", async () => {
    getServerSession.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
    findMany.mockResolvedValue([]);
    const { GET } = await import("./route");

    await GET();
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
  });
});
