import { PoolClient } from 'pg';
import { Migration } from '../index';

export const alignSupabaseRls: Migration = {
  id: '014',
  name: 'Align employees auth_user_id and RLS policies with Supabase',

  async up(client: PoolClient): Promise<void> {
    const sql = `
      -- 1) Add auth_user_id to employees if missing
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'employees'
            AND column_name = 'auth_user_id'
        ) THEN
          ALTER TABLE employees ADD COLUMN auth_user_id UUID;
        END IF;
      END$$;

      -- Helpful index
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relkind = 'i'
            AND c.relname = 'idx_employees_auth_user_id'
            AND n.nspname = 'public'
        ) THEN
          CREATE INDEX idx_employees_auth_user_id ON employees(auth_user_id);
        END IF;
      END$$;

      -- 2) Enable RLS on core tables (idempotent)
      DO $$ BEGIN EXECUTE 'ALTER TABLE departments ENABLE ROW LEVEL SECURITY'; EXCEPTION WHEN others THEN NULL; END$$;
      DO $$ BEGIN EXECUTE 'ALTER TABLE employees ENABLE ROW LEVEL SECURITY'; EXCEPTION WHEN others THEN NULL; END$$;
      DO $$ BEGIN EXECUTE 'ALTER TABLE employee_status_history ENABLE ROW LEVEL SECURITY'; EXCEPTION WHEN others THEN NULL; END$$;
      DO $$ BEGIN EXECUTE 'ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY'; EXCEPTION WHEN others THEN NULL; END$$;
      DO $$ BEGIN EXECUTE 'ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY'; EXCEPTION WHEN others THEN NULL; END$$;
      DO $$ BEGIN EXECUTE 'ALTER TABLE break_entries ENABLE ROW LEVEL SECURITY'; EXCEPTION WHEN others THEN NULL; END$$;
      DO $$ BEGIN EXECUTE 'ALTER TABLE leave_types ENABLE ROW LEVEL SECURITY'; EXCEPTION WHEN others THEN NULL; END$$;
      DO $$ BEGIN EXECUTE 'ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY'; EXCEPTION WHEN others THEN NULL; END$$;
      DO $$ BEGIN EXECUTE 'ALTER TABLE leave_balances ENABLE ROW LEVEL SECURITY'; EXCEPTION WHEN others THEN NULL; END$$;
      DO $$ BEGIN EXECUTE 'ALTER TABLE policies ENABLE ROW LEVEL SECURITY'; EXCEPTION WHEN others THEN NULL; END$$;
      DO $$ BEGIN EXECUTE 'ALTER TABLE staff_documents ENABLE ROW LEVEL SECURITY'; EXCEPTION WHEN others THEN NULL; END$$;
      DO $$ BEGIN EXECUTE 'ALTER TABLE annual_leave_plans ENABLE ROW LEVEL SECURITY'; EXCEPTION WHEN others THEN NULL; END$$;
      DO $$ BEGIN EXECUTE 'ALTER TABLE document_version_history ENABLE ROW LEVEL SECURITY'; EXCEPTION WHEN others THEN NULL; END$$;

      -- 3) Helper functions (guarded so they don't fail outside Supabase)
      -- get_user_roles(): expects roles in JWT user_metadata.roles (Supabase)
      DO $$
      BEGIN
        EXECUTE $$
          CREATE OR REPLACE FUNCTION get_user_roles()
          RETURNS text[] AS $$
          BEGIN
            RETURN COALESCE((auth.jwt() ->> 'user_metadata')::jsonb ->> 'roles', '[]')::jsonb::text[];
          END;
          $$ LANGUAGE plpgsql SECURITY DEFINER;
        $$;
      EXCEPTION WHEN undefined_table THEN
        -- auth schema might not exist in non-Supabase environments; create a stub that returns empty roles
        EXECUTE $$
          CREATE OR REPLACE FUNCTION get_user_roles()
          RETURNS text[] AS $$
          BEGIN
            RETURN ARRAY[]::text[];
          END;
          $$ LANGUAGE plpgsql;
        $$;
      END$$;

      -- get_user_employee_id(): map auth.uid() to employees.auth_user_id when available
      DO $$
      BEGIN
        EXECUTE $$
          CREATE OR REPLACE FUNCTION get_user_employee_id()
          RETURNS UUID AS $$
          BEGIN
            RETURN (SELECT id FROM employees WHERE auth_user_id = auth.uid());
          END;
          $$ LANGUAGE plpgsql SECURITY DEFINER;
        $$;
      EXCEPTION WHEN undefined_function OR undefined_table THEN
        -- Fallback for non-Supabase environments
        EXECUTE $$
          CREATE OR REPLACE FUNCTION get_user_employee_id()
          RETURNS UUID AS $$
          BEGIN
            RETURN NULL;
          END;
          $$ LANGUAGE plpgsql;
        $$;
      END$$;

      -- is_hr_admin(), is_manager()
      CREATE OR REPLACE FUNCTION is_hr_admin()
      RETURNS boolean AS $$
      BEGIN
        RETURN 'HR_ADMIN' = ANY(get_user_roles());
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER;

      CREATE OR REPLACE FUNCTION is_manager()
      RETURNS boolean AS $$
      BEGIN
        RETURN 'MANAGER' = ANY(get_user_roles());
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER;

      -- 4) Core policies (created if missing)
      -- Employees: self-read, HR all, managers see self and direct reports
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE polname = 'hr_manage_all_employees' AND tablename = 'employees') THEN
          EXECUTE $$CREATE POLICY hr_manage_all_employees ON employees FOR ALL USING (is_hr_admin())$$;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE polname = 'employees_view_self' AND tablename = 'employees') THEN
          EXECUTE $$CREATE POLICY employees_view_self ON employees FOR SELECT USING (auth_user_id = auth.uid())$$;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE polname = 'managers_view_reports' AND tablename = 'employees') THEN
          EXECUTE $$
            CREATE POLICY managers_view_reports ON employees
            FOR SELECT USING (
              is_manager() AND (
                manager_id = get_user_employee_id() OR id = get_user_employee_id()
              )
            )
          $$;
        END IF;
      END$$;

      -- Time entries: owners manage, HR manage, managers read reports
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE polname = 'time_entries_employee_manage' AND tablename = 'time_entries') THEN
          EXECUTE $$CREATE POLICY time_entries_employee_manage ON time_entries FOR ALL USING (employee_id = get_user_employee_id() OR is_hr_admin())$$;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE polname = 'time_entries_manager_read' AND tablename = 'time_entries') THEN
          EXECUTE $$
            CREATE POLICY time_entries_manager_read ON time_entries
            FOR SELECT USING (
              is_manager() AND employee_id IN (
                SELECT id FROM employees WHERE manager_id = get_user_employee_id()
              )
            )
          $$;
        END IF;
      END$$;

      -- Leave requests: owners manage, HR manage, managers manage reports
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE polname = 'leave_requests_employee_manage' AND tablename = 'leave_requests') THEN
          EXECUTE $$CREATE POLICY leave_requests_employee_manage ON leave_requests FOR ALL USING (employee_id = get_user_employee_id() OR is_hr_admin())$$;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE polname = 'leave_requests_manager_manage' AND tablename = 'leave_requests') THEN
          EXECUTE $$
            CREATE POLICY leave_requests_manager_manage ON leave_requests
            FOR ALL USING (
              is_manager() AND employee_id IN (
                SELECT id FROM employees WHERE manager_id = get_user_employee_id()
              )
            )
          $$;
        END IF;
      END$$;
    `;

    await client.query(sql);
  },

  async down(client: PoolClient): Promise<void> {
    const sql = `
      -- Drop policies created in this migration
      DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_policies WHERE polname = 'leave_requests_manager_manage' AND tablename = 'leave_requests') THEN EXECUTE 'DROP POLICY leave_requests_manager_manage ON leave_requests'; END IF; END$$;
      DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_policies WHERE polname = 'leave_requests_employee_manage' AND tablename = 'leave_requests') THEN EXECUTE 'DROP POLICY leave_requests_employee_manage ON leave_requests'; END IF; END$$;
      DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_policies WHERE polname = 'time_entries_manager_read' AND tablename = 'time_entries') THEN EXECUTE 'DROP POLICY time_entries_manager_read ON time_entries'; END IF; END$$;
      DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_policies WHERE polname = 'time_entries_employee_manage' AND tablename = 'time_entries') THEN EXECUTE 'DROP POLICY time_entries_employee_manage ON time_entries'; END IF; END$$;
      DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_policies WHERE polname = 'managers_view_reports' AND tablename = 'employees') THEN EXECUTE 'DROP POLICY managers_view_reports ON employees'; END IF; END$$;
      DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_policies WHERE polname = 'employees_view_self' AND tablename = 'employees') THEN EXECUTE 'DROP POLICY employees_view_self ON employees'; END IF; END$$;
      DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_policies WHERE polname = 'hr_manage_all_employees' AND tablename = 'employees') THEN EXECUTE 'DROP POLICY hr_manage_all_employees ON employees'; END IF; END$$;

      -- Drop helper functions
      DROP FUNCTION IF EXISTS is_manager();
      DROP FUNCTION IF EXISTS is_hr_admin();
      DROP FUNCTION IF EXISTS get_user_employee_id();
      DROP FUNCTION IF EXISTS get_user_roles();

      -- Keep auth_user_id column (safe to leave). If you want to drop it, uncomment:
      -- ALTER TABLE employees DROP COLUMN IF EXISTS auth_user_id;
    `;

    await client.query(sql);
  }
};


