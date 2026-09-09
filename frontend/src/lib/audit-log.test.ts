import { describe, expect, it } from "vitest";
import { vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ default: {} }));

import { sanitizeAuditMetadata } from "./audit-log";

describe("audit metadata sanitizer", () => {
  it("removes secrets recursively while preserving useful change metadata", () => {
    expect(sanitizeAuditMetadata({
      action: "reset",
      password: "do-not-store",
      nested: { accessToken: "secret", status: "APPROVED" },
      changes: [{ role: "TEACHER", apiKey: "hidden" }],
    })).toEqual({
      action: "reset",
      nested: { status: "APPROVED" },
      changes: [{ role: "TEACHER" }],
    });
  });

  it("serializes dates into durable JSON values", () => {
    expect(sanitizeAuditMetadata({ at: new Date("2026-08-02T10:00:00.000Z") }))
      .toEqual({ at: "2026-08-02T10:00:00.000Z" });
  });
});
