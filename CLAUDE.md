# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

### Development Workflow
- `npm run dev` - Start development server with hot reload using ts-node-dev
- `npm run build` - Compile TypeScript to JavaScript in dist/ folder
- `npm start` - Start production server from compiled code

### Testing
- `npm test` - Run Jest test suite
- `npm run test:watch` - Run tests in watch mode for development
- `npm run test:coverage` - Generate test coverage report

### Code Quality
- `npm run lint` - Run ESLint on TypeScript files
- `npm run lint:fix` - Run ESLint with automatic fixes

### Database Operations
- `npm run migrate` - Run pending database migrations
- `npm run migrate:rollback` - Rollback the last migration
- `npm run migrate:status` - Check migration status
- `npm run seed` - Seed database with test data
- `npm run seed:clear` - Clear seeded data

### Docker Operations
- `npm run docker:build` - Build Docker image
- `npm run docker:up` - Start services with docker-compose
- `npm run docker:down` - Stop docker-compose services
- `npm run docker:logs` - View application logs

## Architecture Overview

### Core Structure
This is a Node.js/Express TypeScript application with a layered architecture:

- **Controllers** (`src/controllers/`): Handle HTTP requests/responses, validation
- **Services** (`src/services/`): Business logic and operations
- **Repositories** (`src/database/repositories/`): Data access layer
- **Models** (`src/models/`): TypeScript interfaces and type definitions
- **Middleware** (`src/middleware/`): Express middleware for auth, validation, logging, security
- **Routes** (`src/routes/`): API endpoint definitions

### Key Application Components

**Main Application Flow:**
1. `src/server.ts` - Application entry point with graceful shutdown
2. `src/app.ts` - Express app configuration with comprehensive middleware stack
3. `src/index.ts` - Module exports for library usage

**Database Architecture:**
- PostgreSQL with connection pooling (`src/database/connection.ts`)
- Migration system with transaction support (`src/database/migrations/`)
- Repository pattern for data access
- Redis integration for caching and sessions

**Security & Monitoring:**
- Comprehensive middleware stack including: rate limiting, input sanitization, CORS, helmet security headers
- Performance monitoring with correlation ID tracking
- Health check endpoints: `/health`, `/health/live`, `/health/ready`
- Request logging and error tracking with Winston

### Path Aliases
The project uses TypeScript path mapping:
- `@models/*` → `src/models/*`
- `@services/*` → `src/services/*`
- `@controllers/*` → `src/controllers/*`
- `@database/*` → `src/database/*`
- `@utils/*` → `src/utils/*`

### API Structure
- `/api/employees/*` - Employee CRUD operations and self-service endpoints
- `/api/managers/*` - Manager-specific operations
- `/api/monitoring/*` - System monitoring and metrics

### Environment Configuration
Copy `.env.example` to `.env` and configure:
- Database credentials (PostgreSQL)
- Redis connection
- JWT secrets and encryption keys
- CORS origins and rate limiting settings

### Time & Attendance Module
The application is being extended with time and attendance features:
- Time entries, leave requests, leave balances
- Policy management system
- Migrations 008-012 handle these new tables

### Testing Strategy
- Jest with ts-jest for TypeScript support
- Test files: `*.test.ts` or `*.spec.ts`
- Coverage collection excludes test files and type definitions
- Testcontainers for integration testing with PostgreSQL

### Development Notes
- Uses strict TypeScript configuration with comprehensive type checking
- Multi-stage Docker build for production optimization
- Graceful shutdown handling for SIGTERM/SIGINT
- Health checks for container orchestration
- Security-first approach with input validation and rate limiting