import { PoolClient } from 'pg';
import { Migration } from '../index';

export const createDepartmentsTable: Migration = {
  id: '004',
  name: 'Create departments table',

  async up(client: PoolClient): Promise<void> {
    const query = `
      CREATE TABLE IF NOT EXISTS departments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) UNIQUE NOT NULL,
        description TEXT,
        manager_id UUID,
        parent_department_id UUID REFERENCES departments(id),
        location VARCHAR(255),
        budget DECIMAL(15,2),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- Create indexes
      CREATE INDEX IF NOT EXISTS idx_departments_name ON departments(name);
      CREATE INDEX IF NOT EXISTS idx_departments_manager_id ON departments(manager_id);
      CREATE INDEX IF NOT EXISTS idx_departments_parent ON departments(parent_department_id);
      CREATE INDEX IF NOT EXISTS idx_departments_active ON departments(is_active);

      -- Create trigger for updated_at
      DROP TRIGGER IF EXISTS update_departments_updated_at ON departments;
      CREATE TRIGGER update_departments_updated_at
        BEFORE UPDATE ON departments
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();

      -- Insert default departments
      INSERT INTO departments (name, description, location) VALUES
        ('Human Resources', 'Human Resources Department'),
        ('Internal Audit and Control', 'IT Audit'),
        ('Public Relations', 'Media and Communications'),
        ('Legal and Compliance'),
        ('Procurement'),
        ('Finance', 'Finance and Accounting'),
        ('Operations', 'Operations and Administration')
      ON CONFLICT (name) DO NOTHING;
    `;

    await client.query(query);
  },

  async down(client: PoolClient): Promise<void> {
    const query = `
      DROP TRIGGER IF EXISTS update_departments_updated_at ON departments;
      DROP TABLE IF EXISTS departments CASCADE;
    `;

    await client.query(query);
  }
};