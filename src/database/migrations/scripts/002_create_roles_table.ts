import { PoolClient } from 'pg';
import { Migration } from '../index';

export const createRolesTable: Migration = {
  id: '002',
  name: 'Create roles table',
  
  async up(client: PoolClient): Promise<void> {
    const query = `
      CREATE TABLE IF NOT EXISTS roles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(50) UNIQUE NOT NULL,
        description TEXT,
        permissions JSONB DEFAULT '[]',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- Create indexes
      CREATE INDEX IF NOT EXISTS idx_roles_name ON roles(name);

      -- Create trigger for updated_at
      DROP TRIGGER IF EXISTS update_roles_updated_at ON roles;
      CREATE TRIGGER update_roles_updated_at
        BEFORE UPDATE ON roles
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();

      -- Insert default roles
      INSERT INTO roles (name, description, permissions) VALUES
        ('HR_ADMIN', 'HR Administrator with full access', '["employee:create", "employee:read", "employee:update", "employee:delete", "employee:export", "audit:read", "user:manage"]'),
        ('MANAGER', 'Manager with access to direct reports', '["employee:read", "employee:update_limited", "report:direct_reports"]'),
        ('EMPLOYEE', 'Employee with self-service access', '["employee:read_self", "employee:update_self_limited"]'),
        ('VIEWER', 'Read-only access to permitted employee information', '["employee:read_limited"]')
      ON CONFLICT (name) DO NOTHING;
    `;

    await client.query(query);
  },

  async down(client: PoolClient): Promise<void> {
    const query = `
      DROP TRIGGER IF EXISTS update_roles_updated_at ON roles;
      DROP TABLE IF EXISTS roles CASCADE;
    `;

    await client.query(query);
  }
};