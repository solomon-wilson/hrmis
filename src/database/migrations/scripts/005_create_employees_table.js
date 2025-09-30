export const createEmployeesTable = {
    id: '005',
    name: 'Create employees table',
    async up(client) {
        const query = `
      -- Create employee status enum
      CREATE TYPE employee_status AS ENUM ('ACTIVE', 'INACTIVE', 'TERMINATED', 'ON_LEAVE');
      CREATE TYPE employment_type AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN');

      CREATE TABLE IF NOT EXISTS employees (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_id VARCHAR(20) UNIQUE NOT NULL,
        
        -- Personal Information
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        phone VARCHAR(20),
        date_of_birth DATE,
        social_security_number VARCHAR(255), -- Encrypted
        
        -- Address Information
        address_line1 VARCHAR(255),
        address_line2 VARCHAR(255),
        city VARCHAR(100),
        state VARCHAR(50),
        postal_code VARCHAR(20),
        country VARCHAR(100) DEFAULT 'United States',
        
        -- Emergency Contact
        emergency_contact_name VARCHAR(200),
        emergency_contact_phone VARCHAR(20),
        emergency_contact_relationship VARCHAR(50),
        
        -- Job Information
        job_title VARCHAR(150) NOT NULL,
        department_id UUID REFERENCES departments(id),
        manager_id UUID REFERENCES employees(id),
        start_date DATE NOT NULL,
        end_date DATE,
        employment_type employment_type NOT NULL DEFAULT 'FULL_TIME',
        salary DECIMAL(12,2), -- Encrypted in application layer
        location VARCHAR(255),
        
        -- Status Information
        status employee_status NOT NULL DEFAULT 'ACTIVE',
        status_effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
        status_reason VARCHAR(500),
        status_notes TEXT,
        
        -- System Fields
        user_id UUID REFERENCES users(id), -- Link to system user account
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        created_by UUID REFERENCES users(id),
        updated_by UUID REFERENCES users(id)
      );

      -- Create indexes for performance
      CREATE INDEX IF NOT EXISTS idx_employees_employee_id ON employees(employee_id);
      CREATE INDEX IF NOT EXISTS idx_employees_email ON employees(email);
      CREATE INDEX IF NOT EXISTS idx_employees_name ON employees(first_name, last_name);
      CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department_id);
      CREATE INDEX IF NOT EXISTS idx_employees_manager ON employees(manager_id);
      CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status);
      CREATE INDEX IF NOT EXISTS idx_employees_employment_type ON employees(employment_type);
      CREATE INDEX IF NOT EXISTS idx_employees_start_date ON employees(start_date);
      CREATE INDEX IF NOT EXISTS idx_employees_user_id ON employees(user_id);

      -- Full text search index for employee search
      CREATE INDEX IF NOT EXISTS idx_employees_search ON employees 
        USING gin(to_tsvector('english', first_name || ' ' || last_name || ' ' || email || ' ' || COALESCE(job_title, '')));

      -- Create trigger for updated_at
      DROP TRIGGER IF EXISTS update_employees_updated_at ON employees;
      CREATE TRIGGER update_employees_updated_at
        BEFORE UPDATE ON employees
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();

      -- Add constraint to prevent self-referencing manager
      ALTER TABLE employees ADD CONSTRAINT chk_no_self_manager 
        CHECK (id != manager_id);

      -- Add foreign key constraint for manager after table creation
      -- (This allows for circular references during data insertion)
      ALTER TABLE departments ADD CONSTRAINT fk_departments_manager 
        FOREIGN KEY (manager_id) REFERENCES employees(id) DEFERRABLE INITIALLY DEFERRED;
    `;
        await client.query(query);
    },
    async down(client) {
        const query = `
      -- Remove foreign key constraint from departments
      ALTER TABLE departments DROP CONSTRAINT IF EXISTS fk_departments_manager;
      
      DROP TRIGGER IF EXISTS update_employees_updated_at ON employees;
      DROP TABLE IF EXISTS employees CASCADE;
      DROP TYPE IF EXISTS employee_status CASCADE;
      DROP TYPE IF EXISTS employment_type CASCADE;
    `;
        await client.query(query);
    }
};
