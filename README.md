# Employee Management System

A comprehensive employee management system built with Node.js, TypeScript, and PostgreSQL.

## Features

- Employee CRUD operations
- Role-based access control
- Audit logging
- Organizational hierarchy management
- Employee status tracking
- Reporting and export functionality

## Project Structure

```
src/
├── controllers/     # API controllers
├── database/        # Database connection and repositories
├── middleware/      # Express middleware
├── models/          # TypeScript interfaces and types
├── services/        # Business logic services
└── utils/           # Utility functions
```

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Update the `.env` file with your database and other configuration details.

4. Build the project:
   ```bash
   npm run build
   ```

5. Start development server:
   ```bash
   npm run dev
   ```

## Scripts

- `npm run build` - Build the TypeScript project
- `npm run start` - Start the production server
- `npm run dev` - Start development server with hot reload
- `npm test` - Run tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage report
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Run ESLint with auto-fix

## Environment Variables

See `.env.example` for all required environment variables.

## License

MIT