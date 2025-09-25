import { EmployeeStatusType } from '../../models/EmployeeStatus';
import { EmploymentType } from '../../models/JobInfo';

// Database row interface that matches the actual database schema
export interface EmployeeRow {
  id: string;
  employee_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  date_of_birth?: Date;
  social_security_number?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relationship?: string;
  job_title: string;
  department_id?: string;
  manager_id?: string;
  start_date: Date;
  end_date?: Date;
  employment_type: EmploymentType;
  salary?: number;
  location: string;
  status: EmployeeStatusType;
  status_effective_date: Date;
  status_reason?: string;
  status_notes?: string;
  user_id?: string;
  created_at: Date;
  updated_at: Date;
  created_by: string;
  updated_by: string;
  // Join fields
  department_name?: string;
  manager_name?: string;
}

// Input interface for creating employees
export interface CreateEmployeeInput {
  employee_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  date_of_birth?: Date;
  social_security_number?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relationship?: string;
  job_title: string;
  department_id?: string;
  manager_id?: string;
  start_date: Date;
  employment_type: EmploymentType;
  salary?: number;
  location: string;
  status?: EmployeeStatusType;
  status_effective_date?: Date;
  status_reason?: string;
  status_notes?: string;
  user_id?: string;
  created_by: string;
  updated_by?: string;
}

// Input interface for updating employees
export interface UpdateEmployeeInput {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  date_of_birth?: Date;
  social_security_number?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relationship?: string;
  job_title?: string;
  department_id?: string;
  manager_id?: string;
  start_date?: Date;
  end_date?: Date;
  employment_type?: EmploymentType;
  salary?: number;
  location?: string;
  status?: EmployeeStatusType;
  status_effective_date?: Date;
  status_reason?: string;
  status_notes?: string;
  user_id?: string;
  updated_by?: string;
}