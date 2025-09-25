import { PoolClient } from 'pg';
import { Migration } from '../index';

export const createUsersTable: Migration = {
  id: '001',
  name: 'Create users table',
  
  async up(client: PoolClient): Promise<void> {
    const query = `
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username VARCHAR(100) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        roles JSONB NOT NULL DEFAULT '[]',
        employee_id UUID,
        is_active BOOLEAN DEFAULT true,
        token_version INTEGER DEFAULT 0,
        last_login TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL
      );

      -- Create indexes
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
      CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);
      CREATE INDEX IF NOT EXISTS idx_users_employee_id ON users(employee_id);
      CREATE INDEX IF NOT EXISTS idx_users_roles ON users USING GIN(roles);

      -- Create updated_at trigger function if it doesn't exist
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql';

      -- Create trigger for updated_at
      DROP TRIGGER IF EXISTS update_users_updated_at ON users;
      CREATE TRIGGER update_users_updated_at
        BEFORE UPDATE ON users
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `;

    await client.query(query);
  },

  async down(client: PoolClient): Promise<void> {
    const query = `
      DROP TRIGGER IF EXISTS update_users_updated_at ON users;
      DROP TABLE IF EXISTS users CASCADE;
    `;

    await client.query(query);
  }
};