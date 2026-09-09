export type AppRole = "ADMIN" | "TEACHER" | "STUDENT" | "PARENT";

export type ApiAccessDecision =
  | { allowed: true; public: boolean }
  | { allowed: false; status: 401 | 403; message: string };

type ApiRule = {
  prefix: string;
  roles: readonly AppRole[];
  methods?: readonly string[];
};

const PUBLIC_API_PREFIXES = ["/api/auth/", "/api/site-page/", "/api/health/"] as const;
const PUBLIC_API_EXACT_PATHS = ["/api/register", "/api/auth/register", "/api/health"] as const;

// Rules are evaluated in order. Narrow exceptions must precede namespace defaults.
const ROLE_RULES: readonly ApiRule[] = [
  { prefix: "/api/admin/teams/", roles: ["ADMIN", "TEACHER"] },
  { prefix: "/api/student/practice/generate", roles: ["ADMIN", "TEACHER", "STUDENT"] },
  { prefix: "/api/admin/", roles: ["ADMIN"] },
  { prefix: "/api/teacher/", roles: ["TEACHER", "ADMIN"] },
  { prefix: "/api/student/", roles: ["STUDENT"] },
  { prefix: "/api/parent/", roles: ["PARENT"] },
  { prefix: "/api/doubts/", roles: ["STUDENT"] },
  { prefix: "/api/payments/verify", roles: ["STUDENT"] },
  { prefix: "/api/extract", roles: ["TEACHER", "ADMIN"] },
  { prefix: "/api/scrape-url", roles: ["TEACHER", "ADMIN"] },
  { prefix: "/api/rag/", roles: ["TEACHER", "ADMIN", "STUDENT"] },
  { prefix: "/api/knowledge-folders", roles: ["TEACHER", "ADMIN"] },
  { prefix: "/api/taxonomy", roles: ["TEACHER", "ADMIN"] },
  { prefix: "/api/questions", roles: ["TEACHER", "ADMIN", "STUDENT"], methods: ["GET"] },
  { prefix: "/api/questions", roles: ["TEACHER", "ADMIN"] },
  { prefix: "/api/user/", roles: ["ADMIN", "TEACHER", "STUDENT", "PARENT"] },
] as const;

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix);
}

export function authorizeApiPath(
  pathname: string,
  role?: string | null,
  method = "GET",
): ApiAccessDecision {
  if (!pathname.startsWith("/api/")) return { allowed: true, public: true };

  const isPublic = PUBLIC_API_EXACT_PATHS.includes(pathname as (typeof PUBLIC_API_EXACT_PATHS)[number])
    || PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  if (isPublic) return { allowed: true, public: true };

  if (!role) {
    return { allowed: false, status: 401, message: "Authentication required" };
  }

  const normalizedMethod = method.toUpperCase();
  const rule = ROLE_RULES.find(({ prefix, methods }) =>
    matchesPrefix(pathname, prefix) && (!methods || methods.includes(normalizedMethod))
  );

  if (rule && !rule.roles.includes(role as AppRole)) {
    return { allowed: false, status: 403, message: "You do not have permission to access this resource" };
  }

  // Unclassified routes are private by default. Any signed-in role may use them
  // until a narrower policy is added, so new APIs can never become public by accident.
  return { allowed: true, public: false };
}

export const apiAuthorizationPolicy = {
  publicPrefixes: PUBLIC_API_PREFIXES,
  publicExactPaths: PUBLIC_API_EXACT_PATHS,
  roleRules: ROLE_RULES,
};
