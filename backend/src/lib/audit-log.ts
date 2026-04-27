// ─── Audit Logging Utilities ───────────────────────
// Logs critical operations for security and compliance

import { db, Collections } from "@/lib/prisma";
import { Timestamp } from "firebase-admin/firestore";

export interface AuditLogEntry {
  id?: string;
  action: string;
  userId: string;
  userEmail: string;
  userName: string;
  resource: string;
  resourceId: string;
  changes: Record<string, { before: unknown; after: unknown }>;
  status: "success" | "failure";
  statusCode?: number;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
  timestamp?: Timestamp | Date;
  [key: string]: unknown;
}

// Critical actions that must be logged
export const AUDIT_ACTIONS = {
  // Admin operations
  ADMIN_ORDER_STATUS_CHANGE: "admin:order_status_change",
  ADMIN_PAYMENT_VERIFICATION: "admin:payment_verification",
  ADMIN_REFUND_ISSUED: "admin:refund_issued",
  ADMIN_DISCOUNT_APPLIED: "admin:discount_applied",
  ADMIN_PRODUCT_CREATED: "admin:product_created",
  ADMIN_PRODUCT_UPDATED: "admin:product_updated",
  ADMIN_PRODUCT_DELETED: "admin:product_deleted",
  ADMIN_USER_CREATED: "admin:user_created",
  ADMIN_ROLE_CHANGED: "admin:role_changed",
  ADMIN_SETTINGS_UPDATED: "admin:settings_updated",

  // Payment operations
  PAYMENT_ORDER_CREATED: "payment:order_created",
  PAYMENT_INITIATED: "payment:initiated",
  PAYMENT_COMPLETED: "payment:completed",
  PAYMENT_FAILED: "payment:failed",
  PAYMENT_REFUNDED: "payment:refunded",

  // User operations
  USER_REGISTERED: "user:registered",
  USER_LOGGED_IN: "user:logged_in",
  USER_LOGGED_OUT: "user:logged_out",
  USER_PASSWORD_CHANGED: "user:password_changed",
  USER_DELETED: "user:deleted",

  // Security operations
  AUTH_FAILED_ATTEMPT: "auth:failed_attempt",
  AUTH_RATE_LIMITED: "auth:rate_limited",
  UNAUTHORIZED_ACCESS: "security:unauthorized_access",
  PRIVILEGE_ESCALATION_ATTEMPT: "security:privilege_escalation_attempt",
};

// Helper to extract IP address from request
export function getRequestIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

// Helper to extract user agent
export function getUserAgent(req: Request): string {
  return req.headers.get("user-agent") || "unknown";
}

// Log an audit event to Firestore
export async function logAudit(entry: AuditLogEntry): Promise<void> {
  try {
    const timestamp = entry.timestamp || Timestamp.now();
    const logEntry = {
      ...entry,
      timestamp,
      createdAt: timestamp,
    };

    await db.collection(Collections.auditLogs || "auditLogs").add(logEntry);
  } catch (error) {
    // Don't fail the main operation if audit logging fails
    console.error("Failed to log audit entry:", error);
  }
}

// Helper for logging payment operations
export async function logPaymentOperation(
  action: string,
  userId: string,
  userEmail: string,
  userName: string,
  orderId: string,
  changes: Record<string, { before: unknown; after: unknown }>,
  status: "success" | "failure",
  req?: Request,
) {
  return logAudit({
    action,
    userId,
    userEmail,
    userName,
    resource: "order",
    resourceId: orderId,
    changes,
    status,
    ipAddress: req ? getRequestIp(req) : undefined,
    userAgent: req ? getUserAgent(req) : undefined,
  });
}

// Helper for logging admin actions
export async function logAdminAction(
  action: string,
  userId: string,
  userEmail: string,
  userName: string,
  resource: string,
  resourceId: string,
  changes: Record<string, { before: unknown; after: unknown }>,
  status: "success" | "failure" = "success",
  req?: Request,
  reason?: string,
) {
  return logAudit({
    action,
    userId,
    userEmail,
    userName,
    resource,
    resourceId,
    changes,
    status,
    reason,
    ipAddress: req ? getRequestIp(req) : undefined,
    userAgent: req ? getUserAgent(req) : undefined,
  });
}

// Helper for logging security events
export async function logSecurityEvent(
  action: string,
  userId: string | undefined,
  userEmail: string | undefined,
  status: "success" | "failure",
  reason: string,
  req: Request,
) {
  return logAudit({
    action,
    userId: userId || "anonymous",
    userEmail: userEmail || "unknown",
    userName: userEmail ? userEmail.split("@")[0] : "unknown",
    resource: "system",
    resourceId: "security",
    changes: {},
    status,
    reason,
    ipAddress: getRequestIp(req),
    userAgent: getUserAgent(req),
  });
}
