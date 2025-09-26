import { Pool } from 'pg';

export const up = async (pool: Pool): Promise<void> => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Create leave_types table
    await client.query(`
      CREATE TABLE IF NOT EXISTS leave_types (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL,
        code VARCHAR(10) NOT NULL UNIQUE,
        paid BOOLEAN NOT NULL DEFAULT TRUE,
        requires_approval BOOLEAN NOT NULL DEFAULT TRUE,
        max_consecutive_days INTEGER,
        advance_notice_required INTEGER DEFAULT 0, -- in days
        allows_partial_days BOOLEAN NOT NULL DEFAULT FALSE,
        accrual_based BOOLEAN NOT NULL DEFAULT TRUE,
        description TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for leave_types
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_leave_types_code 
      ON leave_types(code)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_leave_types_active 
      ON leave_types(is_active)
    `);

    // Add trigger to update updated_at timestamp
    await client.query(`
      CREATE OR REPLACE FUNCTION update_leave_types_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await client.query(`
      CREATE TRIGGER trigger_leave_types_updated_at
        BEFORE UPDATE ON leave_types
        FOR EACH ROW
        EXECUTE FUNCTION update_leave_types_updated_at();
    `);

    // Insert default leave types
    await client.query(`
      INSERT INTO leave_types (name, code, paid, requires_approval, max_consecutive_days, advance_notice_required, allows_partial_days, accrual_based, description)
      VALUES 
        ('Vacation', 'VAC', TRUE, TRUE, NULL, 14, TRUE, TRUE, 'Annual vacation leave'),
        ('Sick Leave', 'SICK', TRUE, FALSE, 5, 0, TRUE, TRUE, 'Medical sick leave'),
        ('Personal Leave', 'PERSONAL', TRUE, TRUE, 3, 7, TRUE, TRUE, 'Personal time off'),
        ('Unpaid Leave', 'UNPAID', FALSE, TRUE, NULL, 30, FALSE, FALSE, 'Unpaid time off'),
        ('Bereavement', 'BEREAVEMENT', TRUE, TRUE, 5, 0, FALSE, FALSE, 'Bereavement leave'),
        ('Jury Duty', 'JURY', TRUE, TRUE, NULL, 1, FALSE, FALSE, 'Jury duty leave'),
        ('Maternity/Paternity', 'MATERNITY', TRUE, TRUE, NULL, 30, FALSE, FALSE, 'Maternity or paternity leave')
      ON CONFLICT (code) DO NOTHING
    `);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const down = async (pool: Pool): Promise<void> => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Drop trigger
    await client.query('DROP TRIGGER IF EXISTS trigger_leave_types_updated_at ON leave_types');
    
    // Drop function
    await client.query('DROP FUNCTION IF EXISTS update_leave_types_updated_at()');

    // Drop indexes
    await client.query('DROP INDEX IF EXISTS idx_leave_types_active');
    await client.query('DROP INDEX IF EXISTS idx_leave_types_code');

    // Drop table
    await client.query('DROP TABLE IF EXISTS leave_types');

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};