import { EmployeeService } from './EmployeeService';
import { Employee } from '../models/Employee';
import { ValidationError } from '../utils/validation';
import { database } from '../database/connection';
// Mock the database connection
jest.mock('../database/connection');
jest.mock('../database/repositories/employee');
jest.mock('../database/repositories/audit');
describe('EmployeeService', () => {
    let employeeService;
    let mockEmployeeRepository;
    let mockAuditLogRepository;
    let mockClient;
    // Test UUIDs
    const TEST_UUID_1 = '550e8400-e29b-41d4-a716-446655440000';
    const TEST_UUID_2 = '550e8400-e29b-41d4-a716-446655440001';
    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();
        // Create mock client
        mockClient = {
            query: jest.fn(),
            release: jest.fn()
        };
        // Mock database.getClient
        database.getClient.mockResolvedValue(mockClient);
        // Create service instance
        employeeService = new EmployeeService();
        // Mock the repositories on the service instance
        mockEmployeeRepository = {
            findByEmail: jest.fn(),
            findByEmployeeId: jest.fn(),
            findById: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            updateStatus: jest.fn(),
            findAll: jest.fn(),
            getDirectReports: jest.fn()
        };
        mockAuditLogRepository = {
            logEmployeeCreate: jest.fn(),
            logEmployeeUpdate: jest.fn(),
            logEmployeeStatusChange: jest.fn(),
            getEntityAuditTrail: jest.fn()
        };
        // Replace the repositories on the service instance
        employeeService.employeeRepository = mockEmployeeRepository;
        employeeService.auditLogRepository = mockAuditLogRepository;
    });
    describe('createEmployee', () => {
        const validCreateRequest = {
            employeeId: 'EMP001',
            personalInfo: {
                firstName: 'John',
                lastName: 'Doe',
                email: 'john.doe@company.com',
                phone: '+1-555-0123',
                address: {
                    street: '123 Main St',
                    city: 'New York',
                    state: 'NY',
                    zipCode: '10001',
                    country: 'United States'
                }
            },
            jobInfo: {
                jobTitle: 'Software Engineer',
                department: 'Engineering',
                startDate: new Date('2024-01-15'),
                employmentType: 'FULL_TIME',
                location: 'New York'
            },
            createdBy: TEST_UUID_1
        };
        const hrAdminContext = {
            userId: 'hr-admin-123',
            role: 'HR_ADMIN'
        };
        const managerContext = {
            userId: 'manager-123',
            role: 'MANAGER',
            managedEmployeeIds: ['emp-456']
        };
        it('should create employee successfully with valid data and HR_ADMIN permissions', async () => {
            // Arrange
            const mockEmployee = Employee.createNew({
                employeeId: validCreateRequest.employeeId,
                personalInfo: validCreateRequest.personalInfo,
                jobInfo: validCreateRequest.jobInfo,
                status: { current: 'ACTIVE', effectiveDate: new Date() },
                createdBy: TEST_UUID_1,
                updatedBy: TEST_UUID_1
            });
            mockEmployeeRepository.findByEmail.mockResolvedValue(null);
            mockEmployeeRepository.findByEmployeeId.mockResolvedValue(null);
            mockEmployeeRepository.create.mockResolvedValue(mockEmployee);
            mockAuditLogRepository.logEmployeeCreate.mockResolvedValue({});
            // Act
            const result = await employeeService.createEmployee(validCreateRequest, hrAdminContext);
            // Assert
            expect(result).toBeDefined();
            expect(result.employeeId).toBe(validCreateRequest.employeeId);
            expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
            expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
            expect(mockEmployeeRepository.findByEmail).toHaveBeenCalledWith(validCreateRequest.personalInfo.email, mockClient);
            expect(mockEmployeeRepository.findByEmployeeId).toHaveBeenCalledWith(validCreateRequest.employeeId, mockClient);
            expect(mockEmployeeRepository.create).toHaveBeenCalled();
            expect(mockAuditLogRepository.logEmployeeCreate).toHaveBeenCalled();
        });
        it('should throw ValidationError when user lacks HR_ADMIN permissions', async () => {
            // Act & Assert
            await expect(employeeService.createEmployee(validCreateRequest, managerContext)).rejects.toThrow(ValidationError);
            await expect(employeeService.createEmployee(validCreateRequest, managerContext)).rejects.toThrow('Insufficient permissions to create employee');
        });
        it('should throw ValidationError when email already exists', async () => {
            // Arrange
            const existingEmployee = Employee.createNew({
                employeeId: 'EMP002',
                personalInfo: {
                    firstName: 'Jane',
                    lastName: 'Smith',
                    email: 'john.doe@company.com',
                    phone: '+1-555-0123',
                    address: {
                        street: '123 Main St',
                        city: 'New York',
                        state: 'NY',
                        zipCode: '10001',
                        country: 'United States'
                    }
                },
                jobInfo: { ...validCreateRequest.jobInfo },
                status: { current: 'ACTIVE', effectiveDate: new Date() },
                createdBy: TEST_UUID_2,
                updatedBy: TEST_UUID_2
            });
            mockEmployeeRepository.findByEmail.mockResolvedValue(existingEmployee);
            // Act & Assert
            await expect(employeeService.createEmployee(validCreateRequest, hrAdminContext)).rejects.toThrow(ValidationError);
            await expect(employeeService.createEmployee(validCreateRequest, hrAdminContext)).rejects.toThrow('Employee with this email already exists');
            expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
        });
        it('should throw ValidationError when employee ID already exists', async () => {
            // Arrange
            const existingEmployee = Employee.createNew({
                employeeId: validCreateRequest.employeeId,
                personalInfo: {
                    firstName: 'Jane',
                    lastName: 'Smith',
                    email: 'jane.smith@company.com'
                },
                jobInfo: { ...validCreateRequest.jobInfo },
                status: { current: 'ACTIVE', effectiveDate: new Date() },
                createdBy: TEST_UUID_2,
                updatedBy: TEST_UUID_2
            });
            mockEmployeeRepository.findByEmail.mockResolvedValue(null);
            mockEmployeeRepository.findByEmployeeId.mockResolvedValue(existingEmployee);
            // Act & Assert
            await expect(employeeService.createEmployee(validCreateRequest, hrAdminContext)).rejects.toThrow(ValidationError);
            await expect(employeeService.createEmployee(validCreateRequest, hrAdminContext)).rejects.toThrow('Employee ID already exists');
        });
        it('should throw ValidationError when manager does not exist', async () => {
            // Arrange
            const requestWithManager = {
                ...validCreateRequest,
                jobInfo: {
                    ...validCreateRequest.jobInfo,
                    managerId: 'non-existent-manager'
                }
            };
            mockEmployeeRepository.findByEmail.mockResolvedValue(null);
            mockEmployeeRepository.findByEmployeeId.mockResolvedValue(null);
            mockEmployeeRepository.findById.mockResolvedValue(null);
            // Act & Assert
            await expect(employeeService.createEmployee(requestWithManager, hrAdminContext)).rejects.toThrow(ValidationError);
            await expect(employeeService.createEmployee(requestWithManager, hrAdminContext)).rejects.toThrow('Specified manager does not exist');
        });
        it('should throw ValidationError when manager is not active', async () => {
            // Arrange
            const inactiveManager = Employee.createNew({
                employeeId: 'MGR001',
                personalInfo: {
                    firstName: 'Manager',
                    lastName: 'Inactive',
                    email: 'manager@company.com'
                },
                jobInfo: {
                    jobTitle: 'Manager',
                    department: 'Engineering',
                    startDate: new Date('2023-01-01'),
                    employmentType: 'FULL_TIME',
                    location: 'New York'
                },
                status: { current: 'INACTIVE', effectiveDate: new Date() },
                createdBy: TEST_UUID_1,
                updatedBy: TEST_UUID_1
            });
            const requestWithManager = {
                ...validCreateRequest,
                jobInfo: {
                    ...validCreateRequest.jobInfo,
                    managerId: 'manager-123'
                }
            };
            mockEmployeeRepository.findByEmail.mockResolvedValue(null);
            mockEmployeeRepository.findByEmployeeId.mockResolvedValue(null);
            mockEmployeeRepository.findById.mockResolvedValue(inactiveManager);
            // Act & Assert
            await expect(employeeService.createEmployee(requestWithManager, hrAdminContext)).rejects.toThrow(ValidationError);
            await expect(employeeService.createEmployee(requestWithManager, hrAdminContext)).rejects.toThrow('Specified manager is not active');
        });
        it('should rollback transaction on error', async () => {
            // Arrange
            mockEmployeeRepository.findByEmail.mockRejectedValue(new Error('Database error'));
            // Act & Assert
            await expect(employeeService.createEmployee(validCreateRequest, hrAdminContext)).rejects.toThrow('Database error');
            expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
            expect(mockClient.release).toHaveBeenCalled();
        });
    });
    describe('updateEmployee', () => {
        const existingEmployee = Employee.createNew({
            employeeId: 'EMP001',
            personalInfo: {
                firstName: 'John',
                lastName: 'Doe',
                email: 'john.doe@company.com'
            },
            jobInfo: {
                jobTitle: 'Software Engineer',
                department: 'Engineering',
                startDate: new Date('2024-01-15'),
                employmentType: 'FULL_TIME',
                location: 'New York'
            },
            status: { current: 'ACTIVE', effectiveDate: new Date() },
            createdBy: TEST_UUID_1,
            updatedBy: TEST_UUID_1
        });
        const updateRequest = {
            personalInfo: {
                phone: '+1-555-9999'
            },
            jobInfo: {
                jobTitle: 'Senior Software Engineer'
            },
            updatedBy: TEST_UUID_1
        };
        const hrAdminContext = {
            userId: 'hr-admin-123',
            role: 'HR_ADMIN'
        };
        it('should update employee successfully with valid data and permissions', async () => {
            // Arrange
            const updatedEmployee = existingEmployee.update({
                personalInfo: { ...existingEmployee.personalInfo.toJSON(), phone: '+1-555-9999' },
                jobInfo: { ...existingEmployee.jobInfo.toJSON(), jobTitle: 'Senior Software Engineer' }
            }, updateRequest.updatedBy);
            mockEmployeeRepository.findById.mockResolvedValue(existingEmployee);
            mockEmployeeRepository.update.mockResolvedValue(updatedEmployee);
            mockAuditLogRepository.logEmployeeUpdate.mockResolvedValue({});
            // Act
            const result = await employeeService.updateEmployee('emp-123', updateRequest, hrAdminContext);
            // Assert
            expect(result).toBeDefined();
            expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
            expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
            expect(mockEmployeeRepository.findById).toHaveBeenCalledWith('emp-123', mockClient);
            expect(mockEmployeeRepository.update).toHaveBeenCalled();
            expect(mockAuditLogRepository.logEmployeeUpdate).toHaveBeenCalled();
        });
        it('should throw ValidationError when employee not found', async () => {
            // Arrange
            mockEmployeeRepository.findById.mockResolvedValue(null);
            // Act & Assert
            await expect(employeeService.updateEmployee('non-existent', updateRequest, hrAdminContext)).rejects.toThrow(ValidationError);
            await expect(employeeService.updateEmployee('non-existent', updateRequest, hrAdminContext)).rejects.toThrow('Employee not found');
        });
        it('should throw ValidationError when manager tries to update non-direct report', async () => {
            // Arrange
            const managerContext = {
                userId: 'manager-123',
                role: 'MANAGER',
                managedEmployeeIds: ['other-employee']
            };
            mockEmployeeRepository.findById.mockResolvedValue(existingEmployee);
            // Act & Assert
            await expect(employeeService.updateEmployee('emp-123', updateRequest, managerContext)).rejects.toThrow(ValidationError);
            await expect(employeeService.updateEmployee('emp-123', updateRequest, managerContext)).rejects.toThrow('Managers can only update their direct reports');
        });
        it('should throw ValidationError when employee tries to update other employee', async () => {
            // Arrange
            const employeeContext = {
                userId: 'other-employee',
                role: 'EMPLOYEE'
            };
            mockEmployeeRepository.findById.mockResolvedValue(existingEmployee);
            // Act & Assert
            await expect(employeeService.updateEmployee('emp-123', updateRequest, employeeContext)).rejects.toThrow(ValidationError);
            await expect(employeeService.updateEmployee('emp-123', updateRequest, employeeContext)).rejects.toThrow('Employees can only update their own profile');
        });
        it('should throw ValidationError when email already exists for different employee', async () => {
            // Arrange
            const otherEmployee = Employee.createNew({
                employeeId: 'EMP002',
                personalInfo: {
                    firstName: 'Jane',
                    lastName: 'Smith',
                    email: 'new.email@company.com'
                },
                jobInfo: {
                    jobTitle: 'Designer',
                    department: 'Design',
                    startDate: new Date('2024-01-01'),
                    employmentType: 'FULL_TIME',
                    location: 'New York'
                },
                status: { current: 'ACTIVE', effectiveDate: new Date() },
                createdBy: TEST_UUID_1,
                updatedBy: TEST_UUID_1
            });
            const emailUpdateRequest = {
                personalInfo: {
                    email: 'new.email@company.com'
                },
                updatedBy: TEST_UUID_1
            };
            mockEmployeeRepository.findById.mockResolvedValue(existingEmployee);
            mockEmployeeRepository.findByEmail.mockResolvedValue(otherEmployee);
            // Act & Assert
            await expect(employeeService.updateEmployee('emp-123', emailUpdateRequest, hrAdminContext)).rejects.toThrow(ValidationError);
            await expect(employeeService.updateEmployee('emp-123', emailUpdateRequest, hrAdminContext)).rejects.toThrow('Employee with this email already exists');
        });
        it('should prevent employee from being their own manager', async () => {
            // Arrange
            const managerUpdateRequest = {
                jobInfo: {
                    managerId: 'emp-123' // Same as the employee being updated
                },
                updatedBy: TEST_UUID_1
            };
            mockEmployeeRepository.findById.mockResolvedValue(existingEmployee);
            // Act & Assert
            await expect(employeeService.updateEmployee('emp-123', managerUpdateRequest, hrAdminContext)).rejects.toThrow(ValidationError);
            await expect(employeeService.updateEmployee('emp-123', managerUpdateRequest, hrAdminContext)).rejects.toThrow('Employee cannot be their own manager');
        });
    });
    describe('getEmployee', () => {
        const employee = Employee.createNew({
            employeeId: 'EMP001',
            personalInfo: {
                firstName: 'John',
                lastName: 'Doe',
                email: 'john.doe@company.com',
                socialSecurityNumber: '123-45-6789'
            },
            jobInfo: {
                jobTitle: 'Software Engineer',
                department: 'Engineering',
                startDate: new Date('2024-01-15'),
                employmentType: 'FULL_TIME',
                location: 'New York',
                salary: 100000
            },
            status: { current: 'ACTIVE', effectiveDate: new Date() },
            createdBy: TEST_UUID_1,
            updatedBy: TEST_UUID_1
        });
        it('should return employee for HR_ADMIN with all data', async () => {
            // Arrange
            const hrAdminContext = {
                userId: 'hr-admin-123',
                role: 'HR_ADMIN'
            };
            mockEmployeeRepository.findById.mockResolvedValue(employee);
            // Act
            const result = await employeeService.getEmployee('emp-123', hrAdminContext);
            // Assert
            expect(result).toBeDefined();
            expect(result?.personalInfo.socialSecurityNumber).toBe('123-45-6789');
            expect(result?.jobInfo.salary).toBe(100000);
        });
        it('should return employee for MANAGER with filtered data', async () => {
            // Arrange
            const managerContext = {
                userId: 'manager-123',
                role: 'MANAGER',
                managedEmployeeIds: [employee.id] // Use the actual employee ID
            };
            mockEmployeeRepository.findById.mockResolvedValue(employee);
            // Act
            const result = await employeeService.getEmployee(employee.id, managerContext);
            // Assert
            expect(result).toBeDefined();
            expect(result?.personalInfo.socialSecurityNumber).toBeUndefined();
            expect(result?.jobInfo.salary).toBeUndefined();
        });
        it('should return employee for VIEWER with limited data', async () => {
            // Arrange
            const viewerContext = {
                userId: 'viewer-123',
                role: 'VIEWER'
            };
            mockEmployeeRepository.findById.mockResolvedValue(employee);
            // Act
            const result = await employeeService.getEmployee('emp-123', viewerContext);
            // Assert
            expect(result).toBeDefined();
            expect(result?.personalInfo.socialSecurityNumber).toBeUndefined();
            expect(result?.personalInfo.phone).toBeUndefined();
            expect(result?.jobInfo.salary).toBeUndefined();
        });
        it('should throw ValidationError when manager tries to view non-direct report', async () => {
            // Arrange
            const managerContext = {
                userId: 'manager-123',
                role: 'MANAGER',
                managedEmployeeIds: ['other-employee']
            };
            mockEmployeeRepository.findById.mockResolvedValue(employee);
            // Act & Assert
            await expect(employeeService.getEmployee('emp-123', managerContext)).rejects.toThrow(ValidationError);
            await expect(employeeService.getEmployee('emp-123', managerContext)).rejects.toThrow('Insufficient permissions to view this employee');
        });
        it('should return null when employee not found', async () => {
            // Arrange
            const hrAdminContext = {
                userId: 'hr-admin-123',
                role: 'HR_ADMIN'
            };
            mockEmployeeRepository.findById.mockResolvedValue(null);
            // Act
            const result = await employeeService.getEmployee('non-existent', hrAdminContext);
            // Assert
            expect(result).toBeNull();
        });
    });
    describe('searchEmployees', () => {
        const employees = [
            Employee.createNew({
                employeeId: 'EMP001',
                personalInfo: { firstName: 'John', lastName: 'Doe', email: 'john@company.com' },
                jobInfo: { jobTitle: 'Engineer', department: 'Engineering', startDate: new Date(), employmentType: 'FULL_TIME', location: 'NY' },
                status: { current: 'ACTIVE', effectiveDate: new Date() },
                createdBy: TEST_UUID_1, updatedBy: TEST_UUID_1
            }),
            Employee.createNew({
                employeeId: 'EMP002',
                personalInfo: { firstName: 'Jane', lastName: 'Smith', email: 'jane@company.com' },
                jobInfo: { jobTitle: 'Designer', department: 'Design', startDate: new Date(), employmentType: 'FULL_TIME', location: 'NY' },
                status: { current: 'ACTIVE', effectiveDate: new Date() },
                createdBy: TEST_UUID_1, updatedBy: TEST_UUID_1
            })
        ];
        it('should return paginated employees for HR_ADMIN', async () => {
            // Arrange
            const hrAdminContext = {
                userId: 'hr-admin-123',
                role: 'HR_ADMIN'
            };
            const paginatedResult = {
                data: employees,
                pagination: {
                    page: 1,
                    limit: 10,
                    total: 2,
                    totalPages: 1,
                    hasNext: false,
                    hasPrev: false
                }
            };
            mockEmployeeRepository.findAll.mockResolvedValue(paginatedResult);
            // Act
            const result = await employeeService.searchEmployees({ search: 'John' }, { page: 1, limit: 10 }, hrAdminContext);
            // Assert
            expect(result).toBeDefined();
            expect(result.data).toHaveLength(2);
            expect(result.pagination.total).toBe(2);
        });
        it('should return empty result for MANAGER with no managed employees', async () => {
            // Arrange
            const managerContext = {
                userId: 'manager-123',
                role: 'MANAGER',
                managedEmployeeIds: []
            };
            // Act
            const result = await employeeService.searchEmployees({}, { page: 1, limit: 10 }, managerContext);
            // Assert
            expect(result.data).toHaveLength(0);
            expect(result.pagination.total).toBe(0);
        });
    });
    describe('getDirectReports', () => {
        const directReports = [
            Employee.createNew({
                employeeId: 'EMP001',
                personalInfo: { firstName: 'John', lastName: 'Doe', email: 'john@company.com' },
                jobInfo: { jobTitle: 'Engineer', department: 'Engineering', managerId: TEST_UUID_2, startDate: new Date(), employmentType: 'FULL_TIME', location: 'NY' },
                status: { current: 'ACTIVE', effectiveDate: new Date() },
                createdBy: TEST_UUID_1, updatedBy: TEST_UUID_1
            })
        ];
        it('should return direct reports for manager', async () => {
            // Arrange
            const managerContext = {
                userId: 'manager-123',
                role: 'MANAGER'
            };
            mockEmployeeRepository.getDirectReports.mockResolvedValue(directReports);
            // Act
            const result = await employeeService.getDirectReports('manager-123', managerContext);
            // Assert
            expect(result).toHaveLength(1);
            expect(result[0].jobInfo.managerId).toBe(TEST_UUID_2);
        });
        it('should throw ValidationError when non-manager tries to view other manager reports', async () => {
            // Arrange
            const otherManagerContext = {
                userId: 'other-manager',
                role: 'MANAGER'
            };
            // Act & Assert
            await expect(employeeService.getDirectReports('manager-123', otherManagerContext)).rejects.toThrow(ValidationError);
            await expect(employeeService.getDirectReports('manager-123', otherManagerContext)).rejects.toThrow('Insufficient permissions to view direct reports');
        });
        it('should allow HR_ADMIN to view any manager direct reports', async () => {
            // Arrange
            const hrAdminContext = {
                userId: 'hr-admin-123',
                role: 'HR_ADMIN'
            };
            mockEmployeeRepository.getDirectReports.mockResolvedValue(directReports);
            // Act
            const result = await employeeService.getDirectReports('manager-123', hrAdminContext);
            // Assert
            expect(result).toHaveLength(1);
        });
    });
    describe('updateEmployeeStatus', () => {
        const activeEmployee = Employee.createNew({
            employeeId: 'EMP001',
            personalInfo: {
                firstName: 'John',
                lastName: 'Doe',
                email: 'john.doe@company.com'
            },
            jobInfo: {
                jobTitle: 'Software Engineer',
                department: 'Engineering',
                startDate: new Date('2023-01-15'), // Over a year ago
                employmentType: 'FULL_TIME',
                location: 'New York'
            },
            status: { current: 'ACTIVE', effectiveDate: new Date('2023-01-15') },
            createdBy: TEST_UUID_1,
            updatedBy: TEST_UUID_1
        });
        const hrAdminContext = {
            userId: TEST_UUID_1,
            role: 'HR_ADMIN'
        };
        const managerContext = {
            userId: 'manager-123',
            role: 'MANAGER'
        };
        it('should update employee status successfully with valid data and HR_ADMIN permissions', async () => {
            // Arrange
            const updatedEmployee = activeEmployee.updateStatus({
                current: 'TERMINATED',
                effectiveDate: new Date(),
                reason: 'RESIGNATION'
            }, TEST_UUID_1);
            mockEmployeeRepository.findById.mockResolvedValue(activeEmployee);
            mockEmployeeRepository.updateStatus.mockResolvedValue(updatedEmployee);
            mockAuditLogRepository.logEmployeeStatusChange.mockResolvedValue({});
            // Act
            const result = await employeeService.updateEmployeeStatus('emp-123', 'TERMINATED', new Date(), 'RESIGNATION', 'Employee resigned', hrAdminContext);
            // Assert
            expect(result).toBeDefined();
            expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
            expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
            expect(mockEmployeeRepository.findById).toHaveBeenCalledWith('emp-123', mockClient);
            expect(mockEmployeeRepository.updateStatus).toHaveBeenCalled();
            expect(mockAuditLogRepository.logEmployeeStatusChange).toHaveBeenCalled();
        });
        it('should throw ValidationError when user lacks HR_ADMIN permissions', async () => {
            // Act & Assert
            await expect(employeeService.updateEmployeeStatus('emp-123', 'TERMINATED', new Date(), 'RESIGNATION', undefined, managerContext)).rejects.toThrow(ValidationError);
            await expect(employeeService.updateEmployeeStatus('emp-123', 'TERMINATED', new Date(), 'RESIGNATION', undefined, managerContext)).rejects.toThrow('Insufficient permissions to change employee status');
        });
        it('should throw ValidationError when employee not found', async () => {
            // Arrange
            mockEmployeeRepository.findById.mockResolvedValue(null);
            // Act & Assert
            await expect(employeeService.updateEmployeeStatus('non-existent', 'TERMINATED', new Date(), 'RESIGNATION', undefined, hrAdminContext)).rejects.toThrow(ValidationError);
            await expect(employeeService.updateEmployeeStatus('non-existent', 'TERMINATED', new Date(), 'RESIGNATION', undefined, hrAdminContext)).rejects.toThrow('Employee not found');
        });
        it('should throw ValidationError when trying to change status of terminated employee', async () => {
            // Arrange
            const terminatedEmployee = activeEmployee.updateStatus({
                current: 'TERMINATED',
                effectiveDate: new Date(),
                reason: 'RESIGNATION'
            }, TEST_UUID_1);
            mockEmployeeRepository.findById.mockResolvedValue(terminatedEmployee);
            // Act & Assert
            await expect(employeeService.updateEmployeeStatus('emp-123', 'ACTIVE', new Date(), 'REACTIVATION', undefined, hrAdminContext)).rejects.toThrow(ValidationError);
            await expect(employeeService.updateEmployeeStatus('emp-123', 'ACTIVE', new Date(), 'REACTIVATION', undefined, hrAdminContext)).rejects.toThrow('Cannot change status of terminated employee');
        });
        it('should throw ValidationError when reason is missing', async () => {
            // Arrange
            mockEmployeeRepository.findById.mockResolvedValue(activeEmployee);
            // Act & Assert
            await expect(employeeService.updateEmployeeStatus('emp-123', 'TERMINATED', new Date(), '', undefined, hrAdminContext)).rejects.toThrow(ValidationError);
            await expect(employeeService.updateEmployeeStatus('emp-123', 'TERMINATED', new Date(), '', undefined, hrAdminContext)).rejects.toThrow('Reason is required for status changes');
        });
        it('should throw ValidationError for invalid termination reason', async () => {
            // Arrange
            mockEmployeeRepository.findById.mockResolvedValue(activeEmployee);
            // Act & Assert
            await expect(employeeService.updateEmployeeStatus('emp-123', 'TERMINATED', new Date(), 'INVALID_REASON', undefined, hrAdminContext)).rejects.toThrow(ValidationError);
            await expect(employeeService.updateEmployeeStatus('emp-123', 'TERMINATED', new Date(), 'INVALID_REASON', undefined, hrAdminContext)).rejects.toThrow('Invalid termination reason');
        });
        it('should throw ValidationError for invalid leave reason', async () => {
            // Arrange
            mockEmployeeRepository.findById.mockResolvedValue(activeEmployee);
            // Act & Assert
            await expect(employeeService.updateEmployeeStatus('emp-123', 'ON_LEAVE', new Date(), 'INVALID_LEAVE', undefined, hrAdminContext)).rejects.toThrow(ValidationError);
            await expect(employeeService.updateEmployeeStatus('emp-123', 'ON_LEAVE', new Date(), 'INVALID_LEAVE', undefined, hrAdminContext)).rejects.toThrow('Invalid leave reason');
        });
        it('should throw ValidationError when termination date is in the future', async () => {
            // Arrange
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + 1);
            mockEmployeeRepository.findById.mockResolvedValue(activeEmployee);
            // Act & Assert
            await expect(employeeService.updateEmployeeStatus('emp-123', 'TERMINATED', futureDate, 'RESIGNATION', undefined, hrAdminContext)).rejects.toThrow(ValidationError);
            await expect(employeeService.updateEmployeeStatus('emp-123', 'TERMINATED', futureDate, 'RESIGNATION', undefined, hrAdminContext)).rejects.toThrow('Termination effective date cannot be in the future');
        });
        it('should throw ValidationError when termination date is before start date', async () => {
            // Arrange
            const beforeStartDate = new Date('2022-12-01'); // Before employee start date
            mockEmployeeRepository.findById.mockResolvedValue(activeEmployee);
            // Act & Assert
            await expect(employeeService.updateEmployeeStatus('emp-123', 'TERMINATED', beforeStartDate, 'RESIGNATION', undefined, hrAdminContext)).rejects.toThrow(ValidationError);
            await expect(employeeService.updateEmployeeStatus('emp-123', 'TERMINATED', beforeStartDate, 'RESIGNATION', undefined, hrAdminContext)).rejects.toThrow('Termination effective date cannot be before start date');
        });
        it('should throw ValidationError for retirement with insufficient service', async () => {
            // Arrange
            const newEmployee = Employee.createNew({
                employeeId: 'EMP002',
                personalInfo: {
                    firstName: 'Jane',
                    lastName: 'Smith',
                    email: 'jane.smith@company.com'
                },
                jobInfo: {
                    jobTitle: 'Junior Developer',
                    department: 'Engineering',
                    startDate: new Date(), // Started today
                    employmentType: 'FULL_TIME',
                    location: 'New York'
                },
                status: { current: 'ACTIVE', effectiveDate: new Date() },
                createdBy: TEST_UUID_1,
                updatedBy: TEST_UUID_1
            });
            mockEmployeeRepository.findById.mockResolvedValue(newEmployee);
            // Act & Assert
            await expect(employeeService.updateEmployeeStatus('emp-123', 'TERMINATED', new Date(), 'RETIREMENT', undefined, hrAdminContext)).rejects.toThrow(ValidationError);
            await expect(employeeService.updateEmployeeStatus('emp-123', 'TERMINATED', new Date(), 'RETIREMENT', undefined, hrAdminContext)).rejects.toThrow('Retirement requires at least 1 year of service');
        });
        it('should throw ValidationError when leave date is too far in the past', async () => {
            // Arrange
            const tooOldDate = new Date();
            tooOldDate.setDate(tooOldDate.getDate() - 35); // 35 days ago
            mockEmployeeRepository.findById.mockResolvedValue(activeEmployee);
            // Act & Assert
            await expect(employeeService.updateEmployeeStatus('emp-123', 'ON_LEAVE', tooOldDate, 'MEDICAL_LEAVE', undefined, hrAdminContext)).rejects.toThrow(ValidationError);
            await expect(employeeService.updateEmployeeStatus('emp-123', 'ON_LEAVE', tooOldDate, 'MEDICAL_LEAVE', undefined, hrAdminContext)).rejects.toThrow('Leave effective date cannot be more than 30 days in the past');
        });
        it('should throw ValidationError when non-active employee tries to go on leave', async () => {
            // Arrange
            const inactiveEmployee = activeEmployee.updateStatus({
                current: 'INACTIVE',
                effectiveDate: new Date(),
                reason: 'SUSPENDED'
            }, TEST_UUID_1);
            mockEmployeeRepository.findById.mockResolvedValue(inactiveEmployee);
            // Act & Assert
            await expect(employeeService.updateEmployeeStatus('emp-123', 'ON_LEAVE', new Date(), 'MEDICAL_LEAVE', undefined, hrAdminContext)).rejects.toThrow(ValidationError);
            await expect(employeeService.updateEmployeeStatus('emp-123', 'ON_LEAVE', new Date(), 'MEDICAL_LEAVE', undefined, hrAdminContext)).rejects.toThrow('Only active employees can go on leave');
        });
        it('should rollback transaction on error', async () => {
            // Arrange
            mockEmployeeRepository.findById.mockRejectedValue(new Error('Database error'));
            // Act & Assert
            await expect(employeeService.updateEmployeeStatus('emp-123', 'TERMINATED', new Date(), 'RESIGNATION', undefined, hrAdminContext)).rejects.toThrow('Database error');
            expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
            expect(mockClient.release).toHaveBeenCalled();
        });
    });
    describe('getEmployeeStatusHistory', () => {
        const employee = Employee.createNew({
            employeeId: 'EMP001',
            personalInfo: {
                firstName: 'John',
                lastName: 'Doe',
                email: 'john.doe@company.com'
            },
            jobInfo: {
                jobTitle: 'Software Engineer',
                department: 'Engineering',
                startDate: new Date('2024-01-15'),
                employmentType: 'FULL_TIME',
                location: 'New York'
            },
            status: { current: 'ACTIVE', effectiveDate: new Date() },
            createdBy: TEST_UUID_1,
            updatedBy: TEST_UUID_1
        });
        const mockAuditTrail = {
            data: [
                {
                    id: 'audit-1',
                    entityType: 'EMPLOYEE',
                    entityId: employee.id,
                    action: 'STATUS_CHANGE',
                    changes: {
                        before: { status: 'ACTIVE' },
                        after: { status: 'ON_LEAVE', reason: 'MEDICAL_LEAVE' }
                    },
                    metadata: {
                        effectiveDate: '2024-06-01T00:00:00.000Z',
                        notes: 'Medical procedure'
                    },
                    performedBy: TEST_UUID_1,
                    performedAt: new Date('2024-06-01')
                },
                {
                    id: 'audit-2',
                    entityType: 'EMPLOYEE',
                    entityId: employee.id,
                    action: 'UPDATE',
                    changes: { /* other changes */},
                    performedBy: TEST_UUID_1,
                    performedAt: new Date('2024-05-15')
                }
            ],
            pagination: {
                page: 1,
                limit: 100,
                total: 2,
                totalPages: 1,
                hasNext: false,
                hasPrev: false
            }
        };
        it('should return status history for HR_ADMIN', async () => {
            // Arrange
            const hrAdminContext = {
                userId: TEST_UUID_1,
                role: 'HR_ADMIN'
            };
            mockEmployeeRepository.findById.mockResolvedValue(employee);
            mockAuditLogRepository.getEntityAuditTrail.mockResolvedValue(mockAuditTrail);
            // Act
            const result = await employeeService.getEmployeeStatusHistory(employee.id, hrAdminContext);
            // Assert
            expect(result).toHaveLength(1); // Only status change events
            expect(result[0]).toEqual({
                id: 'audit-1',
                previousStatus: 'ACTIVE',
                newStatus: 'ON_LEAVE',
                reason: 'MEDICAL_LEAVE',
                effectiveDate: '2024-06-01T00:00:00.000Z',
                notes: 'Medical procedure',
                changedBy: TEST_UUID_1,
                changedAt: new Date('2024-06-01')
            });
        });
        it('should return status history for employee viewing their own record', async () => {
            // Arrange
            const employeeContext = {
                userId: employee.id,
                role: 'EMPLOYEE'
            };
            mockEmployeeRepository.findById.mockResolvedValue(employee);
            mockAuditLogRepository.getEntityAuditTrail.mockResolvedValue(mockAuditTrail);
            // Act
            const result = await employeeService.getEmployeeStatusHistory(employee.id, employeeContext);
            // Assert
            expect(result).toHaveLength(1);
        });
        it('should return status history for manager viewing direct report', async () => {
            // Arrange
            const managerContext = {
                userId: 'manager-123',
                role: 'MANAGER',
                managedEmployeeIds: [employee.id]
            };
            mockEmployeeRepository.findById.mockResolvedValue(employee);
            mockAuditLogRepository.getEntityAuditTrail.mockResolvedValue(mockAuditTrail);
            // Act
            const result = await employeeService.getEmployeeStatusHistory(employee.id, managerContext);
            // Assert
            expect(result).toHaveLength(1);
        });
        it('should throw ValidationError when employee not found', async () => {
            // Arrange
            const hrAdminContext = {
                userId: TEST_UUID_1,
                role: 'HR_ADMIN'
            };
            mockEmployeeRepository.findById.mockResolvedValue(null);
            // Act & Assert
            await expect(employeeService.getEmployeeStatusHistory('non-existent', hrAdminContext)).rejects.toThrow(ValidationError);
            await expect(employeeService.getEmployeeStatusHistory('non-existent', hrAdminContext)).rejects.toThrow('Employee not found');
        });
        it('should throw ValidationError when manager tries to view non-direct report', async () => {
            // Arrange
            const managerContext = {
                userId: 'manager-123',
                role: 'MANAGER',
                managedEmployeeIds: ['other-employee']
            };
            mockEmployeeRepository.findById.mockResolvedValue(employee);
            // Act & Assert
            await expect(employeeService.getEmployeeStatusHistory(employee.id, managerContext)).rejects.toThrow(ValidationError);
            await expect(employeeService.getEmployeeStatusHistory(employee.id, managerContext)).rejects.toThrow('Managers can only view status history of their direct reports');
        });
        it('should throw ValidationError for insufficient permissions', async () => {
            // Arrange
            const viewerContext = {
                userId: 'viewer-123',
                role: 'VIEWER'
            };
            mockEmployeeRepository.findById.mockResolvedValue(employee);
            // Act & Assert
            await expect(employeeService.getEmployeeStatusHistory(employee.id, viewerContext)).rejects.toThrow(ValidationError);
            await expect(employeeService.getEmployeeStatusHistory(employee.id, viewerContext)).rejects.toThrow('Insufficient permissions to view status history');
        });
    });
    describe('Organizational Hierarchy Management', () => {
        const manager = Employee.createNew({
            employeeId: 'MGR001',
            personalInfo: {
                firstName: 'Manager',
                lastName: 'Smith',
                email: 'manager@company.com'
            },
            jobInfo: {
                jobTitle: 'Engineering Manager',
                department: 'Engineering',
                startDate: new Date('2023-01-01'),
                employmentType: 'FULL_TIME',
                location: 'New York'
            },
            status: { current: 'ACTIVE', effectiveDate: new Date() },
            createdBy: TEST_UUID_1,
            updatedBy: TEST_UUID_1
        });
        const employee = Employee.createNew({
            employeeId: 'EMP001',
            personalInfo: {
                firstName: 'John',
                lastName: 'Doe',
                email: 'john.doe@company.com'
            },
            jobInfo: {
                jobTitle: 'Software Engineer',
                department: 'Engineering',
                managerId: manager.id,
                startDate: new Date('2024-01-15'),
                employmentType: 'FULL_TIME',
                location: 'New York'
            },
            status: { current: 'ACTIVE', effectiveDate: new Date() },
            createdBy: TEST_UUID_1,
            updatedBy: TEST_UUID_1
        });
        const seniorManager = Employee.createNew({
            employeeId: 'SMGR001',
            personalInfo: {
                firstName: 'Senior',
                lastName: 'Manager',
                email: 'senior.manager@company.com'
            },
            jobInfo: {
                jobTitle: 'Senior Engineering Manager',
                department: 'Engineering',
                startDate: new Date('2022-01-01'),
                employmentType: 'FULL_TIME',
                location: 'New York'
            },
            status: { current: 'ACTIVE', effectiveDate: new Date() },
            createdBy: TEST_UUID_1,
            updatedBy: TEST_UUID_1
        });
        const hrAdminContext = {
            userId: 'hr-admin-123',
            role: 'HR_ADMIN'
        };
        const managerContext = {
            userId: manager.id,
            role: 'MANAGER',
            managedEmployeeIds: [employee.id]
        };
        describe('updateManagerEmployeeRelationship', () => {
            it('should update manager relationship successfully with HR_ADMIN permissions', async () => {
                // Arrange
                const updatedEmployee = employee.updateJobInfo({ managerId: seniorManager.id }, TEST_UUID_1);
                mockEmployeeRepository.findById
                    .mockResolvedValueOnce(employee) // First call for existing employee
                    .mockResolvedValueOnce(seniorManager); // Second call for new manager
                mockEmployeeRepository.update.mockResolvedValue(updatedEmployee);
                mockAuditLogRepository.logEmployeeUpdate.mockResolvedValue({});
                // Act
                const result = await employeeService.updateManagerEmployeeRelationship(employee.id, seniorManager.id, hrAdminContext);
                // Assert
                expect(result).toBeDefined();
                expect(result.jobInfo.managerId).toBe(seniorManager.id);
                expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
                expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
                expect(mockEmployeeRepository.findById).toHaveBeenCalledWith(employee.id, mockClient);
                expect(mockEmployeeRepository.findById).toHaveBeenCalledWith(seniorManager.id, mockClient);
                expect(mockAuditLogRepository.logEmployeeUpdate).toHaveBeenCalled();
            });
            it('should remove manager relationship when setting to null', async () => {
                // Arrange
                const updatedEmployee = employee.updateJobInfo({ managerId: undefined }, TEST_UUID_1);
                mockEmployeeRepository.findById.mockResolvedValue(employee);
                mockEmployeeRepository.update.mockResolvedValue(updatedEmployee);
                mockAuditLogRepository.logEmployeeUpdate.mockResolvedValue({});
                // Act
                const result = await employeeService.updateManagerEmployeeRelationship(employee.id, null, hrAdminContext);
                // Assert
                expect(result).toBeDefined();
                expect(result.jobInfo.managerId).toBeUndefined();
            });
            it('should throw ValidationError when user lacks HR_ADMIN permissions', async () => {
                // Arrange
                const nonHrContext = {
                    userId: 'manager-123',
                    role: 'MANAGER'
                };
                // Act & Assert
                await expect(employeeService.updateManagerEmployeeRelationship(employee.id, seniorManager.id, nonHrContext)).rejects.toThrow(ValidationError);
                await expect(employeeService.updateManagerEmployeeRelationship(employee.id, seniorManager.id, nonHrContext)).rejects.toThrow('Insufficient permissions to change reporting relationships');
            });
            it('should throw ValidationError when employee not found', async () => {
                // Arrange
                mockEmployeeRepository.findById.mockResolvedValue(null);
                // Act & Assert
                await expect(employeeService.updateManagerEmployeeRelationship('non-existent', seniorManager.id, hrAdminContext)).rejects.toThrow(ValidationError);
                await expect(employeeService.updateManagerEmployeeRelationship('non-existent', seniorManager.id, hrAdminContext)).rejects.toThrow('Employee not found');
            });
            it('should throw ValidationError when new manager not found', async () => {
                // Arrange
                mockEmployeeRepository.findById
                    .mockResolvedValueOnce(employee)
                    .mockResolvedValueOnce(null);
                // Act & Assert
                await expect(employeeService.updateManagerEmployeeRelationship(employee.id, 'non-existent-manager', hrAdminContext)).rejects.toThrow(ValidationError);
                await expect(employeeService.updateManagerEmployeeRelationship(employee.id, 'non-existent-manager', hrAdminContext)).rejects.toThrow('Specified manager does not exist');
            });
            it('should throw ValidationError when employee tries to be their own manager', async () => {
                // Arrange
                mockEmployeeRepository.findById.mockResolvedValue(employee);
                // Act & Assert
                await expect(employeeService.updateManagerEmployeeRelationship(employee.id, employee.id, hrAdminContext)).rejects.toThrow(ValidationError);
                await expect(employeeService.updateManagerEmployeeRelationship(employee.id, employee.id, hrAdminContext)).rejects.toThrow('Employee cannot be their own manager');
            });
            it('should throw ValidationError when new manager is not active', async () => {
                // Arrange
                const inactiveManager = manager.updateStatus({
                    current: 'INACTIVE',
                    effectiveDate: new Date(),
                    reason: 'Leave of absence'
                }, TEST_UUID_1);
                mockEmployeeRepository.findById
                    .mockResolvedValueOnce(employee)
                    .mockResolvedValueOnce(inactiveManager);
                // Act & Assert
                await expect(employeeService.updateManagerEmployeeRelationship(employee.id, manager.id, hrAdminContext)).rejects.toThrow(ValidationError);
                await expect(employeeService.updateManagerEmployeeRelationship(employee.id, manager.id, hrAdminContext)).rejects.toThrow('Specified manager is not active');
            });
            it('should prevent circular reporting relationships', async () => {
                // Arrange - Create a scenario where manager would report to employee
                const circularEmployee = employee.updateJobInfo({ managerId: undefined }, TEST_UUID_1);
                const circularManager = manager.updateJobInfo({ managerId: employee.id }, TEST_UUID_1);
                mockEmployeeRepository.findById
                    .mockResolvedValueOnce(circularEmployee)
                    .mockResolvedValueOnce(circularManager)
                    .mockResolvedValueOnce(circularEmployee); // For circular validation
                // Act & Assert
                await expect(employeeService.updateManagerEmployeeRelationship(circularManager.id, circularEmployee.id, hrAdminContext)).rejects.toThrow(ValidationError);
                await expect(employeeService.updateManagerEmployeeRelationship(circularManager.id, circularEmployee.id, hrAdminContext)).rejects.toThrow('Circular reporting relationship detected');
            });
        });
        describe('getEmployeeHierarchy', () => {
            it('should return manager chain for employee', async () => {
                // Arrange
                const employeeWithManager = employee.updateJobInfo({ managerId: manager.id }, TEST_UUID_1);
                const managerWithSeniorManager = manager.updateJobInfo({ managerId: seniorManager.id }, TEST_UUID_1);
                mockEmployeeRepository.findById
                    .mockResolvedValueOnce(employeeWithManager) // Initial employee
                    .mockResolvedValueOnce(managerWithSeniorManager) // First manager
                    .mockResolvedValueOnce(seniorManager); // Senior manager (no manager above)
                // Act
                const result = await employeeService.getEmployeeHierarchy(employee.id, hrAdminContext);
                // Assert
                expect(result).toHaveLength(2);
                expect(result[0].id).toBe(manager.id);
                expect(result[1].id).toBe(seniorManager.id);
            });
            it('should return empty array for employee with no manager', async () => {
                // Arrange
                const employeeWithoutManager = employee.updateJobInfo({ managerId: undefined }, TEST_UUID_1);
                mockEmployeeRepository.findById.mockResolvedValue(employeeWithoutManager);
                // Act
                const result = await employeeService.getEmployeeHierarchy(employee.id, hrAdminContext);
                // Assert
                expect(result).toHaveLength(0);
            });
            it('should allow manager to view hierarchy of direct reports', async () => {
                // Arrange
                mockEmployeeRepository.findById
                    .mockResolvedValueOnce(employee)
                    .mockResolvedValueOnce(manager);
                // Act
                const result = await employeeService.getEmployeeHierarchy(employee.id, managerContext);
                // Assert
                expect(result).toHaveLength(1);
                expect(result[0].id).toBe(manager.id);
            });
            it('should throw ValidationError when manager tries to view non-direct report hierarchy', async () => {
                // Arrange
                const otherEmployee = Employee.createNew({
                    employeeId: 'EMP002',
                    personalInfo: { firstName: 'Jane', lastName: 'Smith', email: 'jane@company.com' },
                    jobInfo: { jobTitle: 'Designer', department: 'Design', startDate: new Date(), employmentType: 'FULL_TIME', location: 'NY' },
                    status: { current: 'ACTIVE', effectiveDate: new Date() },
                    createdBy: TEST_UUID_1, updatedBy: TEST_UUID_1
                });
                mockEmployeeRepository.findById.mockResolvedValue(otherEmployee);
                // Act & Assert
                await expect(employeeService.getEmployeeHierarchy(otherEmployee.id, managerContext)).rejects.toThrow(ValidationError);
                await expect(employeeService.getEmployeeHierarchy(otherEmployee.id, managerContext)).rejects.toThrow('Managers can only view hierarchy of their direct reports');
            });
            it('should throw ValidationError when employee not found', async () => {
                // Arrange
                mockEmployeeRepository.findById.mockResolvedValue(null);
                // Act & Assert
                await expect(employeeService.getEmployeeHierarchy('non-existent', hrAdminContext)).rejects.toThrow(ValidationError);
                await expect(employeeService.getEmployeeHierarchy('non-existent', hrAdminContext)).rejects.toThrow('Employee not found');
            });
            it('should prevent infinite loops in hierarchy traversal', async () => {
                // Arrange - Create circular reference (shouldn't happen with proper validation, but safety test)
                const employeeWithManager = employee.updateJobInfo({ managerId: manager.id }, TEST_UUID_1);
                mockEmployeeRepository.findById
                    .mockResolvedValueOnce(employeeWithManager)
                    .mockResolvedValue(manager); // Manager always returns itself (simulating circular reference)
                // Act
                const result = await employeeService.getEmployeeHierarchy(employee.id, hrAdminContext);
                // Assert - Should stop at max depth (10) to prevent infinite loop
                expect(result.length).toBeLessThanOrEqual(10);
            });
        });
        describe('getManagerOrganization', () => {
            const directReport1 = Employee.createNew({
                employeeId: 'EMP001',
                personalInfo: { firstName: 'John', lastName: 'Doe', email: 'john@company.com' },
                jobInfo: { jobTitle: 'Engineer', department: 'Engineering', managerId: manager.id, startDate: new Date(), employmentType: 'FULL_TIME', location: 'NY' },
                status: { current: 'ACTIVE', effectiveDate: new Date() },
                createdBy: TEST_UUID_1, updatedBy: TEST_UUID_1
            });
            const directReport2 = Employee.createNew({
                employeeId: 'EMP002',
                personalInfo: { firstName: 'Jane', lastName: 'Smith', email: 'jane@company.com' },
                jobInfo: { jobTitle: 'Engineer', department: 'Engineering', managerId: manager.id, startDate: new Date(), employmentType: 'FULL_TIME', location: 'NY' },
                status: { current: 'ACTIVE', effectiveDate: new Date() },
                createdBy: TEST_UUID_1, updatedBy: TEST_UUID_1
            });
            const indirectReport = Employee.createNew({
                employeeId: 'EMP003',
                personalInfo: { firstName: 'Bob', lastName: 'Johnson', email: 'bob@company.com' },
                jobInfo: { jobTitle: 'Junior Engineer', department: 'Engineering', managerId: directReport1.id, startDate: new Date(), employmentType: 'FULL_TIME', location: 'NY' },
                status: { current: 'ACTIVE', effectiveDate: new Date() },
                createdBy: TEST_UUID_1, updatedBy: TEST_UUID_1
            });
            it('should return direct reports only when includeIndirectReports is false', async () => {
                // Arrange
                mockEmployeeRepository.findById.mockResolvedValue(manager);
                mockEmployeeRepository.getDirectReports.mockResolvedValue([directReport1, directReport2]);
                // Act
                const result = await employeeService.getManagerOrganization(manager.id, managerContext, false);
                // Assert
                expect(result).toHaveLength(2);
                expect(result.map(e => e.id)).toContain(directReport1.id);
                expect(result.map(e => e.id)).toContain(directReport2.id);
            });
            it('should return all reports when includeIndirectReports is true', async () => {
                // Arrange
                mockEmployeeRepository.findById.mockResolvedValue(manager);
                mockEmployeeRepository.getDirectReports
                    .mockResolvedValueOnce([directReport1, directReport2]) // Manager's direct reports
                    .mockResolvedValueOnce([indirectReport]) // directReport1's reports
                    .mockResolvedValueOnce([]); // directReport2's reports (none)
                // Act
                const result = await employeeService.getManagerOrganization(manager.id, managerContext, true);
                // Assert
                expect(result).toHaveLength(3);
                expect(result.map(e => e.id)).toContain(directReport1.id);
                expect(result.map(e => e.id)).toContain(directReport2.id);
                expect(result.map(e => e.id)).toContain(indirectReport.id);
            });
            it('should allow HR_ADMIN to view any manager organization', async () => {
                // Arrange
                mockEmployeeRepository.findById.mockResolvedValue(manager);
                mockEmployeeRepository.getDirectReports.mockResolvedValue([directReport1]);
                // Act
                const result = await employeeService.getManagerOrganization(manager.id, hrAdminContext, false);
                // Assert
                expect(result).toHaveLength(1);
                expect(result[0].id).toBe(directReport1.id);
            });
            it('should throw ValidationError when non-manager tries to view other manager organization', async () => {
                // Arrange
                const otherManagerContext = {
                    userId: 'other-manager',
                    role: 'MANAGER'
                };
                // Act & Assert
                await expect(employeeService.getManagerOrganization(manager.id, otherManagerContext, false)).rejects.toThrow(ValidationError);
                await expect(employeeService.getManagerOrganization(manager.id, otherManagerContext, false)).rejects.toThrow('Insufficient permissions to view organization');
            });
            it('should throw ValidationError when manager not found', async () => {
                // Arrange
                mockEmployeeRepository.findById.mockResolvedValue(null);
                // Act & Assert
                await expect(employeeService.getManagerOrganization('non-existent', hrAdminContext, false)).rejects.toThrow(ValidationError);
                await expect(employeeService.getManagerOrganization('non-existent', hrAdminContext, false)).rejects.toThrow('Manager not found');
            });
            it('should prevent infinite loops in recursive organization traversal', async () => {
                // Arrange - Create a scenario that could cause infinite recursion
                mockEmployeeRepository.findById.mockResolvedValue(manager);
                mockEmployeeRepository.getDirectReports.mockResolvedValue([directReport1]);
                // Act
                const result = await employeeService.getManagerOrganization(manager.id, managerContext, true);
                // Assert - Should complete without hanging
                expect(result).toBeDefined();
                expect(Array.isArray(result)).toBe(true);
            });
        });
        describe('getOrganizationalChart', () => {
            const chartEmployee = Employee.createNew({
                employeeId: 'EMP001',
                personalInfo: { firstName: 'John', lastName: 'Doe', email: 'john@company.com' },
                jobInfo: { jobTitle: 'Engineer', department: 'Engineering', managerId: manager.id, startDate: new Date(), employmentType: 'FULL_TIME', location: 'NY' },
                status: { current: 'ACTIVE', effectiveDate: new Date() },
                createdBy: TEST_UUID_1, updatedBy: TEST_UUID_1
            });
            it('should return organizational chart for manager', async () => {
                // Arrange
                mockEmployeeRepository.findById.mockResolvedValue(manager);
                mockEmployeeRepository.getDirectReports
                    .mockResolvedValueOnce([chartEmployee])
                    .mockResolvedValueOnce([]); // chartEmployee has no direct reports
                // Act
                const result = await employeeService.getOrganizationalChart(manager.id, managerContext, 2);
                // Assert
                expect(result).toBeDefined();
                expect(result.employee.id).toBe(manager.id);
                expect(result.directReports).toHaveLength(1);
                expect(result.directReports[0].employee.id).toBe(chartEmployee.id);
                expect(result.directReports[0].directReports).toHaveLength(0);
            });
            it('should respect maxDepth parameter', async () => {
                // Arrange
                mockEmployeeRepository.findById.mockResolvedValue(manager);
                mockEmployeeRepository.getDirectReports.mockResolvedValue([]);
                // Act
                const result = await employeeService.getOrganizationalChart(manager.id, managerContext, 1);
                // Assert
                expect(result).toBeDefined();
                expect(result.employee.id).toBe(manager.id);
                expect(result.directReports).toHaveLength(0);
            });
            it('should allow HR_ADMIN to view any organizational chart', async () => {
                // Arrange
                mockEmployeeRepository.findById.mockResolvedValue(manager);
                mockEmployeeRepository.getDirectReports.mockResolvedValue([chartEmployee]);
                // Act
                const result = await employeeService.getOrganizationalChart(manager.id, hrAdminContext, 2);
                // Assert
                expect(result).toBeDefined();
                expect(result.employee.id).toBe(manager.id);
            });
            it('should throw ValidationError when non-manager/HR tries to view chart', async () => {
                // Arrange
                const employeeContext = {
                    userId: 'employee-123',
                    role: 'EMPLOYEE'
                };
                // Act & Assert
                await expect(employeeService.getOrganizationalChart(manager.id, employeeContext, 2)).rejects.toThrow(ValidationError);
                await expect(employeeService.getOrganizationalChart(manager.id, employeeContext, 2)).rejects.toThrow('Insufficient permissions to view organizational chart');
            });
            it('should throw ValidationError when manager tries to view other manager chart', async () => {
                // Arrange
                const otherManagerContext = {
                    userId: 'other-manager',
                    role: 'MANAGER'
                };
                // Act & Assert
                await expect(employeeService.getOrganizationalChart(manager.id, otherManagerContext, 2)).rejects.toThrow(ValidationError);
                await expect(employeeService.getOrganizationalChart(manager.id, otherManagerContext, 2)).rejects.toThrow('Managers can only view their own organizational chart');
            });
            it('should throw ValidationError when root manager not found', async () => {
                // Arrange
                mockEmployeeRepository.findById.mockResolvedValue(null);
                // Act & Assert
                await expect(employeeService.getOrganizationalChart('non-existent', hrAdminContext, 2)).rejects.toThrow(ValidationError);
                await expect(employeeService.getOrganizationalChart('non-existent', hrAdminContext, 2)).rejects.toThrow('Root manager not found');
            });
            it('should prevent infinite loops in chart building', async () => {
                // Arrange
                mockEmployeeRepository.findById.mockResolvedValue(manager);
                mockEmployeeRepository.getDirectReports.mockResolvedValue([chartEmployee]);
                // Act
                const result = await employeeService.getOrganizationalChart(manager.id, managerContext, 5);
                // Assert - Should complete without hanging
                expect(result).toBeDefined();
                expect(typeof result).toBe('object');
            });
        });
        describe('validateManagerRelationshipUpdate', () => {
            it('should return valid for legitimate manager relationship', async () => {
                // Arrange
                mockEmployeeRepository.findById
                    .mockResolvedValueOnce(employee)
                    .mockResolvedValueOnce(manager);
                // Act
                const result = await employeeService.validateManagerRelationshipUpdate(employee.id, manager.id, hrAdminContext);
                // Assert
                expect(result.isValid).toBe(true);
                expect(result.reason).toBeUndefined();
            });
            it('should return invalid when user lacks permissions', async () => {
                // Arrange
                const nonHrContext = {
                    userId: 'manager-123',
                    role: 'MANAGER'
                };
                // Act
                const result = await employeeService.validateManagerRelationshipUpdate(employee.id, manager.id, nonHrContext);
                // Assert
                expect(result.isValid).toBe(false);
                expect(result.reason).toBe('Insufficient permissions');
            });
            it('should return invalid when employee not found', async () => {
                // Arrange
                mockEmployeeRepository.findById.mockResolvedValue(null);
                // Act
                const result = await employeeService.validateManagerRelationshipUpdate('non-existent', manager.id, hrAdminContext);
                // Assert
                expect(result.isValid).toBe(false);
                expect(result.reason).toBe('Employee not found');
            });
            it('should return invalid when manager not found', async () => {
                // Arrange
                mockEmployeeRepository.findById
                    .mockResolvedValueOnce(employee)
                    .mockResolvedValueOnce(null);
                // Act
                const result = await employeeService.validateManagerRelationshipUpdate(employee.id, 'non-existent-manager', hrAdminContext);
                // Assert
                expect(result.isValid).toBe(false);
                expect(result.reason).toBe('Manager not found');
            });
            it('should return invalid when manager is not active', async () => {
                // Arrange
                const inactiveManager = manager.updateStatus({
                    current: 'INACTIVE',
                    effectiveDate: new Date(),
                    reason: 'Leave'
                }, TEST_UUID_1);
                mockEmployeeRepository.findById
                    .mockResolvedValueOnce(employee)
                    .mockResolvedValueOnce(inactiveManager);
                // Act
                const result = await employeeService.validateManagerRelationshipUpdate(employee.id, manager.id, hrAdminContext);
                // Assert
                expect(result.isValid).toBe(false);
                expect(result.reason).toBe('Manager is not active');
            });
            it('should return invalid for self-reporting', async () => {
                // Arrange
                mockEmployeeRepository.findById.mockResolvedValue(employee);
                // Act
                const result = await employeeService.validateManagerRelationshipUpdate(employee.id, employee.id, hrAdminContext);
                // Assert
                expect(result.isValid).toBe(false);
                expect(result.reason).toBe('Employee cannot be their own manager');
            });
            it('should return invalid for circular reporting relationships', async () => {
                // Arrange - Employee would become manager of their current manager
                const circularManager = manager.updateJobInfo({ managerId: employee.id }, TEST_UUID_1);
                mockEmployeeRepository.findById
                    .mockResolvedValueOnce(circularManager) // Employee being updated
                    .mockResolvedValueOnce(employee) // New manager
                    .mockResolvedValueOnce(circularManager); // For circular validation
                // Act
                const result = await employeeService.validateManagerRelationshipUpdate(manager.id, employee.id, hrAdminContext);
                // Assert
                expect(result.isValid).toBe(false);
                expect(result.reason).toBe('Circular reporting relationship detected');
            });
        });
        describe('validateNoCircularReporting (private method testing via public methods)', () => {
            it('should detect direct circular relationship', async () => {
                // Arrange - Employee A reports to Employee B, trying to make B report to A
                const employeeA = employee;
                const employeeB = manager.updateJobInfo({ managerId: employeeA.id }, TEST_UUID_1);
                mockEmployeeRepository.findById
                    .mockResolvedValueOnce(employeeB)
                    .mockResolvedValueOnce(employeeA)
                    .mockResolvedValueOnce(employeeB); // For circular validation
                // Act & Assert
                await expect(employeeService.updateManagerEmployeeRelationship(employeeB.id, employeeA.id, hrAdminContext)).rejects.toThrow(ValidationError);
                await expect(employeeService.updateManagerEmployeeRelationship(employeeB.id, employeeA.id, hrAdminContext)).rejects.toThrow('Circular reporting relationship detected');
            });
            it('should detect indirect circular relationship', async () => {
                // Arrange - A -> B -> C, trying to make C report to A
                const employeeA = employee.updateJobInfo({ managerId: undefined }, TEST_UUID_1);
                const employeeB = manager.updateJobInfo({ managerId: employeeA.id }, TEST_UUID_1);
                const employeeC = seniorManager.updateJobInfo({ managerId: employeeB.id }, TEST_UUID_1);
                mockEmployeeRepository.findById
                    .mockResolvedValueOnce(employeeC) // Employee being updated
                    .mockResolvedValueOnce(employeeA) // New manager
                    .mockResolvedValueOnce(employeeB) // A's manager
                    .mockResolvedValueOnce(employeeC); // B's manager (creates circle)
                // Act & Assert
                await expect(employeeService.updateManagerEmployeeRelationship(employeeC.id, employeeA.id, hrAdminContext)).rejects.toThrow(ValidationError);
                await expect(employeeService.updateManagerEmployeeRelationship(employeeC.id, employeeA.id, hrAdminContext)).rejects.toThrow('Circular reporting relationship detected');
            });
            it('should allow valid manager chain updates', async () => {
                // Arrange - Valid hierarchy: A -> B -> C, making D report to C
                const employeeA = employee.updateJobInfo({ managerId: undefined }, TEST_UUID_1);
                const employeeB = manager.updateJobInfo({ managerId: employeeA.id }, TEST_UUID_1);
                const employeeC = seniorManager.updateJobInfo({ managerId: employeeB.id }, TEST_UUID_1);
                const employeeD = Employee.createNew({
                    employeeId: 'EMP004',
                    personalInfo: { firstName: 'David', lastName: 'Wilson', email: 'david@company.com' },
                    jobInfo: { jobTitle: 'Engineer', department: 'Engineering', startDate: new Date(), employmentType: 'FULL_TIME', location: 'NY' },
                    status: { current: 'ACTIVE', effectiveDate: new Date() },
                    createdBy: TEST_UUID_1, updatedBy: TEST_UUID_1
                });
                const updatedEmployeeD = employeeD.updateJobInfo({ managerId: employeeC.id }, TEST_UUID_1);
                mockEmployeeRepository.findById
                    .mockResolvedValueOnce(employeeD) // Employee being updated
                    .mockResolvedValueOnce(employeeC) // New manager
                    .mockResolvedValueOnce(employeeB) // C's manager
                    .mockResolvedValueOnce(employeeA) // B's manager
                    .mockResolvedValueOnce(null); // A has no manager (end of chain)
                mockEmployeeRepository.update.mockResolvedValue(updatedEmployeeD);
                mockAuditLogRepository.logEmployeeUpdate.mockResolvedValue({});
                // Act
                const result = await employeeService.updateManagerEmployeeRelationship(employeeD.id, employeeC.id, hrAdminContext);
                // Assert
                expect(result).toBeDefined();
                expect(result.jobInfo.managerId).toBe(employeeC.id);
            });
        });
    });
});
