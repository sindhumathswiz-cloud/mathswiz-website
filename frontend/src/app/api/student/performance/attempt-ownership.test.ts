import { describe, expect, it, vi } from "vitest";

const getServerSession = vi.fn();
const findFirst = vi.fn();

vi.mock("next-auth", () => ({ getServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ default: { testAttempt: { findFirst } } }));

describe("student attempt ownership", () => {
  it("queries an attempt using both its id and the signed-in student", async () => {
    getServerSession.mockResolvedValue({ user: { id: "student-1", role: "STUDENT" } });
    findFirst.mockResolvedValue(null);
    const { GET } = await import("./[attemptId]/route");
    const response = await GET(
      new Request("http://localhost/api/student/performance/attempt-2"),
      { params: Promise.resolve({ attemptId: "attempt-2" }) },
    );

    expect(response.status).toBe(404);
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "attempt-2", userId: "student-1" },
    }));
  });
});
