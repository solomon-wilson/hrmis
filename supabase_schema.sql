-- =============================================
-- Employee Management System - Supabase Schema
-- =============================================
-- This file contains the complete database schema for Supabase
-- Run this in your Supabase SQL editor to set up the database

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- CUSTOM TYPES
-- =============================================

-- Employee status enum
CREATE TYPE employee_status AS ENUM ('ACTIVE', 'INACTIVE', 'TERMINATED', 'ON_LEAVE');

-- Employment type enum
CREATE TYPE employment_type AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN');

-- Leave status enum
CREATE TYPE leave_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- Leave type enum
CREATE TYPE leave_type_enum AS ENUM ('VACATION', 'SICK', 'PERSONAL', 'MATERNITY', 'PATERNITY', 'BEREAVEMENT', 'OTHER');

-- Time entry status enum
CREATE TYPE time_entry_status AS ENUM ('ACTIVE', 'COMPLETED', 'PENDING_APPROVAL');

-- Break type enum
CREATE TYPE break_type AS ENUM ('LUNCH', 'SHORT_BREAK', 'PERSONAL');

-- Document management enums
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
);

CREATE TYPE document_status AS ENUM (
  'PENDING',
  'APPROVED',
  'REJECTED',
  'EXPIRED',
  'ARCHIVED'
);

CREATE TYPE annual_leave_status AS ENUM (
  'DRAFT',
  'SUBMITTED',
  'MANAGER_APPROVED',
  'HR_APPROVED',
  'REJECTED'
);

-- =============================================
-- UTILITY FUNCTIONS
-- =============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- =============================================
-- CORE TABLES
-- =============================================

-- Departments table
CREATE TABLE departments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(200) UNIQUE NOT NULL,
  description TEXT,
  manager_id UUID, -- Will add foreign key after employees table
  budget DECIMAL(15,2),
  location VARCHAR(255),
  cost_center VARCHAR(50),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Employees table
CREATE TABLE employees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id VARCHAR(20) UNIQUE NOT NULL,

  -- Personal Information
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(20),
  date_of_birth DATE,
  social_security_number VARCHAR(255), -- Should be encrypted at application level

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
  salary DECIMAL(12,2), -- Should be encrypted at application level
  location VARCHAR(255),

  -- Status Information
  status employee_status NOT NULL DEFAULT 'ACTIVE',
  status_effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status_reason VARCHAR(500),
  status_notes TEXT,

  -- System Fields (linked to Supabase auth)
  auth_user_id UUID REFERENCES auth.users(id), -- Links to Supabase auth
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID,
  updated_by UUID,

  -- Constraints
  CONSTRAINT chk_no_self_manager CHECK (id != manager_id)
);

-- Employee status history table
CREATE TABLE employee_status_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  previous_status employee_status,
  new_status employee_status NOT NULL,
  effective_date DATE NOT NULL,
  reason VARCHAR(500),
  notes TEXT,
  changed_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Audit logs table
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  action VARCHAR(50) NOT NULL,
  changes JSONB,
  performed_by UUID,
  performed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  ip_address INET,
  user_agent TEXT,
  correlation_id VARCHAR(255)
);

-- =============================================
-- TIME & ATTENDANCE TABLES
-- =============================================

-- Time entries table
CREATE TABLE time_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  clock_in_time TIMESTAMP WITH TIME ZONE NOT NULL,
  clock_out_time TIMESTAMP WITH TIME ZONE,
  total_hours DECIMAL(5,2),
  regular_hours DECIMAL(5,2),
  overtime_hours DECIMAL(5,2),
  location_latitude DECIMAL(10,8),
  location_longitude DECIMAL(11,8),
  location_accuracy DECIMAL(8,2),
  status time_entry_status NOT NULL DEFAULT 'ACTIVE',
  manual_entry BOOLEAN NOT NULL DEFAULT FALSE,
  approved_by UUID REFERENCES employees(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Break entries table
CREATE TABLE break_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  time_entry_id UUID NOT NULL REFERENCES time_entries(id) ON DELETE CASCADE,
  break_type break_type NOT NULL,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE,
  duration INTEGER, -- in minutes
  paid BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Leave types table
CREATE TABLE leave_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) UNIQUE NOT NULL,
  leave_type leave_type_enum NOT NULL,
  description TEXT,
  max_days_per_year INTEGER,
  carry_over_days INTEGER DEFAULT 0,
  requires_approval BOOLEAN DEFAULT true,
  advance_notice_days INTEGER DEFAULT 0,
  can_be_half_day BOOLEAN DEFAULT true,
  accrual_rate DECIMAL(5,4), -- days per pay period
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Leave requests table
CREATE TABLE leave_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type_id UUID NOT NULL REFERENCES leave_types(id),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_days DECIMAL(3,1) NOT NULL,
  is_half_day BOOLEAN DEFAULT false,
  reason TEXT,
  status leave_status NOT NULL DEFAULT 'PENDING',
  approved_by UUID REFERENCES employees(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  employee_notes TEXT,
  manager_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Leave balances table
CREATE TABLE leave_balances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type_id UUID NOT NULL REFERENCES leave_types(id),
  year INTEGER NOT NULL,
  allocated_days DECIMAL(5,2) NOT NULL DEFAULT 0,
  used_days DECIMAL(5,2) NOT NULL DEFAULT 0,
  pending_days DECIMAL(5,2) NOT NULL DEFAULT 0,
  carried_over_days DECIMAL(5,2) NOT NULL DEFAULT 0,
  expires_at DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  -- Ensure one balance per employee per leave type per year
  UNIQUE(employee_id, leave_type_id, year)
);

-- HR policies table
CREATE TABLE policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(200) UNIQUE NOT NULL,
  category VARCHAR(100) NOT NULL,
  description TEXT,
  content TEXT NOT NULL,
  version VARCHAR(20) NOT NULL DEFAULT '1.0',
  effective_date DATE NOT NULL,
  expiry_date DATE,
  requires_acknowledgment BOOLEAN DEFAULT false,
  applies_to_all BOOLEAN DEFAULT true,
  target_departments UUID[], -- Array of department IDs
  target_employment_types employment_type[],
  is_active BOOLEAN DEFAULT true,
  created_by UUID,
  approved_by UUID,
  approved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- DOCUMENT MANAGEMENT TABLES
-- =============================================

-- Staff documents table
CREATE TABLE staff_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  category document_category NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  status document_status NOT NULL DEFAULT 'PENDING',
  uploaded_by UUID NOT NULL REFERENCES employees(id),
  approved_by UUID REFERENCES employees(id),
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
);

-- Annual leave plans table
CREATE TABLE annual_leave_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  total_entitlement DECIMAL(5,2) NOT NULL,
  carried_over DECIMAL(5,2) NOT NULL DEFAULT 0,
  planned_leaves JSONB NOT NULL DEFAULT '[]',
  status annual_leave_status NOT NULL DEFAULT 'DRAFT',
  submitted_at TIMESTAMP WITH TIME ZONE,
  manager_approved_at TIMESTAMP WITH TIME ZONE,
  manager_approved_by UUID REFERENCES employees(id),
  hr_approved_at TIMESTAMP WITH TIME ZONE,
  hr_approved_by UUID REFERENCES employees(id),
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  -- Constraints
  CONSTRAINT chk_annual_leave_plans_year CHECK (year >= 2000 AND year <= 2099),
  CONSTRAINT chk_annual_leave_plans_entitlement CHECK (total_entitlement >= 0),
  CONSTRAINT chk_annual_leave_plans_carried_over CHECK (carried_over >= 0),
  CONSTRAINT uq_annual_leave_plans_employee_year UNIQUE (employee_id, year)
);

-- Document version history table for audit trail
CREATE TABLE document_version_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES staff_documents(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL DEFAULT 1,
  action VARCHAR(50) NOT NULL, -- 'CREATED', 'UPDATED', 'APPROVED', 'REJECTED', 'DELETED'
  changes JSONB DEFAULT '{}',
  previous_status document_status,
  new_status document_status,
  performed_by UUID NOT NULL REFERENCES employees(id),
  performed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  reason TEXT,

  -- Constraints
  CONSTRAINT chk_document_version_history_version CHECK (version_number > 0)
);

-- =============================================
-- INDEXES FOR PERFORMANCE
-- =============================================

-- Departments indexes
CREATE INDEX idx_departments_manager ON departments(manager_id);
CREATE INDEX idx_departments_active ON departments(is_active);

-- Employees indexes
CREATE INDEX idx_employees_employee_id ON employees(employee_id);
CREATE INDEX idx_employees_email ON employees(email);
CREATE INDEX idx_employees_name ON employees(first_name, last_name);
CREATE INDEX idx_employees_department ON employees(department_id);
CREATE INDEX idx_employees_manager ON employees(manager_id);
CREATE INDEX idx_employees_status ON employees(status);
CREATE INDEX idx_employees_employment_type ON employees(employment_type);
CREATE INDEX idx_employees_start_date ON employees(start_date);
CREATE INDEX idx_employees_auth_user_id ON employees(auth_user_id);

-- Full text search index for employees
CREATE INDEX idx_employees_search ON employees
  USING gin(to_tsvector('english', first_name || ' ' || last_name || ' ' || email || ' ' || COALESCE(job_title, '')));

-- Employee status history indexes
CREATE INDEX idx_employee_status_history_employee ON employee_status_history(employee_id);
CREATE INDEX idx_employee_status_history_date ON employee_status_history(effective_date);

-- Audit logs indexes
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_performed_by ON audit_logs(performed_by);
CREATE INDEX idx_audit_logs_performed_at ON audit_logs(performed_at);
CREATE INDEX idx_audit_logs_correlation_id ON audit_logs(correlation_id);

-- Time entries indexes
CREATE INDEX idx_time_entries_employee_id ON time_entries(employee_id);
CREATE INDEX idx_time_entries_employee_date ON time_entries(employee_id, DATE(clock_in_time));
CREATE INDEX idx_time_entries_status ON time_entries(status);
CREATE INDEX idx_time_entries_clock_in_time ON time_entries(clock_in_time);
CREATE INDEX idx_time_entries_active ON time_entries(employee_id, clock_in_time) WHERE status = 'ACTIVE';

-- Break entries indexes
CREATE INDEX idx_break_entries_time_entry_id ON break_entries(time_entry_id);
CREATE INDEX idx_break_entries_start_time ON break_entries(start_time);
CREATE INDEX idx_break_entries_active ON break_entries(time_entry_id, start_time) WHERE end_time IS NULL;

-- Leave requests indexes
CREATE INDEX idx_leave_requests_employee ON leave_requests(employee_id);
CREATE INDEX idx_leave_requests_status ON leave_requests(status);
CREATE INDEX idx_leave_requests_dates ON leave_requests(start_date, end_date);
CREATE INDEX idx_leave_requests_leave_type ON leave_requests(leave_type_id);

-- Leave balances indexes
CREATE INDEX idx_leave_balances_employee ON leave_balances(employee_id);
CREATE INDEX idx_leave_balances_year ON leave_balances(year);
CREATE INDEX idx_leave_balances_leave_type ON leave_balances(leave_type_id);

-- Policies indexes
CREATE INDEX idx_policies_category ON policies(category);
CREATE INDEX idx_policies_effective_date ON policies(effective_date);
CREATE INDEX idx_policies_active ON policies(is_active);

-- Staff documents indexes
CREATE INDEX idx_staff_documents_employee ON staff_documents(employee_id);
CREATE INDEX idx_staff_documents_category ON staff_documents(category);
CREATE INDEX idx_staff_documents_status ON staff_documents(status);
CREATE INDEX idx_staff_documents_uploaded_by ON staff_documents(uploaded_by);
CREATE INDEX idx_staff_documents_expires_at ON staff_documents(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX idx_staff_documents_created_at ON staff_documents(created_at);

-- Annual leave plans indexes
CREATE INDEX idx_annual_leave_plans_employee ON annual_leave_plans(employee_id);
CREATE INDEX idx_annual_leave_plans_year ON annual_leave_plans(year);
CREATE INDEX idx_annual_leave_plans_status ON annual_leave_plans(status);
CREATE INDEX idx_annual_leave_plans_created_at ON annual_leave_plans(created_at);

-- Document version history indexes
CREATE INDEX idx_document_version_history_document ON document_version_history(document_id);
CREATE INDEX idx_document_version_history_performed_by ON document_version_history(performed_by);
CREATE INDEX idx_document_version_history_performed_at ON document_version_history(performed_at);
CREATE INDEX idx_document_version_history_action ON document_version_history(action);

-- =============================================
-- TRIGGERS FOR UPDATED_AT
-- =============================================

-- Departments
CREATE TRIGGER update_departments_updated_at
  BEFORE UPDATE ON departments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Employees
CREATE TRIGGER update_employees_updated_at
  BEFORE UPDATE ON employees
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Time entries
CREATE TRIGGER update_time_entries_updated_at
  BEFORE UPDATE ON time_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Break entries
CREATE TRIGGER update_break_entries_updated_at
  BEFORE UPDATE ON break_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Leave types
CREATE TRIGGER update_leave_types_updated_at
  BEFORE UPDATE ON leave_types
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Leave requests
CREATE TRIGGER update_leave_requests_updated_at
  BEFORE UPDATE ON leave_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Leave balances
CREATE TRIGGER update_leave_balances_updated_at
  BEFORE UPDATE ON leave_balances
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Policies
CREATE TRIGGER update_policies_updated_at
  BEFORE UPDATE ON policies
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Staff documents
CREATE TRIGGER update_staff_documents_updated_at
  BEFORE UPDATE ON staff_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Annual leave plans
CREATE TRIGGER update_annual_leave_plans_updated_at
  BEFORE UPDATE ON annual_leave_plans
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- FOREIGN KEY CONSTRAINTS (Deferred)
-- =============================================

-- Add departments manager foreign key (deferred to allow circular references)
ALTER TABLE departments
ADD CONSTRAINT fk_departments_manager
FOREIGN KEY (manager_id) REFERENCES employees(id)
DEFERRABLE INITIALLY DEFERRED;

-- =============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================

-- Enable RLS on all tables
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE break_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE annual_leave_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_version_history ENABLE ROW LEVEL SECURITY;

-- Helper function to get user roles from metadata
CREATE OR REPLACE FUNCTION get_user_roles()
RETURNS text[] AS $$
BEGIN
  RETURN COALESCE((auth.jwt() ->> 'user_metadata')::jsonb ->> 'roles', '[]')::jsonb::text[];
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to get user's employee ID
CREATE OR REPLACE FUNCTION get_user_employee_id()
RETURNS UUID AS $$
BEGIN
  RETURN (SELECT id FROM employees WHERE auth_user_id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to check if user is HR admin
CREATE OR REPLACE FUNCTION is_hr_admin()
RETURNS boolean AS $$
BEGIN
  RETURN 'HR_ADMIN' = ANY(get_user_roles());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to check if user is manager
CREATE OR REPLACE FUNCTION is_manager()
RETURNS boolean AS $$
BEGIN
  RETURN 'MANAGER' = ANY(get_user_roles());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Departments policies
CREATE POLICY "HR admins can manage all departments" ON departments
  FOR ALL USING (is_hr_admin());

CREATE POLICY "Managers can view departments" ON departments
  FOR SELECT USING (is_manager() OR auth.uid() IS NOT NULL);

-- Employees policies
CREATE POLICY "HR admins can manage all employees" ON employees
  FOR ALL USING (is_hr_admin());

CREATE POLICY "Managers can view their reports" ON employees
  FOR SELECT USING (
    is_manager() AND (
      manager_id = get_user_employee_id() OR
      id = get_user_employee_id()
    )
  );

CREATE POLICY "Employees can view their own data" ON employees
  FOR SELECT USING (auth_user_id = auth.uid());

CREATE POLICY "Employees can update limited fields" ON employees
  FOR UPDATE USING (auth_user_id = auth.uid())
  WITH CHECK (
    auth_user_id = auth.uid() AND
    -- Only allow updates to personal contact info
    (OLD.first_name, OLD.last_name, OLD.employee_id, OLD.email,
     OLD.job_title, OLD.department_id, OLD.manager_id, OLD.salary,
     OLD.status, OLD.auth_user_id) =
    (NEW.first_name, NEW.last_name, NEW.employee_id, NEW.email,
     NEW.job_title, NEW.department_id, NEW.manager_id, NEW.salary,
     NEW.status, NEW.auth_user_id)
  );

-- Time entries policies
CREATE POLICY "Employees can manage their time entries" ON time_entries
  FOR ALL USING (
    employee_id = get_user_employee_id() OR
    is_hr_admin()
  );

CREATE POLICY "Managers can view time entries of reports" ON time_entries
  FOR SELECT USING (
    is_manager() AND employee_id IN (
      SELECT id FROM employees WHERE manager_id = get_user_employee_id()
    )
  );

-- Leave requests policies
CREATE POLICY "Employees can manage their leave requests" ON leave_requests
  FOR ALL USING (
    employee_id = get_user_employee_id() OR
    is_hr_admin()
  );

CREATE POLICY "Managers can view/approve leave requests of reports" ON leave_requests
  FOR ALL USING (
    is_manager() AND employee_id IN (
      SELECT id FROM employees WHERE manager_id = get_user_employee_id()
    )
  );

-- Leave balances policies
CREATE POLICY "Employees can view their leave balances" ON leave_balances
  FOR SELECT USING (
    employee_id = get_user_employee_id() OR
    is_hr_admin()
  );

-- Leave types policies (read-only for most users)
CREATE POLICY "All authenticated users can view leave types" ON leave_types
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "HR admins can manage leave types" ON leave_types
  FOR ALL USING (is_hr_admin());

-- Policies table policies
CREATE POLICY "All authenticated users can view active policies" ON policies
  FOR SELECT USING (auth.uid() IS NOT NULL AND is_active = true);

CREATE POLICY "HR admins can manage all policies" ON policies
  FOR ALL USING (is_hr_admin());

-- Audit logs policies (HR admin only)
CREATE POLICY "HR admins can view audit logs" ON audit_logs
  FOR SELECT USING (is_hr_admin());

-- Employee status history policies
CREATE POLICY "HR admins can view all status history" ON employee_status_history
  FOR SELECT USING (is_hr_admin());

CREATE POLICY "Employees can view their own status history" ON employee_status_history
  FOR SELECT USING (
    employee_id = get_user_employee_id()
  );

-- Break entries policies
CREATE POLICY "Employees can manage their break entries" ON break_entries
  FOR ALL USING (
    time_entry_id IN (
      SELECT id FROM time_entries WHERE employee_id = get_user_employee_id()
    ) OR is_hr_admin()
  );

-- Staff documents policies
CREATE POLICY "Employees can view their own documents and HR can view all" ON staff_documents
  FOR SELECT USING (
    employee_id = get_user_employee_id() OR
    is_hr_admin() OR
    is_manager()
  );

CREATE POLICY "Employees can upload their own documents" ON staff_documents
  FOR INSERT WITH CHECK (
    employee_id = get_user_employee_id()
  );

CREATE POLICY "Employees can update their own pending documents" ON staff_documents
  FOR UPDATE USING (
    employee_id = get_user_employee_id() AND status = 'PENDING'
  ) WITH CHECK (
    employee_id = get_user_employee_id()
  );

CREATE POLICY "HR can approve/reject documents" ON staff_documents
  FOR UPDATE USING (is_hr_admin())
  WITH CHECK (is_hr_admin());

CREATE POLICY "Employees can delete their own pending documents" ON staff_documents
  FOR DELETE USING (
    employee_id = get_user_employee_id() AND status = 'PENDING'
  );

CREATE POLICY "HR can delete any document" ON staff_documents
  FOR DELETE USING (is_hr_admin());

-- Annual leave plans policies
CREATE POLICY "Employees can view their own leave plans and HR can view all" ON annual_leave_plans
  FOR SELECT USING (
    employee_id = get_user_employee_id() OR
    is_hr_admin() OR
    is_manager()
  );

CREATE POLICY "Employees can create their own leave plans" ON annual_leave_plans
  FOR INSERT WITH CHECK (
    employee_id = get_user_employee_id()
  );

CREATE POLICY "Employees can update their own draft leave plans" ON annual_leave_plans
  FOR UPDATE USING (
    employee_id = get_user_employee_id() AND status = 'DRAFT'
  ) WITH CHECK (
    employee_id = get_user_employee_id()
  );

CREATE POLICY "HR can approve/reject leave plans" ON annual_leave_plans
  FOR UPDATE USING (is_hr_admin())
  WITH CHECK (is_hr_admin());

CREATE POLICY "Managers can approve leave plans for their reports" ON annual_leave_plans
  FOR UPDATE USING (
    is_manager() AND
    employee_id IN (SELECT id FROM employees WHERE manager_id = get_user_employee_id())
  ) WITH CHECK (
    is_manager() AND
    employee_id IN (SELECT id FROM employees WHERE manager_id = get_user_employee_id())
  );

-- Document version history policies
CREATE POLICY "Users can view document history for documents they can access" ON document_version_history
  FOR SELECT USING (
    document_id IN (
      SELECT id FROM staff_documents
      WHERE employee_id = get_user_employee_id() OR is_hr_admin() OR is_manager()
    )
  );

CREATE POLICY "Only system can insert document history" ON document_version_history
  FOR INSERT WITH CHECK (false); -- Only triggers/functions can insert

-- =============================================
-- INITIAL DATA
-- =============================================

-- Insert default leave types
INSERT INTO leave_types (name, leave_type, description, max_days_per_year, requires_approval, advance_notice_days, accrual_rate) VALUES
  ('Annual Leave', 'VACATION', 'Standard vacation days', 20, true, 7, 1.6667),
  ('Sick Leave', 'SICK', 'Medical leave for illness', 10, false, 0, 0.8333),
  ('Personal Leave', 'PERSONAL', 'Personal time off', 5, true, 3, 0.4167),
  ('Maternity Leave', 'MATERNITY', 'Maternity leave', 90, true, 30, 0),
  ('Paternity Leave', 'PATERNITY', 'Paternity leave', 14, true, 30, 0),
  ('Bereavement Leave', 'BEREAVEMENT', 'Time off for family loss', 3, true, 0, 0);

-- Insert default department
INSERT INTO departments (name, description, is_active) VALUES
  ('General', 'Default department for all employees', true);