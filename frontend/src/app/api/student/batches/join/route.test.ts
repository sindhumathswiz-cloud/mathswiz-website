import { beforeEach, describe, expect, it, vi } from "vitest";

const getServerSession = vi.fn();
const batch = { findUnique: vi.fn() };
const batchEnrollment = { findUnique: vi.fn(), create: vi.fn() };

vi.mock("next-auth", () => ({ getServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ default: { batch, batchEnrollment } }));

describe("student batch join", () => {
  beforeEach(() => vi.clearAllMocks());

  it("persists a real pending enrollment", async () => {
    getServerSession.mockResolvedValue({ user: { id: "student-1", role: "STUDENT" } });
    batch.findUnique.mockResolvedValue({ id: "batch-1", code: "JEE26", name: "Target JEE" });
    batchEnrollment.findUnique.mockResolvedValue(null);
    batchEnrollment.create.mockResolvedValue({ id: "enrollment-1", status: "PENDING" });
    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost/api/student/batches/join", {
      method: "POST",
      body: JSON.stringify({ batchCode: "jee26" }),
    }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(batchEnrollment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: { batchId: "batch-1", studentId: "student-1", status: "PENDING" },
    }));
    expect(JSON.stringify(body)).not.toContain("Mock");
  });
});
