import { PoolClient } from 'pg';
import { Migration } from '../index';

export const createEmployeeStatusHistoryTable: Migration = {
  id: '006',
  name: 'Create employee_status_history table',
  
  async up(client: PoolClient): Promise<void> {
    const query = `
      CREATE TABLE IF NOT EXISTS employee_status_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        previous_status employee_status,
        new_status employee_status NOT NULL,
        effective_date DATE NOT NULL,
        reason VARCHAR(500),
        notes TEXT,
        changed_by UUID NOT NULL REFERENCES users(id),
        changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- Create indexes
      CREATE INDEX IF NOT EXISTS idx_employee_status_history_employee_id ON employee_status_history(employee_id);
      CREATE INDEX IF NOT EXISTS idx_employee_status_history_effective_date ON employee_status_history(effective_date);
      CREATE INDEX IF NOT EXISTS idx_employee_status_history_status ON employee_status_history(new_status);
      CREATE INDEX IF NOT EXISTS idx_employee_status_history_changed_by ON employee_status_history(changed_by);

      -- Create function to automatically track status changes
      CREATE OR REPLACE FUNCTION track_employee_status_change()
      RETURNS TRIGGER AS $$
      BEGIN
        -- Only insert if status actually changed
        IF OLD.status IS DISTINCT FROM NEW.status THEN
          INSERT INTO employee_status_history (
            employee_id,
            previous_status,
            new_status,
            effective_date,
            reason,
            notes,
            changed_by
          ) VALUES (
            NEW.id,
            OLD.status,
            NEW.status,
            NEW.status_effective_date,
            NEW.status_reason,
            NEW.status_notes,
            NEW.updated_by
          );
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      -- Create trigger to automatically track status changes
      DROP TRIGGER IF EXISTS track_employee_status_changes ON employees;
      CREATE TRIGGER track_employee_status_changes
        AFTER UPDATE ON employees
        FOR EACH ROW
        EXECUTE FUNCTION track_employee_status_change();
    `;

    await client.query(query);
  },

  async down(client: PoolClient): Promise<void> {
    const query = `
      DROP TRIGGER IF EXISTS track_employee_status_changes ON employees;
      DROP FUNCTION IF EXISTS track_employee_status_change();
      DROP TABLE IF EXISTS employee_status_history CASCADE;
    `;

    await client.query(query);
  }
};