export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'STATUS_CHANGE';

export interface AuditLog {
  id: string;
  entityType: string; // 'EMPLOYEE'
  entityId: string;
  action: AuditAction;
  changes: Record<string, any>; // JSON field storing before/after values
  performedBy: string;
  performedAt: Date;
  ipAddress?: string;
}