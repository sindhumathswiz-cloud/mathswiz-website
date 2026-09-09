import { describe, expect, it } from "vitest";
import { authorizeApiPath } from "./api-authorization";

describe("API authorization policy", () => {
  it("allows only documented public API paths without a session", () => {
    expect(authorizeApiPath("/api/auth/session", null).allowed).toBe(true);
    expect(authorizeApiPath("/api/auth/register", null).allowed).toBe(true);
    expect(authorizeApiPath("/api/site-page/home", null).allowed).toBe(true);
    expect(authorizeApiPath("/api/payments/verify", null)).toMatchObject({ allowed: false, status: 401 });
    expect(authorizeApiPath("/api/register-attacker", null)).toMatchObject({ allowed: false, status: 401 });
    expect(authorizeApiPath("/api/admin/stats", null)).toMatchObject({ allowed: false, status: 401 });
  });

  it.each([
    ["ADMIN", "/api/admin/stats"],
    ["TEACHER", "/api/teacher/batches"],
    ["STUDENT", "/api/student/tests/assigned"],
    ["PARENT", "/api/parent/dashboard"],
  ])("allows %s to access its role namespace", (role, path) => {
    expect(authorizeApiPath(path, role).allowed).toBe(true);
  });

  it.each([
    ["STUDENT", "/api/admin/stats"],
    ["PARENT", "/api/teacher/batches"],
    ["TEACHER", "/api/student/tests/assigned"],
    ["ADMIN", "/api/parent/dashboard"],
  ])("denies cross-role access for %s to %s", (role, path) => {
    expect(authorizeApiPath(path, role)).toMatchObject({ allowed: false, status: 403 });
  });

  it("allows admins into teacher operations but not student or parent portals", () => {
    expect(authorizeApiPath("/api/teacher/tests", "ADMIN").allowed).toBe(true);
    expect(authorizeApiPath("/api/student/report", "ADMIN")).toMatchObject({ allowed: false, status: 403 });
  });

  it("allows the documented cross-namespace workflows", () => {
    expect(authorizeApiPath("/api/admin/teams/sync", "TEACHER", "POST").allowed).toBe(true);
    expect(authorizeApiPath("/api/student/practice/generate", "TEACHER", "POST").allowed).toBe(true);
    expect(authorizeApiPath("/api/admin/users", "TEACHER", "PATCH")).toMatchObject({ allowed: false, status: 403 });
  });

  it("restricts shared content-authoring APIs", () => {
    expect(authorizeApiPath("/api/questions", "TEACHER", "POST").allowed).toBe(true);
    expect(authorizeApiPath("/api/questions", "STUDENT", "GET").allowed).toBe(true);
    expect(authorizeApiPath("/api/questions", "STUDENT", "POST")).toMatchObject({ allowed: false, status: 403 });
    expect(authorizeApiPath("/api/extract-word", "ADMIN").allowed).toBe(true);
    expect(authorizeApiPath("/api/extract-word", "PARENT")).toMatchObject({ allowed: false, status: 403 });
  });

  it("keeps payment verification inside the student role", () => {
    expect(authorizeApiPath("/api/payments/verify", "STUDENT", "POST").allowed).toBe(true);
    expect(authorizeApiPath("/api/payments/verify", "TEACHER", "POST")).toMatchObject({ allowed: false, status: 403 });
  });

  it("requires authentication for unclassified API routes by default", () => {
    expect(authorizeApiPath("/api/future-feature", null)).toMatchObject({ allowed: false, status: 401 });
    expect(authorizeApiPath("/api/future-feature", "STUDENT").allowed).toBe(true);
  });
});
