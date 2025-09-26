import { Pool } from 'pg';

export const up = async (pool: Pool): Promise<void> => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Create time_entries table
    await client.query(`
      CREATE TABLE IF NOT EXISTS time_entries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        clock_in_time TIMESTAMP WITH TIME ZONE NOT NULL,
        clock_out_time TIMESTAMP WITH TIME ZONE,
        total_hours DECIMAL(5,2),
        regular_hours DECIMAL(5,2),
        overtime_hours DECIMAL(5,2),
        location_latitude DECIMAL(10,8),
        location_longitude DECIMAL(11,8),
        location_accuracy DECIMAL(8,2),
        status VARCHAR(20) NOT NULL CHECK (status IN ('ACTIVE', 'COMPLETED', 'PENDING_APPROVAL')),
        manual_entry BOOLEAN NOT NULL DEFAULT FALSE,
        approved_by UUID REFERENCES users(id),
        approved_at TIMESTAMP WITH TIME ZONE,
        notes TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create break_entries table
    await client.query(`
      CREATE TABLE IF NOT EXISTS break_entries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        time_entry_id UUID NOT NULL REFERENCES time_entries(id) ON DELETE CASCADE,
        break_type VARCHAR(20) NOT NULL CHECK (break_type IN ('LUNCH', 'SHORT_BREAK', 'PERSONAL')),
        start_time TIMESTAMP WITH TIME ZONE NOT NULL,
        end_time TIMESTAMP WITH TIME ZONE,
        duration INTEGER, -- in minutes
        paid BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for time_entries
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_time_entries_employee_id 
      ON time_entries(employee_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_time_entries_employee_date 
      ON time_entries(employee_id, DATE(clock_in_time))
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_time_entries_status 
      ON time_entries(status)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_time_entries_clock_in_time 
      ON time_entries(clock_in_time)
    `);

    // Create indexes for break_entries
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_break_entries_time_entry_id 
      ON break_entries(time_entry_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_break_entries_start_time 
      ON break_entries(start_time)
    `);

    // Create partial index for active time entries (performance optimization)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_time_entries_active 
      ON time_entries(employee_id, clock_in_time) 
      WHERE status = 'ACTIVE'
    `);

    // Create partial index for active breaks
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_break_entries_active 
      ON break_entries(time_entry_id, start_time) 
      WHERE end_time IS NULL
    `);

    // Add trigger to update updated_at timestamp
    await client.query(`
      CREATE OR REPLACE FUNCTION update_time_entries_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await client.query(`
      CREATE TRIGGER trigger_time_entries_updated_at
        BEFORE UPDATE ON time_entries
        FOR EACH ROW
        EXECUTE FUNCTION update_time_entries_updated_at();
    `);

    await client.query(`
      CREATE OR REPLACE FUNCTION update_break_entries_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await client.query(`
      CREATE TRIGGER trigger_break_entries_updated_at
        BEFORE UPDATE ON break_entries
        FOR EACH ROW
        EXECUTE FUNCTION update_break_entries_updated_at();
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

    // Drop triggers
    await client.query('DROP TRIGGER IF EXISTS trigger_break_entries_updated_at ON break_entries');
    await client.query('DROP TRIGGER IF EXISTS trigger_time_entries_updated_at ON time_entries');
    
    // Drop functions
    await client.query('DROP FUNCTION IF EXISTS update_break_entries_updated_at()');
    await client.query('DROP FUNCTION IF EXISTS update_time_entries_updated_at()');

    // Drop indexes
    await client.query('DROP INDEX IF EXISTS idx_break_entries_active');
    await client.query('DROP INDEX IF EXISTS idx_time_entries_active');
    await client.query('DROP INDEX IF EXISTS idx_break_entries_start_time');
    await client.query('DROP INDEX IF EXISTS idx_break_entries_time_entry_id');
    await client.query('DROP INDEX IF EXISTS idx_time_entries_clock_in_time');
    await client.query('DROP INDEX IF EXISTS idx_time_entries_status');
    await client.query('DROP INDEX IF EXISTS idx_time_entries_employee_date');
    await client.query('DROP INDEX IF EXISTS idx_time_entries_employee_id');

    // Drop tables
    await client.query('DROP TABLE IF EXISTS break_entries');
    await client.query('DROP TABLE IF EXISTS time_entries');

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};