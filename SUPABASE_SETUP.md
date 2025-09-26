# Supabase Setup Guide

This guide will help you set up Supabase for the Employee Management System.

## Prerequisites

1. Create a Supabase account at [supabase.com](https://supabase.com)
2. Create a new Supabase project

## Step 1: Database Setup

1. In your Supabase dashboard, go to the SQL Editor
2. Copy and paste the contents of `supabase_schema.sql` into the SQL Editor
3. Click "Run" to execute the schema

This will create:
- All database tables with proper relationships
- Row Level Security (RLS) policies
- Indexes for performance
- Trigger functions for automatic timestamps
- Initial data (leave types, default department)

## Step 2: Authentication Setup

1. Go to Authentication > Settings in your Supabase dashboard
2. Configure the following settings:
   - **Enable email confirmations**: Recommended for production
   - **Enable secure email change**: Yes
   - **Enable manual linking**: No (unless needed)

### Custom Claims Setup

Since we use role-based access, you'll need to set up custom claims. Create this Edge Function:

```sql
-- Create a function to handle user roles in JWT claims
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  claims jsonb;
  employee_data jsonb;
BEGIN
  -- Fetch employee data for the user
  SELECT jsonb_build_object(
    'employee_id', e.id,
    'roles', COALESCE(e.auth_user_id, '[]'::jsonb),
    'department_id', e.department_id,
    'manager_id', e.manager_id
  ) INTO employee_data
  FROM employees e
  WHERE e.auth_user_id = (event->>'user_id')::uuid;

  -- Set claims
  claims := jsonb_build_object(
    'employee_data', employee_data,
    'roles', COALESCE(employee_data->>'roles', '["EMPLOYEE"]')
  );

  -- Return the claims
  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
```

## Step 3: Environment Variables

Update your `.env` file with your Supabase credentials:

```env
# Supabase Configuration
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

You can find these values in:
- **Project URL**: Settings > General > Project URL
- **Anon Key**: Settings > API > Project API keys > anon/public
- **Service Role Key**: Settings > API > Project API keys > service_role

## Step 4: Row Level Security (RLS)

The schema automatically enables RLS on all tables with these policies:

### User Roles
- **HR_ADMIN**: Full access to all data
- **MANAGER**: Can view/manage their direct reports
- **EMPLOYEE**: Can view/edit their own data only
- **VIEWER**: Read-only access to permitted data

### Key RLS Features
- Employees can only see their own personal data
- Managers can view and manage their direct reports
- HR admins have full system access
- Time tracking data is scoped to employee/manager relationships
- Leave requests follow approval hierarchies

## Step 5: Testing the Setup

1. Start your application: `npm run dev`
2. The application should connect to Supabase successfully
3. Check the logs for "Supabase connection established successfully"

## Step 6: Creating Your First Admin User

Since RLS is enabled, you'll need to create your first HR admin user manually:

1. In Supabase Dashboard > Authentication > Users, click "Invite User"
2. Enter an email address for your admin user
3. After the user signs up, run this SQL to create their employee record:

```sql
-- Replace with actual values
INSERT INTO employees (
  employee_id,
  first_name,
  last_name,
  email,
  job_title,
  department_id,
  auth_user_id,
  status
) VALUES (
  'EMP001',
  'Admin',
  'User',
  'admin@yourcompany.com',
  'HR Administrator',
  (SELECT id FROM departments WHERE name = 'General'),
  (SELECT id FROM auth.users WHERE email = 'admin@yourcompany.com'),
  'ACTIVE'
);

-- Update user metadata to include HR_ADMIN role
UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
  COALESCE(raw_user_meta_data, '{}'::jsonb),
  '{roles}',
  '["HR_ADMIN"]'::jsonb
)
WHERE email = 'admin@yourcompany.com';
```

## Data Migration (Optional)

If you have existing data from PostgreSQL, you can export it and import to Supabase:

1. Export data from your existing PostgreSQL database
2. Transform the data to match the new schema (especially auth_user_id references)
3. Import using Supabase's CSV import or SQL inserts

## Monitoring and Maintenance

- Monitor your Supabase usage in the Dashboard
- Set up database backups (automatic in Supabase Pro)
- Monitor RLS policy performance
- Review and update policies as your organization grows

## Troubleshooting

### Common Issues

1. **RLS blocks all queries**: Check that user metadata includes proper roles
2. **Authentication fails**: Verify SUPABASE_URL and keys are correct
3. **Slow queries**: Check if RLS policies are using indexes efficiently

### Useful SQL Queries

```sql
-- Check user roles
SELECT email, raw_user_meta_data->'roles' as roles
FROM auth.users;

-- View RLS policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public';

-- Check employee-user linkage
SELECT e.employee_id, e.first_name, e.last_name, u.email, e.auth_user_id
FROM employees e
LEFT JOIN auth.users u ON e.auth_user_id = u.id;
```

## Security Best Practices

1. **Never use service_role key in frontend code**
2. **Regularly audit RLS policies**
3. **Use HTTPS in production**
4. **Enable email confirmation for new users**
5. **Implement proper session management**
6. **Monitor authentication logs**