import { PoolClient } from 'pg';
import { BaseRepository, PaginationOptions, PaginatedResult, SortOptions, FilterOptions } from './base';

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'STATUS_CHANGE' | 'LOGIN' | 'LOGOUT' | 'EXPORT' | 'VIEW';

export interface AuditLog {
  id: string;
  entityType: string;
  entityId?: string;
  action: AuditAction;
  changes?: Record<string, any>;
  metadata?: Record<string, any>;
  performedBy: string;
  performedAt: Date;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  correlationId?: string;
}

export interface CreateAuditLogInput {
  entityType: string;
  entityId?: string;
  action: AuditAction;
  changes?: Record<string, any>;
  metadata?: Record<string, any>;
  performedBy: string;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  correlationId?: string;
}

export interface UpdateAuditLogInput {
  // Audit logs are typically immutable, so no update operations
}

export interface AuditLogSearchCriteria extends FilterOptions {
  entityType?: string;
  entityId?: string;
  action?: AuditAction;
  performedBy?: string;
  dateFrom?: Date;
  dateTo?: Date;
  correlationId?: string;
}

export class AuditLogRepository extends BaseRepository<AuditLog, CreateAuditLogInput, UpdateAuditLogInput> {
  constructor() {
    super('audit_logs');
  }

  /**
   * Create a new audit log entry
   */
  async create(data: CreateAuditLogInput, client?: PoolClient): Promise<AuditLog> {
    const query = `
      INSERT INTO audit_logs (
        entity_type, entity_id, action, changes, metadata,
        performed_by, ip_address, user_agent, session_id, correlation_id
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
      )
      RETURNING *
    `;

    const params = [
      data.entityType,
      data.entityId || null,
      data.action,
      data.changes ? JSON.stringify(data.changes) : null,
      data.metadata ? JSON.stringify(data.metadata) : null,
      data.performedBy,
      data.ipAddress || null,
      data.userAgent || null,
      data.sessionId || null,
      data.correlationId || null
    ];

    const result = await this.executeQuery(query, params, client);
    return this.mapRowToAuditLog(result.rows[0]);
  }

  /**
   * Find audit log by ID
   */
  async findById(id: string, client?: PoolClient): Promise<AuditLog | null> {
    const query = `SELECT * FROM audit_logs WHERE id = $1`;
    const result = await this.executeQuery(query, [id], client);
    return result.rows.length > 0 ? this.mapRowToAuditLog(result.rows[0]) : null;
  }

  /**
   * Find all audit logs with filtering, sorting, and pagination
   */
  async findAll(options?: {
    pagination?: PaginationOptions;
    sort?: SortOptions;
    filters?: AuditLogSearchCriteria;
  }, client?: PoolClient): Promise<PaginatedResult<AuditLog>> {
    const { pagination, sort, filters = {} } = options || {};

    // Build WHERE clause
    const { whereClause, params } = this.buildAuditLogWhereClause(filters);
    const baseQuery = `FROM audit_logs ${whereClause}`;

    // Get total count
    const countQuery = `SELECT COUNT(*) as total ${baseQuery}`;
    const countResult = await this.executeQuery(countQuery, params, client);
    const total = parseInt(countResult.rows[0].total);

    // Build the main query
    const orderByClause = this.buildOrderByClause(sort || { field: 'performed_at', direction: 'DESC' });
    const { limitClause, limit } = this.buildPaginationClause(pagination);
    
    const selectQuery = `
      SELECT * ${baseQuery}
      ${orderByClause}
      ${limitClause}
    `;

    const result = await this.executeQuery(selectQuery, params, client);
    const auditLogs = result.rows.map((row: any) => this.mapRowToAuditLog(row));

    const page = pagination?.page || 1;
    const paginationMeta = this.calculatePaginationMeta(total, page, limit);

    return {
      data: auditLogs,
      pagination: paginationMeta
    };
  }

  /**
   * Update audit log (not typically allowed)
   */
  async update(_id: string, _data: UpdateAuditLogInput, _client?: PoolClient): Promise<AuditLog | null> {
    throw new Error('Audit logs are immutable and cannot be updated');
  }

  /**
   * Delete audit log (not typically allowed)
   */
  async delete(_id: string, _client?: PoolClient): Promise<boolean> {
    throw new Error('Audit logs are immutable and cannot be deleted');
  }

  /**
   * Log employee creation
   */
  async logEmployeeCreate(
    employeeId: string,
    employeeData: Record<string, any>,
    performedBy: string,
    metadata?: Record<string, any>,
    client?: PoolClient
  ): Promise<AuditLog> {
    return this.create({
      entityType: 'EMPLOYEE',
      entityId: employeeId,
      action: 'CREATE',
      changes: { after: employeeData },
      metadata,
      performedBy
    }, client);
  }

  /**
   * Log employee update
   */
  async logEmployeeUpdate(
    employeeId: string,
    beforeData: Record<string, any>,
    afterData: Record<string, any>,
    performedBy: string,
    metadata?: Record<string, any>,
    client?: PoolClient
  ): Promise<AuditLog> {
    return this.create({
      entityType: 'EMPLOYEE',
      entityId: employeeId,
      action: 'UPDATE',
      changes: { before: beforeData, after: afterData },
      metadata,
      performedBy
    }, client);
  }

  /**
   * Log employee status change
   */
  async logEmployeeStatusChange(
    employeeId: string,
    previousStatus: string,
    newStatus: string,
    reason?: string,
    performedBy?: string,
    metadata?: Record<string, any>,
    client?: PoolClient
  ): Promise<AuditLog> {
    return this.create({
      entityType: 'EMPLOYEE',
      entityId: employeeId,
      action: 'STATUS_CHANGE',
      changes: {
        before: { status: previousStatus },
        after: { status: newStatus, reason }
      },
      metadata,
      performedBy: performedBy || 'SYSTEM'
    }, client);
  }

  /**
   * Log employee deletion
   */
  async logEmployeeDelete(
    employeeId: string,
    employeeData: Record<string, any>,
    performedBy: string,
    metadata?: Record<string, any>,
    client?: PoolClient
  ): Promise<AuditLog> {
    return this.create({
      entityType: 'EMPLOYEE',
      entityId: employeeId,
      action: 'DELETE',
      changes: { before: employeeData },
      metadata,
      performedBy
    }, client);
  }

  /**
   * Log user login
   */
  async logUserLogin(
    userId: string,
    ipAddress?: string,
    userAgent?: string,
    sessionId?: string,
    client?: PoolClient
  ): Promise<AuditLog> {
    return this.create({
      entityType: 'USER',
      entityId: userId,
      action: 'LOGIN',
      performedBy: userId,
      ipAddress,
      userAgent,
      sessionId
    }, client);
  }

  /**
   * Log user logout
   */
  async logUserLogout(
    userId: string,
    sessionId?: string,
    client?: PoolClient
  ): Promise<AuditLog> {
    return this.create({
      entityType: 'USER',
      entityId: userId,
      action: 'LOGOUT',
      performedBy: userId,
      sessionId
    }, client);
  }

  /**
   * Log data export
   */
  async logDataExport(
    exportType: string,
    exportedData: Record<string, any>,
    performedBy: string,
    metadata?: Record<string, any>,
    client?: PoolClient
  ): Promise<AuditLog> {
    return this.create({
      entityType: 'EXPORT',
      action: 'EXPORT',
      changes: { exported: exportedData },
      metadata: { ...metadata, exportType },
      performedBy
    }, client);
  }

  /**
   * Log report generation
   */
  async logReportGeneration(
    reportType: string,
    filters: Record<string, any>,
    recordCount: number,
    performedBy: string,
    metadata?: Record<string, any>,
    client?: PoolClient
  ): Promise<AuditLog> {
    return this.create({
      entityType: 'REPORT',
      action: 'VIEW',
      changes: { filters, recordCount },
      metadata: { ...metadata, reportType },
      performedBy
    }, client);
  }

  /**
   * Get audit trail for a specific entity
   */
  async getEntityAuditTrail(
    entityType: string,
    entityId: string,
    options?: {
      pagination?: PaginationOptions;
      dateFrom?: Date;
      dateTo?: Date;
    },
    client?: PoolClient
  ): Promise<PaginatedResult<AuditLog>> {
    const filters: AuditLogSearchCriteria = {
      entityType,
      entityId,
      dateFrom: options?.dateFrom,
      dateTo: options?.dateTo
    };

    return this.findAll({
      pagination: options?.pagination,
      sort: { field: 'performed_at', direction: 'DESC' },
      filters
    }, client);
  }

  /**
   * Get user activity log
   */
  async getUserActivityLog(
    userId: string,
    options?: {
      pagination?: PaginationOptions;
      dateFrom?: Date;
      dateTo?: Date;
      actions?: AuditAction[];
    },
    client?: PoolClient
  ): Promise<PaginatedResult<AuditLog>> {
    const filters: AuditLogSearchCriteria = {
      performedBy: userId,
      dateFrom: options?.dateFrom,
      dateTo: options?.dateTo
    };

    // Add action filter if specified
    if (options?.actions && options.actions.length > 0) {
      // This would need to be handled in the WHERE clause builder
      (filters as any).actions = options.actions;
    }

    return this.findAll({
      pagination: options?.pagination,
      sort: { field: 'performed_at', direction: 'DESC' },
      filters
    }, client);
  }

  /**
   * Build WHERE clause for audit log search
   */
  private buildAuditLogWhereClause(filters: AuditLogSearchCriteria): { whereClause: string; params: any[] } {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filters.entityType) {
      conditions.push(`entity_type = $${paramIndex++}`);
      params.push(filters.entityType);
    }

    if (filters.entityId) {
      conditions.push(`entity_id = $${paramIndex++}`);
      params.push(filters.entityId);
    }

    if (filters.action) {
      conditions.push(`action = $${paramIndex++}`);
      params.push(filters.action);
    }

    if (filters.performedBy) {
      conditions.push(`performed_by = $${paramIndex++}`);
      params.push(filters.performedBy);
    }

    if (filters.dateFrom) {
      conditions.push(`performed_at >= $${paramIndex++}`);
      params.push(filters.dateFrom);
    }

    if (filters.dateTo) {
      conditions.push(`performed_at <= $${paramIndex++}`);
      params.push(filters.dateTo);
    }

    if (filters.correlationId) {
      conditions.push(`correlation_id = $${paramIndex++}`);
      params.push(filters.correlationId);
    }

    // Handle multiple actions filter
    if ((filters as any).actions && Array.isArray((filters as any).actions)) {
      const actions = (filters as any).actions;
      const placeholders = actions.map(() => `$${paramIndex++}`).join(', ');
      conditions.push(`action IN (${placeholders})`);
      params.push(...actions);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return { whereClause, params };
  }

  /**
   * Map database row to AuditLog object
   */
  private mapRowToAuditLog(row: any): AuditLog {
    return {
      id: row.id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      action: row.action,
      changes: row.changes ? JSON.parse(row.changes) : undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      performedBy: row.performed_by,
      performedAt: row.performed_at,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      sessionId: row.session_id,
      correlationId: row.correlation_id
    };
  }
}