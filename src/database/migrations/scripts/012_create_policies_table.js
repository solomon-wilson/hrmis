export const up = async (pool) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // Create leave_policies table
        await client.query(`
      CREATE TABLE IF NOT EXISTS leave_policies (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(200) NOT NULL,
        leave_type_id UUID NOT NULL REFERENCES leave_types(id) ON DELETE RESTRICT,
        effective_date DATE NOT NULL,
        end_date DATE,
        applicable_groups TEXT[] NOT NULL, -- Array of group identifiers
        description TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        
        -- Constraints
        CONSTRAINT chk_leave_policies_dates CHECK (end_date IS NULL OR end_date > effective_date)
      )
    `);
        // Create eligibility_rules table
        await client.query(`
      CREATE TABLE IF NOT EXISTS eligibility_rules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        leave_policy_id UUID NOT NULL REFERENCES leave_policies(id) ON DELETE CASCADE,
        rule_type VARCHAR(50) NOT NULL CHECK (rule_type IN ('TENURE', 'EMPLOYMENT_TYPE', 'DEPARTMENT', 'CUSTOM')),
        operator VARCHAR(20) NOT NULL CHECK (operator IN ('EQUALS', 'GREATER_THAN', 'LESS_THAN', 'IN', 'NOT_IN')),
        value TEXT NOT NULL,
        description TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
        // Create accrual_rules table
        await client.query(`
      CREATE TABLE IF NOT EXISTS accrual_rules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        leave_policy_id UUID NOT NULL REFERENCES leave_policies(id) ON DELETE CASCADE,
        accrual_rate DECIMAL(6,2) NOT NULL,
        accrual_period VARCHAR(20) NOT NULL CHECK (accrual_period IN ('MONTHLY', 'BIWEEKLY', 'ANNUAL', 'PER_PAY_PERIOD')),
        max_balance DECIMAL(8,2),
        carryover_limit DECIMAL(8,2),
        waiting_period_days INTEGER DEFAULT 0,
        description TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        
        -- Constraints
        CONSTRAINT chk_accrual_rules_positive_rate CHECK (accrual_rate >= 0),
        CONSTRAINT chk_accrual_rules_positive_max CHECK (max_balance IS NULL OR max_balance >= 0),
        CONSTRAINT chk_accrual_rules_positive_carryover CHECK (carryover_limit IS NULL OR carryover_limit >= 0),
        CONSTRAINT chk_accrual_rules_waiting_period CHECK (waiting_period_days >= 0)
      )
    `);
        // Create usage_rules table
        await client.query(`
      CREATE TABLE IF NOT EXISTS usage_rules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        leave_policy_id UUID NOT NULL REFERENCES leave_policies(id) ON DELETE CASCADE,
        rule_type VARCHAR(50) NOT NULL CHECK (rule_type IN ('MAX_CONSECUTIVE_DAYS', 'ADVANCE_NOTICE', 'BLACKOUT_PERIOD', 'MINIMUM_INCREMENT')),
        value TEXT NOT NULL,
        description TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
        // Create overtime_policies table
        await client.query(`
      CREATE TABLE IF NOT EXISTS overtime_policies (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(200) NOT NULL,
        daily_overtime_threshold DECIMAL(4,2) NOT NULL,
        weekly_overtime_threshold DECIMAL(4,2) NOT NULL,
        overtime_multiplier DECIMAL(3,2) NOT NULL,
        double_time_threshold DECIMAL(4,2),
        double_time_multiplier DECIMAL(3,2),
        applicable_groups TEXT[] NOT NULL,
        effective_date DATE NOT NULL,
        end_date DATE,
        description TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        
        -- Constraints
        CONSTRAINT chk_overtime_policies_dates CHECK (end_date IS NULL OR end_date > effective_date),
        CONSTRAINT chk_overtime_policies_positive_thresholds CHECK (
          daily_overtime_threshold >= 0 AND 
          weekly_overtime_threshold >= 0
        ),
        CONSTRAINT chk_overtime_policies_multipliers CHECK (
          overtime_multiplier >= 1 AND 
          (double_time_multiplier IS NULL OR double_time_multiplier >= 1)
        ),
        CONSTRAINT chk_overtime_policies_double_time CHECK (
          double_time_threshold IS NULL OR double_time_threshold > daily_overtime_threshold
        )
      )
    `);
        // Create indexes for leave_policies
        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_leave_policies_leave_type_id 
      ON leave_policies(leave_type_id)
    `);
        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_leave_policies_effective_date 
      ON leave_policies(effective_date)
    `);
        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_leave_policies_active 
      ON leave_policies(is_active)
    `);
        // Create indexes for eligibility_rules
        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_eligibility_rules_policy_id 
      ON eligibility_rules(leave_policy_id)
    `);
        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_eligibility_rules_type 
      ON eligibility_rules(rule_type)
    `);
        // Create indexes for accrual_rules
        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_accrual_rules_policy_id 
      ON accrual_rules(leave_policy_id)
    `);
        // Create indexes for usage_rules
        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_usage_rules_policy_id 
      ON usage_rules(leave_policy_id)
    `);
        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_usage_rules_active 
      ON usage_rules(is_active)
    `);
        // Create indexes for overtime_policies
        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_overtime_policies_effective_date 
      ON overtime_policies(effective_date)
    `);
        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_overtime_policies_active 
      ON overtime_policies(is_active)
    `);
        // Add triggers to update updated_at timestamp
        await client.query(`
      CREATE OR REPLACE FUNCTION update_leave_policies_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
        await client.query(`
      CREATE TRIGGER trigger_leave_policies_updated_at
        BEFORE UPDATE ON leave_policies
        FOR EACH ROW
        EXECUTE FUNCTION update_leave_policies_updated_at();
    `);
        await client.query(`
      CREATE OR REPLACE FUNCTION update_overtime_policies_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
        await client.query(`
      CREATE TRIGGER trigger_overtime_policies_updated_at
        BEFORE UPDATE ON overtime_policies
        FOR EACH ROW
        EXECUTE FUNCTION update_overtime_policies_updated_at();
    `);
        // Insert default overtime policy
        await client.query(`
      INSERT INTO overtime_policies (
        name, 
        daily_overtime_threshold, 
        weekly_overtime_threshold, 
        overtime_multiplier, 
        double_time_threshold, 
        double_time_multiplier, 
        applicable_groups, 
        effective_date, 
        description
      )
      VALUES (
        'Standard Overtime Policy',
        8.0,
        40.0,
        1.5,
        12.0,
        2.0,
        ARRAY['ALL'],
        CURRENT_DATE,
        'Standard overtime policy with time and a half after 8 hours daily or 40 hours weekly, double time after 12 hours daily'
      )
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
        // Drop triggers
        await client.query('DROP TRIGGER IF EXISTS trigger_overtime_policies_updated_at ON overtime_policies');
        await client.query('DROP TRIGGER IF EXISTS trigger_leave_policies_updated_at ON leave_policies');
        // Drop functions
        await client.query('DROP FUNCTION IF EXISTS update_overtime_policies_updated_at()');
        await client.query('DROP FUNCTION IF EXISTS update_leave_policies_updated_at()');
        // Drop indexes for overtime_policies
        await client.query('DROP INDEX IF EXISTS idx_overtime_policies_active');
        await client.query('DROP INDEX IF EXISTS idx_overtime_policies_effective_date');
        // Drop indexes for usage_rules
        await client.query('DROP INDEX IF EXISTS idx_usage_rules_active');
        await client.query('DROP INDEX IF EXISTS idx_usage_rules_policy_id');
        // Drop indexes for accrual_rules
        await client.query('DROP INDEX IF EXISTS idx_accrual_rules_policy_id');
        // Drop indexes for eligibility_rules
        await client.query('DROP INDEX IF EXISTS idx_eligibility_rules_type');
        await client.query('DROP INDEX IF EXISTS idx_eligibility_rules_policy_id');
        // Drop indexes for leave_policies
        await client.query('DROP INDEX IF EXISTS idx_leave_policies_active');
        await client.query('DROP INDEX IF EXISTS idx_leave_policies_effective_date');
        await client.query('DROP INDEX IF EXISTS idx_leave_policies_leave_type_id');
        // Drop tables
        await client.query('DROP TABLE IF EXISTS overtime_policies');
        await client.query('DROP TABLE IF EXISTS usage_rules');
        await client.query('DROP TABLE IF EXISTS accrual_rules');
        await client.query('DROP TABLE IF EXISTS eligibility_rules');
        await client.query('DROP TABLE IF EXISTS leave_policies');
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
