import { prisma } from "./db";
import { AuditAction } from "./constants";

type AuditInput = {
  action: (typeof AuditAction)[keyof typeof AuditAction];
  actorId?: string;
  actorType?: string;
  entityType: string;
  entityId: string;
  message?: string;
  metadata?: unknown;
};

export async function audit(input: AuditInput) {
  await prisma.auditLog.create({
    data: {
      action: input.action,
      actorId: input.actorId,
      actorType: input.actorType ?? "system",
      entityType: input.entityType,
      entityId: input.entityId,
      message: input.message,
      metadata: input.metadata ? JSON.stringify(input.metadata) : undefined
    }
  });
}
