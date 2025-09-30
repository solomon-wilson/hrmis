export const createAuditLogsTable = {
    id: '007',
    name: 'Create audit_logs table',
    async up(client) {
        const query = `
      -- Create audit action enum
      CREATE TYPE audit_action AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'STATUS_CHANGE', 'LOGIN', 'LOGOUT', 'EXPORT', 'VIEW');

      CREATE TABLE IF NOT EXISTS audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        entity_type VARCHAR(50) NOT NULL, -- 'EMPLOYEE', 'USER', 'DEPARTMENT', etc.
        entity_id UUID, -- ID of the affected entity
        action audit_action NOT NULL,
        changes JSONB, -- JSON object storing before/after values
        metadata JSONB, -- Additional context (IP address, user agent, etc.)
        performed_by UUID NOT NULL REFERENCES users(id),
        performed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        ip_address INET,
        user_agent TEXT,
        session_id VARCHAR(255),
        correlation_id UUID -- For tracking related operations
      );

      -- Create indexes for efficient querying
      CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type ON audit_logs(entity_type);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_id ON audit_logs(entity_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_performed_by ON audit_logs(performed_by);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_performed_at ON audit_logs(performed_at);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_correlation_id ON audit_logs(correlation_id);
      
      -- Composite index for common queries
      CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type_id ON audit_logs(entity_type, entity_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_user_date ON audit_logs(performed_by, performed_at);

      -- GIN index for JSONB fields
      CREATE INDEX IF NOT EXISTS idx_audit_logs_changes ON audit_logs USING gin(changes);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_metadata ON audit_logs USING gin(metadata);

      -- Partitioning by date for better performance (optional, can be added later)
      -- This would require converting to a partitioned table
    `;
        await client.query(query);
    },
    async down(client) {
        const query = `
      DROP TABLE IF EXISTS audit_logs CASCADE;
      DROP TYPE IF EXISTS audit_action CASCADE;
    `;
        await client.query(query);
    }
};
