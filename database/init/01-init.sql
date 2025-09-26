-- Database initialization script for Docker PostgreSQL
-- This script runs when the PostgreSQL container starts for the first time

-- Create the main database if it doesn't exist
SELECT 'CREATE DATABASE employee_management'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'employee_management')\gexec

-- Create the test database if it doesn't exist
SELECT 'CREATE DATABASE employee_management_test'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'employee_management_test')\gexec

-- Create the development database if it doesn't exist
SELECT 'CREATE DATABASE employee_management_dev'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'employee_management_dev')\gexec

-- Create the staging database if it doesn't exist
SELECT 'CREATE DATABASE employee_management_staging'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'employee_management_staging')\gexec

-- Enable required extensions
\c employee_management;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

\c employee_management_test;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

\c employee_management_dev;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

\c employee_management_staging;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";