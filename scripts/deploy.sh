#!/bin/bash

# Employee Management System Deployment Script
# This script handles the complete deployment process for different environments

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT="development"
SKIP_TESTS=false
SKIP_MIGRATIONS=false
SKIP_SEED=false
BUILD_ONLY=false

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -e, --environment ENV    Target environment (development|staging|production) [default: development]"
    echo "  -t, --skip-tests        Skip running tests"
    echo "  -m, --skip-migrations   Skip database migrations"
    echo "  -s, --skip-seed         Skip database seeding"
    echo "  -b, --build-only        Only build the application, don't deploy"
    echo "  -h, --help              Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 -e production                    # Deploy to production"
    echo "  $0 -e staging --skip-tests          # Deploy to staging without tests"
    echo "  $0 --build-only                     # Only build the application"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -t|--skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        -m|--skip-migrations)
            SKIP_MIGRATIONS=false
            shift
            ;;
        -s|--skip-seed)
            SKIP_SEED=true
            shift
            ;;
        -b|--build-only)
            BUILD_ONLY=true
            shift
            ;;
        -h|--help)
            show_usage
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(development|staging|production)$ ]]; then
    print_error "Invalid environment: $ENVIRONMENT"
    print_error "Valid environments: development, staging, production"
    exit 1
fi

print_status "Starting deployment for environment: $ENVIRONMENT"

# Check if required files exist
if [[ ! -f "package.json" ]]; then
    print_error "package.json not found. Are you in the project root?"
    exit 1
fi

if [[ ! -f "config/${ENVIRONMENT}.env" ]]; then
    print_error "Environment config file not found: config/${ENVIRONMENT}.env"
    exit 1
fi

# Load environment variables
print_status "Loading environment configuration..."
export $(cat config/${ENVIRONMENT}.env | grep -v '^#' | xargs)

# Install dependencies
print_status "Installing dependencies..."
npm ci

# Run linting
print_status "Running linting..."
npm run lint

# Run tests (unless skipped)
if [[ "$SKIP_TESTS" == false ]]; then
    print_status "Running tests..."
    npm run test
    print_success "Tests passed"
else
    print_warning "Skipping tests"
fi

# Build the application
print_status "Building application..."
npm run build
print_success "Build completed"

# If build-only flag is set, exit here
if [[ "$BUILD_ONLY" == true ]]; then
    print_success "Build-only deployment completed"
    exit 0
fi

# Database operations
if [[ "$SKIP_MIGRATIONS" == false ]]; then
    print_status "Running database migrations..."
    npm run migrate
    print_success "Database migrations completed"
else
    print_warning "Skipping database migrations"
fi

# Seed database (only for development and staging)
if [[ "$ENVIRONMENT" != "production" && "$SKIP_SEED" == false ]]; then
    print_status "Seeding database with test data..."
    npm run seed
    print_success "Database seeding completed"
elif [[ "$ENVIRONMENT" == "production" ]]; then
    print_warning "Skipping database seeding for production environment"
else
    print_warning "Skipping database seeding"
fi

# Health check function
check_health() {
    local url=$1
    local max_attempts=30
    local attempt=1
    
    print_status "Waiting for application to be ready..."
    
    while [[ $attempt -le $max_attempts ]]; do
        if curl -f -s "$url/health/ready" > /dev/null 2>&1; then
            print_success "Application is ready and healthy"
            return 0
        fi
        
        print_status "Attempt $attempt/$max_attempts - Application not ready yet..."
        sleep 2
        ((attempt++))
    done
    
    print_error "Application failed to become ready within timeout"
    return 1
}

# Environment-specific deployment
case $ENVIRONMENT in
    development)
        print_status "Starting development server..."
        print_success "Development deployment completed"
        print_status "You can now run: npm run dev"
        ;;
    staging|production)
        # Docker deployment
        print_status "Building Docker image..."
        docker build -t employee-management:${ENVIRONMENT} .
        
        print_status "Starting services with Docker Compose..."
        docker-compose -f docker-compose.yml up -d
        
        # Wait for services to be ready
        sleep 10
        
        # Health check
        if check_health "http://localhost:3000"; then
            print_success "$ENVIRONMENT deployment completed successfully"
        else
            print_error "$ENVIRONMENT deployment failed health check"
            exit 1
        fi
        ;;
esac

# Display deployment summary
echo ""
echo "=================================="
echo "   DEPLOYMENT SUMMARY"
echo "=================================="
echo "Environment: $ENVIRONMENT"
echo "Tests: $([ "$SKIP_TESTS" == true ] && echo "Skipped" || echo "Passed")"
echo "Migrations: $([ "$SKIP_MIGRATIONS" == true ] && echo "Skipped" || echo "Completed")"
echo "Seeding: $([ "$SKIP_SEED" == true ] && echo "Skipped" || echo "Completed")"
echo "Status: SUCCESS"
echo "=================================="

print_success "Deployment completed successfully!"