import prisma from "@/lib/prisma";

const SENSITIVE_KEY = /password|passcode|token|secret|authorization|cookie|api.?key/i;

export type AuditEvent = {
  actorId?: string | null;
  actorRole?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export function sanitizeAuditMetadata(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(sanitizeAuditMetadata);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !SENSITIVE_KEY.test(key))
      .map(([key, nested]) => [key, sanitizeAuditMetadata(nested)]),
  );
}

export async function recordAuditLog(event: AuditEvent): Promise<void> {
  await (prisma as any).auditLog.create({
    data: {
      actorId: event.actorId || null,
      actorRole: event.actorRole || null,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId || null,
      metadata: event.metadata === undefined ? undefined : sanitizeAuditMetadata(event.metadata),
      ipAddress: event.ipAddress || null,
      userAgent: event.userAgent?.slice(0, 500) || null,
    },
  });
}

export function requestAuditContext(request: Request) {
  return {
    ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || request.headers.get("x-real-ip")
      || null,
    userAgent: request.headers.get("user-agent"),
  };
}
