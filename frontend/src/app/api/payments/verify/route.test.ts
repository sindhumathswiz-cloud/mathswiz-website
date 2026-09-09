import { beforeEach, describe, expect, it, vi } from "vitest";

const getServerSession = vi.fn();
const findFirst = vi.fn();
const update = vi.fn();

vi.mock("next-auth", () => ({ getServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  default: { paymentRecord: { findFirst, update } },
}));

describe("payment ownership", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not update another student's payment", async () => {
    getServerSession.mockResolvedValue({ user: { id: "student-1", role: "STUDENT" } });
    findFirst.mockResolvedValue(null);
    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost/api/payments/verify", {
      method: "POST",
      body: JSON.stringify({ paymentId: "payment-2", transactionId: "txn-1" }),
    }));

    expect(response.status).toBe(404);
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: "payment-2", enrollment: { studentId: "student-1" } },
    });
    expect(update).not.toHaveBeenCalled();
  });
});
