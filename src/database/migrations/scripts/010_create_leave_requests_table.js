export const up = async (pool) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // Create leave_requests table
        await client.query(`
      CREATE TABLE IF NOT EXISTS leave_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        leave_type_id UUID NOT NULL REFERENCES leave_types(id) ON DELETE RESTRICT,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        total_days DECIMAL(4,2) NOT NULL,
        total_hours DECIMAL(6,2) NOT NULL,
        reason TEXT,
        status VARCHAR(20) NOT NULL CHECK (status IN ('PENDING', 'APPROVED', 'DENIED', 'CANCELLED')),
        submitted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        reviewed_by UUID REFERENCES users(id),
        reviewed_at TIMESTAMP WITH TIME ZONE,
        review_notes TEXT,
        attachments TEXT[], -- Array of file paths/URLs
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        
        -- Constraints
        CONSTRAINT chk_leave_requests_dates CHECK (end_date >= start_date),
        CONSTRAINT chk_leave_requests_positive_days CHECK (total_days > 0),
        CONSTRAINT chk_leave_requests_positive_hours CHECK (total_hours > 0),
        CONSTRAINT chk_leave_requests_review_data CHECK (
          (status IN ('APPROVED', 'DENIED') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL) OR
          (status IN ('PENDING', 'CANCELLED'))
        )
      )
    `);
        // Create indexes for leave_requests
        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_leave_requests_employee_id 
      ON leave_requests(employee_id)
    `);
        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_leave_requests_leave_type_id 
      ON leave_requests(leave_type_id)
    `);
        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_leave_requests_status 
      ON leave_requests(status)
    `);
        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_leave_requests_submitted_at 
      ON leave_requests(submitted_at)
    `);
        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_leave_requests_date_range 
      ON leave_requests(start_date, end_date)
    `);
        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_leave_requests_reviewed_by 
      ON leave_requests(reviewed_by)
    `);
        // Create partial index for pending requests (performance optimization)
        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_leave_requests_pending 
      ON leave_requests(employee_id, submitted_at) 
      WHERE status = 'PENDING'
    `);
        // Create index for date overlap queries
        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_leave_requests_date_overlap 
      ON leave_requests(employee_id, start_date, end_date) 
      WHERE status IN ('PENDING', 'APPROVED')
    `);
        // Add trigger to update updated_at timestamp
        await client.query(`
      CREATE OR REPLACE FUNCTION update_leave_requests_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
        await client.query(`
      CREATE TRIGGER trigger_leave_requests_updated_at
        BEFORE UPDATE ON leave_requests
        FOR EACH ROW
        EXECUTE FUNCTION update_leave_requests_updated_at();
    `);
        await client.query('COMMIT');
    }
    catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
    finally {
        client.release();
    }
};
export const down = async (pool) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // Drop trigger
        await client.query('DROP TRIGGER IF EXISTS trigger_leave_requests_updated_at ON leave_requests');
        // Drop function
        await client.query('DROP FUNCTION IF EXISTS update_leave_requests_updated_at()');
        // Drop indexes
        await client.query('DROP INDEX IF EXISTS idx_leave_requests_date_overlap');
        await client.query('DROP INDEX IF EXISTS idx_leave_requests_pending');
        await client.query('DROP INDEX IF EXISTS idx_leave_requests_reviewed_by');
        await client.query('DROP INDEX IF EXISTS idx_leave_requests_date_range');
        await client.query('DROP INDEX IF EXISTS idx_leave_requests_submitted_at');
        await client.query('DROP INDEX IF EXISTS idx_leave_requests_status');
        await client.query('DROP INDEX IF EXISTS idx_leave_requests_leave_type_id');
        await client.query('DROP INDEX IF EXISTS idx_leave_requests_employee_id');
        // Drop table
        await client.query('DROP TABLE IF EXISTS leave_requests');
        await client.query('COMMIT');
    }
    catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
    finally {
        client.release();
    }
};
