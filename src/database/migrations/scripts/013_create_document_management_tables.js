export const up = async (pool) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // Create document categories enum
        await client.query(`
      CREATE TYPE document_category AS ENUM (
        'PERSONAL_IDENTIFICATION',
        'EMPLOYMENT_CONTRACT',
        'QUALIFICATION_CERTIFICATE',
        'TRAINING_RECORD',
        'PERFORMANCE_REVIEW',
        'PASSPORT_PHOTO',
        'EMERGENCY_CONTACT',
        'BANK_DETAILS',
        'TAX_INFORMATION',
        'INSURANCE_DOCUMENT',
        'OTHER'
      )
    `);
        // Create document status enum
        await client.query(`
      CREATE TYPE document_status AS ENUM (
        'PENDING',
        'APPROVED',
        'REJECTED',
        'EXPIRED',
        'ARCHIVED'
      )
    `);
        // Create annual leave status enum
        await client.query(`
      CREATE TYPE annual_leave_status AS ENUM (
        'DRAFT',
        'SUBMITTED',
        'MANAGER_APPROVED',
        'HR_APPROVED',
        'REJECTED'
      )
    `);
        // Create staff_documents table
        await client.query(`
      CREATE TABLE IF NOT EXISTS staff_documents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        category document_category NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        file_name VARCHAR(255) NOT NULL,
        file_path VARCHAR(500) NOT NULL,
        file_size BIGINT NOT NULL,
        mime_type VARCHAR(100) NOT NULL,
        status document_status NOT NULL DEFAULT 'PENDING',
        uploaded_by UUID NOT NULL REFERENCES users(id),
        approved_by UUID REFERENCES users(id),
        approved_at TIMESTAMP WITH TIME ZONE,
        expires_at TIMESTAMP WITH TIME ZONE,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

        -- Constraints
        CONSTRAINT chk_staff_documents_file_size CHECK (file_size > 0),
        CONSTRAINT chk_staff_documents_approval CHECK (
          (status = 'APPROVED' AND approved_by IS NOT NULL AND approved_at IS NOT NULL) OR
          (status != 'APPROVED')
        )
      )
    `);
        // Create annual_leave_plans table
        await client.query(`
      CREATE TABLE IF NOT EXISTS annual_leave_plans (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        year INTEGER NOT NULL,
        total_entitlement DECIMAL(5,2) NOT NULL,
        carried_over DECIMAL(5,2) NOT NULL DEFAULT 0,
        planned_leaves JSONB NOT NULL DEFAULT '[]',
        status annual_leave_status NOT NULL DEFAULT 'DRAFT',
        submitted_at TIMESTAMP WITH TIME ZONE,
        manager_approved_at TIMESTAMP WITH TIME ZONE,
        manager_approved_by UUID REFERENCES users(id),
        hr_approved_at TIMESTAMP WITH TIME ZONE,
        hr_approved_by UUID REFERENCES users(id),
        rejection_reason TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

        -- Constraints
        CONSTRAINT chk_annual_leave_plans_year CHECK (year >= 2000 AND year <= 2099),
        CONSTRAINT chk_annual_leave_plans_entitlement CHECK (total_entitlement >= 0),
        CONSTRAINT chk_annual_leave_plans_carried_over CHECK (carried_over >= 0),
        CONSTRAINT uq_annual_leave_plans_employee_year UNIQUE (employee_id, year)
      )
    `);
        // Create document_version_history table for audit trail
        await client.query(`
      CREATE TABLE IF NOT EXISTS document_version_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        document_id UUID NOT NULL REFERENCES staff_documents(id) ON DELETE CASCADE,
        version_number INTEGER NOT NULL,
        previous_file_path VARCHAR(500),
        action VARCHAR(50) NOT NULL CHECK (action IN ('UPLOAD', 'REPLACE', 'DELETE', 'STATUS_CHANGE')),
        changed_by UUID NOT NULL REFERENCES users(id),
        change_reason TEXT,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
        // Create storage bucket configurations table
        await client.query(`
      CREATE TABLE IF NOT EXISTS storage_bucket_configs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        bucket_name VARCHAR(100) NOT NULL UNIQUE,
        purpose VARCHAR(50) NOT NULL,
        max_file_size BIGINT NOT NULL,
        allowed_mime_types TEXT[] NOT NULL,
        retention_days INTEGER,
        is_public BOOLEAN NOT NULL DEFAULT FALSE,
        configuration JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
        // Create indexes for staff_documents
        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_staff_documents_employee_id
      ON staff_documents(employee_id)
    `);
        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_staff_documents_category
      ON staff_documents(category)
    `);
        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_staff_documents_status
      ON staff_documents(status)
    `);
        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_staff_documents_uploaded_by
      ON staff_documents(uploaded_by)
    `);
        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_staff_documents_expires_at
      ON staff_documents(expires_at)
    `);
        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_staff_documents_created_at
      ON staff_documents(created_at)
    `);
        // Create indexes for annual_leave_plans
        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_annual_leave_plans_employee_id
      ON annual_leave_plans(employee_id)
    `);
        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_annual_leave_plans_year
      ON annual_leave_plans(year)
    `);
        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_annual_leave_plans_status
      ON annual_leave_plans(status)
    `);
        // Create indexes for document_version_history
        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_document_version_history_document_id
      ON document_version_history(document_id)
    `);
        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_document_version_history_changed_by
      ON document_version_history(changed_by)
    `);
        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_document_version_history_created_at
      ON document_version_history(created_at)
    `);
        // Create indexes for storage_bucket_configs
        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_storage_bucket_configs_purpose
      ON storage_bucket_configs(purpose)
    `);
        // Add triggers to update updated_at timestamp
        await client.query(`
      CREATE OR REPLACE FUNCTION update_staff_documents_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
        await client.query(`
      CREATE TRIGGER trigger_staff_documents_updated_at
        BEFORE UPDATE ON staff_documents
        FOR EACH ROW
        EXECUTE FUNCTION update_staff_documents_updated_at();
    `);
        await client.query(`
      CREATE OR REPLACE FUNCTION update_annual_leave_plans_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
        await client.query(`
      CREATE TRIGGER trigger_annual_leave_plans_updated_at
        BEFORE UPDATE ON annual_leave_plans
        FOR EACH ROW
        EXECUTE FUNCTION update_annual_leave_plans_updated_at();
    `);
        await client.query(`
      CREATE OR REPLACE FUNCTION update_storage_bucket_configs_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
        await client.query(`
      CREATE TRIGGER trigger_storage_bucket_configs_updated_at
        BEFORE UPDATE ON storage_bucket_configs
        FOR EACH ROW
        EXECUTE FUNCTION update_storage_bucket_configs_updated_at();
    `);
        // Insert default storage bucket configurations
        await client.query(`
      INSERT INTO storage_bucket_configs (
        bucket_name,
        purpose,
        max_file_size,
        allowed_mime_types,
        retention_days,
        is_public,
        configuration
      ) VALUES
      (
        'employee-documents',
        'EMPLOYEE_DOCUMENTS',
        10485760, -- 10MB
        ARRAY[
          'application/pdf',
          'image/jpeg',
          'image/png',
          'image/gif',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ],
        2555, -- 7 years
        FALSE,
        '{"virus_scan": true, "encrypt_at_rest": true}'
      ),
      (
        'passport-photos',
        'PASSPORT_PHOTOS',
        5242880, -- 5MB
        ARRAY[
          'image/jpeg',
          'image/png'
        ],
        1095, -- 3 years
        FALSE,
        '{"max_width": 800, "max_height": 800, "quality": 85}'
      )
    `);
        // Add Row Level Security (RLS) policies
        await client.query(`
      ALTER TABLE staff_documents ENABLE ROW LEVEL SECURITY;
    `);
        await client.query(`
      ALTER TABLE annual_leave_plans ENABLE ROW LEVEL SECURITY;
    `);
        await client.query(`
      ALTER TABLE document_version_history ENABLE ROW LEVEL SECURITY;
    `);
        // Create RLS policies for staff_documents
        await client.query(`
      CREATE POLICY staff_documents_employee_access ON staff_documents
        FOR ALL
        TO authenticated
        USING (
          employee_id = (
            SELECT id FROM employees
            WHERE user_id = auth.uid()
          )
        );
    `);
        await client.query(`
      CREATE POLICY staff_documents_hr_access ON staff_documents
        FOR ALL
        TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM user_roles ur
            JOIN roles r ON ur.role_id = r.id
            WHERE ur.user_id = auth.uid() AND r.name IN ('HR_ADMIN', 'HR_MANAGER')
          )
        );
    `);
        await client.query(`
      CREATE POLICY staff_documents_manager_access ON staff_documents
        FOR SELECT
        TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM employees e
            WHERE e.id = employee_id
            AND e.manager_id = (
              SELECT id FROM employees
              WHERE user_id = auth.uid()
            )
          )
        );
    `);
        // Create RLS policies for annual_leave_plans
        await client.query(`
      CREATE POLICY annual_leave_plans_employee_access ON annual_leave_plans
        FOR ALL
        TO authenticated
        USING (
          employee_id = (
            SELECT id FROM employees
            WHERE user_id = auth.uid()
          )
        );
    `);
        await client.query(`
      CREATE POLICY annual_leave_plans_hr_access ON annual_leave_plans
        FOR ALL
        TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM user_roles ur
            JOIN roles r ON ur.role_id = r.id
            WHERE ur.user_id = auth.uid() AND r.name IN ('HR_ADMIN', 'HR_MANAGER')
          )
        );
    `);
        await client.query(`
      CREATE POLICY annual_leave_plans_manager_access ON annual_leave_plans
        FOR ALL
        TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM employees e
            WHERE e.id = employee_id
            AND e.manager_id = (
              SELECT id FROM employees
              WHERE user_id = auth.uid()
            )
          )
        );
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
        // Drop RLS policies
        await client.query('DROP POLICY IF EXISTS annual_leave_plans_manager_access ON annual_leave_plans');
        await client.query('DROP POLICY IF EXISTS annual_leave_plans_hr_access ON annual_leave_plans');
        await client.query('DROP POLICY IF EXISTS annual_leave_plans_employee_access ON annual_leave_plans');
        await client.query('DROP POLICY IF EXISTS staff_documents_manager_access ON staff_documents');
        await client.query('DROP POLICY IF EXISTS staff_documents_hr_access ON staff_documents');
        await client.query('DROP POLICY IF EXISTS staff_documents_employee_access ON staff_documents');
        // Disable RLS
        await client.query('ALTER TABLE document_version_history DISABLE ROW LEVEL SECURITY');
        await client.query('ALTER TABLE annual_leave_plans DISABLE ROW LEVEL SECURITY');
        await client.query('ALTER TABLE staff_documents DISABLE ROW LEVEL SECURITY');
        // Drop triggers
        await client.query('DROP TRIGGER IF EXISTS trigger_storage_bucket_configs_updated_at ON storage_bucket_configs');
        await client.query('DROP TRIGGER IF EXISTS trigger_annual_leave_plans_updated_at ON annual_leave_plans');
        await client.query('DROP TRIGGER IF EXISTS trigger_staff_documents_updated_at ON staff_documents');
        // Drop functions
        await client.query('DROP FUNCTION IF EXISTS update_storage_bucket_configs_updated_at()');
        await client.query('DROP FUNCTION IF EXISTS update_annual_leave_plans_updated_at()');
        await client.query('DROP FUNCTION IF EXISTS update_staff_documents_updated_at()');
        // Drop indexes for storage_bucket_configs
        await client.query('DROP INDEX IF EXISTS idx_storage_bucket_configs_purpose');
        // Drop indexes for document_version_history
        await client.query('DROP INDEX IF EXISTS idx_document_version_history_created_at');
        await client.query('DROP INDEX IF EXISTS idx_document_version_history_changed_by');
        await client.query('DROP INDEX IF EXISTS idx_document_version_history_document_id');
        // Drop indexes for annual_leave_plans
        await client.query('DROP INDEX IF EXISTS idx_annual_leave_plans_status');
        await client.query('DROP INDEX IF EXISTS idx_annual_leave_plans_year');
        await client.query('DROP INDEX IF EXISTS idx_annual_leave_plans_employee_id');
        // Drop indexes for staff_documents
        await client.query('DROP INDEX IF EXISTS idx_staff_documents_created_at');
        await client.query('DROP INDEX IF EXISTS idx_staff_documents_expires_at');
        await client.query('DROP INDEX IF EXISTS idx_staff_documents_uploaded_by');
        await client.query('DROP INDEX IF EXISTS idx_staff_documents_status');
        await client.query('DROP INDEX IF EXISTS idx_staff_documents_category');
        await client.query('DROP INDEX IF EXISTS idx_staff_documents_employee_id');
        // Drop tables
        await client.query('DROP TABLE IF EXISTS storage_bucket_configs');
        await client.query('DROP TABLE IF EXISTS document_version_history');
        await client.query('DROP TABLE IF EXISTS annual_leave_plans');
        await client.query('DROP TABLE IF EXISTS staff_documents');
        // Drop enums
        await client.query('DROP TYPE IF EXISTS annual_leave_status');
        await client.query('DROP TYPE IF EXISTS document_status');
        await client.query('DROP TYPE IF EXISTS document_category');
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
