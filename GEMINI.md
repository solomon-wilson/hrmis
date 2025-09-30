# Project Overview

This is a comprehensive Employee Management System built with a modern tech stack. The application is designed to handle various HR-related tasks, including employee data management, role-based access control, and reporting.

**Key Technologies:**

*   **Frontend:** Next.js, React, TypeScript
*   **Backend:** Node.js, Express.js
*   **Database:** PostgreSQL (managed by Supabase)
*   **Authentication:** Supabase Auth
*   **Styling:** Tailwind CSS
*   **Containerization:** Docker

**Architecture:**

The project follows a modular architecture with a clear separation of concerns. The frontend is a Next.js application, while the backend is a Node.js/Express.js API. The backend is organized into controllers, services, models, and middleware, promoting code reusability and maintainability. The database is managed by Supabase, which provides a PostgreSQL database, authentication, and other backend services.

# Building and Running

**Prerequisites:**

*   Node.js
*   npm
*   Docker

**Development:**

1.  **Install Dependencies:**
    ```bash
    npm install
    ```

2.  **Run the Development Server:**
    ```bash
    npm run dev
    ```
    This will start the Next.js development server.

**Docker:**

1.  **Build the Docker Image:**
    ```bash
    docker build -t employee-management:latest .
    ```

2.  **Run the Application with Docker Compose:**
    ```bash
    docker-compose up -d
    ```

**Testing:**

*   **Run all tests:**
    ```bash
    npm test
    ```

*   **Run tests in watch mode:**
    ```bash
    npm run test:watch
    ```

*   **Run tests with coverage:**
    ```bash
    npm run test:coverage
    ```

# Development Conventions

*   **Coding Style:** The project uses ESLint to enforce a consistent coding style. Run `npm run lint` to check for linting errors and `npm run lint:fix` to automatically fix them.
*   **Testing:** The project uses Jest for testing. Test files are located in the `__tests__` directory and follow the `*.test.ts` naming convention.
*   **Commits:** Follow conventional commit standards for commit messages.
*   **Branching:** Use feature branches for new features and bug fixes. Create a pull request to merge changes into the `main` branch.
