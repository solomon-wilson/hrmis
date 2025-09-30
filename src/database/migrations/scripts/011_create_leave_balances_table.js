export const up = async (pool) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // Create leave_balances table
        await client.query(`
      CREATE TABLE IF NOT EXISTS leave_balances (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        leave_type_id UUID NOT NULL REFERENCES leave_types(id) ON DELETE RESTRICT,
        current_balance DECIMAL(8,2) NOT NULL DEFAULT 0,
        accrual_rate DECIMAL(6,2) NOT NULL DEFAULT 0,
        accrual_period VARCHAR(20) NOT NULL CHECK (accrual_period IN ('MONTHLY', 'BIWEEKLY', 'ANNUAL', 'PER_PAY_PERIOD')),
        max_balance DECIMAL(8,2),
        carryover_limit DECIMAL(8,2),
        last_accrual_date DATE NOT NULL,
        year_to_date_used DECIMAL(8,2) NOT NULL DEFAULT 0,
        year_to_date_accrued DECIMAL(8,2) NOT NULL DEFAULT 0,
        effective_date DATE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        
        -- Constraints
        CONSTRAINT chk_leave_balances_positive_balance CHECK (current_balance >= 0),
        CONSTRAINT chk_leave_balances_positive_accrual CHECK (accrual_rate >= 0),
        CONSTRAINT chk_leave_balances_positive_ytd CHECK (year_to_date_used >= 0 AND year_to_date_accrued >= 0),
        CONSTRAINT chk_leave_balances_max_balance CHECK (max_balance IS NULL OR max_balance >= 0),
        CONSTRAINT chk_leave_balances_carryover CHECK (carryover_limit IS NULL OR carryover_limit >= 0),
        
        -- Unique constraint to prevent duplicate balances per employee/leave type
        UNIQUE(employee_id, leave_type_id)
      )
    `);
        // Create accrual_transactions table for audit trail
        await client.query(`
      CREATE TABLE IF NOT EXISTS accrual_transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        leave_balance_id UUID NOT NULL REFERENCES leave_balances(id) ON DELETE CASCADE,
        transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('ACCRUAL', 'USAGE', 'ADJUSTMENT', 'CARRYOVER')),
        amount DECIMAL(8,2) NOT NULL,
        description TEXT NOT NULL,
        transaction_date DATE NOT NULL,
        related_request_id UUID REFERENCES leave_requests(id),
        created_by UUID NOT NULL REFERENCES users(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
        // Create indexes for leave_balances
        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_leave_balances_employee_id 
      ON leave_balances(employee_id)
    `);
        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_leave_balances_leave_type_id 
      ON leave_balances(leave_type_id)
    `);
        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_leave_balances_last_accrual_date 
      ON leave_balances(last_accrual_date)
    `);
        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_leave_balances_effective_date 
      ON leave_balances(effective_date)
    `);
        // Create indexes for accrual_transactions
        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_accrual_transactions_leave_balance_id 
      ON accrual_transactions(leave_balance_id)
    `);
        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_accrual_transactions_transaction_date 
      ON accrual_transactions(transaction_date)
    `);
        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_accrual_transactions_transaction_type 
      ON accrual_transactions(transaction_type)
    `);
        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_accrual_transactions_related_request_id 
      ON accrual_transactions(related_request_id)
    `);
        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_accrual_transactions_created_by 
      ON accrual_transactions(created_by)
    `);
        // Add triggers to update updated_at timestamp
        await client.query(`
      CREATE OR REPLACE FUNCTION update_leave_balances_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
        await client.query(`
      CREATE TRIGGER trigger_leave_balances_updated_at
        BEFORE UPDATE ON leave_balances
        FOR EACH ROW
        EXECUTE FUNCTION update_leave_balances_updated_at();
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
        await client.query('DROP TRIGGER IF EXISTS trigger_leave_balances_updated_at ON leave_balances');
        // Drop function
        await client.query('DROP FUNCTION IF EXISTS update_leave_balances_updated_at()');
        // Drop indexes for accrual_transactions
        await client.query('DROP INDEX IF EXISTS idx_accrual_transactions_created_by');
        await client.query('DROP INDEX IF EXISTS idx_accrual_transactions_related_request_id');
        await client.query('DROP INDEX IF EXISTS idx_accrual_transactions_transaction_type');
        await client.query('DROP INDEX IF EXISTS idx_accrual_transactions_transaction_date');
        await client.query('DROP INDEX IF EXISTS idx_accrual_transactions_leave_balance_id');
        // Drop indexes for leave_balances
        await client.query('DROP INDEX IF EXISTS idx_leave_balances_effective_date');
        await client.query('DROP INDEX IF EXISTS idx_leave_balances_last_accrual_date');
        await client.query('DROP INDEX IF EXISTS idx_leave_balances_leave_type_id');
        await client.query('DROP INDEX IF EXISTS idx_leave_balances_employee_id');
        // Drop tables
        await client.query('DROP TABLE IF EXISTS accrual_transactions');
        await client.query('DROP TABLE IF EXISTS leave_balances');
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
