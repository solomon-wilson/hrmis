@echo off
REM Employee Management System Deployment Script for Windows
REM This script handles the complete deployment process for different environments

setlocal enabledelayedexpansion

REM Default values
set ENVIRONMENT=development
set SKIP_TESTS=false
set SKIP_MIGRATIONS=false
set SKIP_SEED=false
set BUILD_ONLY=false

REM Parse command line arguments
:parse_args
if "%~1"=="" goto :start_deployment
if "%~1"=="-e" (
    set ENVIRONMENT=%~2
    shift
    shift
    goto :parse_args
)
if "%~1"=="--environment" (
    set ENVIRONMENT=%~2
    shift
    shift
    goto :parse_args
)
if "%~1"=="-t" (
    set SKIP_TESTS=true
    shift
    goto :parse_args
)
if "%~1"=="--skip-tests" (
    set SKIP_TESTS=true
    shift
    goto :parse_args
)
if "%~1"=="-m" (
    set SKIP_MIGRATIONS=true
    shift
    goto :parse_args
)
if "%~1"=="--skip-migrations" (
    set SKIP_MIGRATIONS=true
    shift
    goto :parse_args
)
if "%~1"=="-s" (
    set SKIP_SEED=true
    shift
    goto :parse_args
)
if "%~1"=="--skip-seed" (
    set SKIP_SEED=true
    shift
    goto :parse_args
)
if "%~1"=="-b" (
    set BUILD_ONLY=true
    shift
    goto :parse_args
)
if "%~1"=="--build-only" (
    set BUILD_ONLY=true
    shift
    goto :parse_args
)
if "%~1"=="-h" goto :show_usage
if "%~1"=="--help" goto :show_usage

echo [ERROR] Unknown option: %~1
goto :show_usage

:show_usage
echo Usage: %~nx0 [OPTIONS]
echo.
echo Options:
echo   -e, --environment ENV    Target environment (development^|staging^|production) [default: development]
echo   -t, --skip-tests        Skip running tests
echo   -m, --skip-migrations   Skip database migrations
echo   -s, --skip-seed         Skip database seeding
echo   -b, --build-only        Only build the application, don't deploy
echo   -h, --help              Show this help message
echo.
echo Examples:
echo   %~nx0 -e production                    # Deploy to production
echo   %~nx0 -e staging --skip-tests          # Deploy to staging without tests
echo   %~nx0 --build-only                     # Only build the application
exit /b 0

:start_deployment
echo [INFO] Starting deployment for environment: %ENVIRONMENT%

REM Validate environment
if not "%ENVIRONMENT%"=="development" if not "%ENVIRONMENT%"=="staging" if not "%ENVIRONMENT%"=="production" (
    echo [ERROR] Invalid environment: %ENVIRONMENT%
    echo [ERROR] Valid environments: development, staging, production
    exit /b 1
)

REM Check if required files exist
if not exist "package.json" (
    echo [ERROR] package.json not found. Are you in the project root?
    exit /b 1
)

if not exist "config\%ENVIRONMENT%.env" (
    echo [ERROR] Environment config file not found: config\%ENVIRONMENT%.env
    exit /b 1
)

REM Load environment variables
echo [INFO] Loading environment configuration...
for /f "usebackq tokens=*" %%a in ("config\%ENVIRONMENT%.env") do (
    set "line=%%a"
    if not "!line:~0,1!"=="#" (
        for /f "tokens=1,2 delims==" %%b in ("!line!") do (
            set "%%b=%%c"
        )
    )
)

REM Install dependencies
echo [INFO] Installing dependencies...
call npm ci
if errorlevel 1 (
    echo [ERROR] Failed to install dependencies
    exit /b 1
)

REM Run linting
echo [INFO] Running linting...
call npm run lint
if errorlevel 1 (
    echo [ERROR] Linting failed
    exit /b 1
)

REM Run tests (unless skipped)
if "%SKIP_TESTS%"=="false" (
    echo [INFO] Running tests...
    call npm run test
    if errorlevel 1 (
        echo [ERROR] Tests failed
        exit /b 1
    )
    echo [SUCCESS] Tests passed
) else (
    echo [WARNING] Skipping tests
)

REM Build the application
echo [INFO] Building application...
call npm run build
if errorlevel 1 (
    echo [ERROR] Build failed
    exit /b 1
)
echo [SUCCESS] Build completed

REM If build-only flag is set, exit here
if "%BUILD_ONLY%"=="true" (
    echo [SUCCESS] Build-only deployment completed
    exit /b 0
)

REM Database operations
if "%SKIP_MIGRATIONS%"=="false" (
    echo [INFO] Running database migrations...
    call npm run migrate
    if errorlevel 1 (
        echo [ERROR] Database migrations failed
        exit /b 1
    )
    echo [SUCCESS] Database migrations completed
) else (
    echo [WARNING] Skipping database migrations
)

REM Seed database (only for development and staging)
if not "%ENVIRONMENT%"=="production" (
    if "%SKIP_SEED%"=="false" (
        echo [INFO] Seeding database with test data...
        call npm run seed
        if errorlevel 1 (
            echo [ERROR] Database seeding failed
            exit /b 1
        )
        echo [SUCCESS] Database seeding completed
    ) else (
        echo [WARNING] Skipping database seeding
    )
) else (
    echo [WARNING] Skipping database seeding for production environment
)

REM Environment-specific deployment
if "%ENVIRONMENT%"=="development" (
    echo [INFO] Development deployment completed
    echo [INFO] You can now run: npm run dev
) else (
    echo [INFO] Building Docker image...
    docker build -t employee-management:%ENVIRONMENT% .
    if errorlevel 1 (
        echo [ERROR] Docker build failed
        exit /b 1
    )
    
    echo [INFO] Starting services with Docker Compose...
    docker-compose -f docker-compose.yml up -d
    if errorlevel 1 (
        echo [ERROR] Docker Compose failed
        exit /b 1
    )
    
    REM Wait for services to be ready
    timeout /t 10 /nobreak > nul
    
    echo [SUCCESS] %ENVIRONMENT% deployment completed successfully
)

REM Display deployment summary
echo.
echo ==================================
echo    DEPLOYMENT SUMMARY
echo ==================================
echo Environment: %ENVIRONMENT%
if "%SKIP_TESTS%"=="true" (
    echo Tests: Skipped
) else (
    echo Tests: Passed
)
if "%SKIP_MIGRATIONS%"=="true" (
    echo Migrations: Skipped
) else (
    echo Migrations: Completed
)
if "%SKIP_SEED%"=="true" (
    echo Seeding: Skipped
) else (
    echo Seeding: Completed
)
echo Status: SUCCESS
echo ==================================

echo [SUCCESS] Deployment completed successfully!
exit /b 0