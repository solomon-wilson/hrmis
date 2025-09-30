import { AuditLogRepository } from '../audit';
import { setupTestDatabase, teardownTestDatabase, cleanupTestData, createTestUser } from './setup';
describe('AuditLogRepository', () => {
    let repository;
    let testUser;
    beforeAll(async () => {
        await setupTestDatabase();
        repository = new AuditLogRepository();
        testUser = await createTestUser();
    });
    afterAll(async () => {
        await teardownTestDatabase();
    });
    beforeEach(async () => {
        await cleanupTestData();
        testUser = await createTestUser();
    });
    describe('create', () => {
        it('should create a new audit log entry successfully', async () => {
            const auditData = {
                entityType: 'EMPLOYEE',
                entityId: 'emp-123',
                action: 'CREATE',
                changes: { after: { name: 'John Doe', email: 'john@example.com' } },
                performedBy: testUser.id,
                ipAddress: '192.168.1.1',
                userAgent: 'Mozilla/5.0',
                sessionId: 'session-123',
                correlationId: 'corr-123'
            };
            const result = await repository.create(auditData);
            expect(result).toBeDefined();
            expect(result.id).toBeDefined();
            expect(result.entityType).toBe('EMPLOYEE');
            expect(result.entityId).toBe('emp-123');
            expect(result.action).toBe('CREATE');
            expect(result.changes).toEqual({ after: { name: 'John Doe', email: 'john@example.com' } });
            expect(result.performedBy).toBe(testUser.id);
            expect(result.ipAddress).toBe('192.168.1.1');
            expect(result.userAgent).toBe('Mozilla/5.0');
            expect(result.sessionId).toBe('session-123');
            expect(result.correlationId).toBe('corr-123');
            expect(result.performedAt).toBeInstanceOf(Date);
        });
        it('should create audit log with minimal required fields', async () => {
            const auditData = {
                entityType: 'USER',
                action: 'LOGIN',
                performedBy: testUser.id
            };
            const result = await repository.create(auditData);
            expect(result).toBeDefined();
            expect(result.entityType).toBe('USER');
            expect(result.action).toBe('LOGIN');
            expect(result.performedBy).toBe(testUser.id);
            expect(result.entityId).toBeUndefined();
            expect(result.changes).toBeUndefined();
        });
    });
    describe('findById', () => {
        it('should find audit log by ID', async () => {
            const auditData = {
                entityType: 'EMPLOYEE',
                entityId: 'emp-123',
                action: 'UPDATE',
                performedBy: testUser.id
            };
            const created = await repository.create(auditData);
            const found = await repository.findById(created.id);
            expect(found).toBeDefined();
            expect(found.id).toBe(created.id);
            expect(found.entityType).toBe('EMPLOYEE');
            expect(found.action).toBe('UPDATE');
        });
        it('should return null for non-existent ID', async () => {
            const found = await repository.findById('non-existent-id');
            expect(found).toBeNull();
        });
    });
    describe('findAll', () => {
        beforeEach(async () => {
            // Create test audit logs
            await repository.create({
                entityType: 'EMPLOYEE',
                entityId: 'emp-1',
                action: 'CREATE',
                performedBy: testUser.id
            });
            await repository.create({
                entityType: 'EMPLOYEE',
                entityId: 'emp-2',
                action: 'UPDATE',
                performedBy: testUser.id
            });
            await repository.create({
                entityType: 'USER',
                entityId: 'user-1',
                action: 'LOGIN',
                performedBy: testUser.id
            });
        });
        it('should return all audit logs with pagination', async () => {
            const result = await repository.findAll({
                pagination: { page: 1, limit: 10 }
            });
            expect(result.data).toHaveLength(3);
            expect(result.pagination.total).toBe(3);
            expect(result.pagination.page).toBe(1);
            expect(result.pagination.totalPages).toBe(1);
        });
        it('should filter by entity type', async () => {
            const result = await repository.findAll({
                filters: { entityType: 'EMPLOYEE' }
            });
            expect(result.data).toHaveLength(2);
            result.data.forEach(log => {
                expect(log.entityType).toBe('EMPLOYEE');
            });
        });
        it('should filter by action', async () => {
            const result = await repository.findAll({
                filters: { action: 'CREATE' }
            });
            expect(result.data).toHaveLength(1);
            expect(result.data[0].action).toBe('CREATE');
        });
        it('should sort by performed_at in descending order by default', async () => {
            const result = await repository.findAll();
            expect(result.data).toHaveLength(3);
            // Should be sorted by performed_at DESC (newest first)
            for (let i = 0; i < result.data.length - 1; i++) {
                expect(result.data[i].performedAt.getTime()).toBeGreaterThanOrEqual(result.data[i + 1].performedAt.getTime());
            }
        });
    });
    describe('update and delete', () => {
        it('should throw error when trying to update audit log', async () => {
            const auditData = {
                entityType: 'EMPLOYEE',
                action: 'CREATE',
                performedBy: testUser.id
            };
            const created = await repository.create(auditData);
            await expect(repository.update(created.id, {})).rejects.toThrow('Audit logs are immutable and cannot be updated');
        });
        it('should throw error when trying to delete audit log', async () => {
            const auditData = {
                entityType: 'EMPLOYEE',
                action: 'CREATE',
                performedBy: testUser.id
            };
            const created = await repository.create(auditData);
            await expect(repository.delete(created.id)).rejects.toThrow('Audit logs are immutable and cannot be deleted');
        });
    });
    describe('Employee-specific logging methods', () => {
        describe('logEmployeeCreate', () => {
            it('should log employee creation', async () => {
                const employeeData = {
                    firstName: 'John',
                    lastName: 'Doe',
                    email: 'john@example.com'
                };
                const result = await repository.logEmployeeCreate('emp-123', employeeData, testUser.id, { source: 'HR_SYSTEM' });
                expect(result.entityType).toBe('EMPLOYEE');
                expect(result.entityId).toBe('emp-123');
                expect(result.action).toBe('CREATE');
                expect(result.changes).toEqual({ after: employeeData });
                expect(result.metadata).toEqual({ source: 'HR_SYSTEM' });
                expect(result.performedBy).toBe(testUser.id);
            });
        });
        describe('logEmployeeUpdate', () => {
            it('should log employee update with before and after data', async () => {
                const beforeData = { firstName: 'John', lastName: 'Doe' };
                const afterData = { firstName: 'John', lastName: 'Smith' };
                const result = await repository.logEmployeeUpdate('emp-123', beforeData, afterData, testUser.id);
                expect(result.entityType).toBe('EMPLOYEE');
                expect(result.entityId).toBe('emp-123');
                expect(result.action).toBe('UPDATE');
                expect(result.changes).toEqual({
                    before: beforeData,
                    after: afterData
                });
            });
        });
        describe('logEmployeeStatusChange', () => {
            it('should log employee status change', async () => {
                const result = await repository.logEmployeeStatusChange('emp-123', 'ACTIVE', 'TERMINATED', 'End of contract', testUser.id);
                expect(result.entityType).toBe('EMPLOYEE');
                expect(result.entityId).toBe('emp-123');
                expect(result.action).toBe('STATUS_CHANGE');
                expect(result.changes).toEqual({
                    before: { status: 'ACTIVE' },
                    after: { status: 'TERMINATED', reason: 'End of contract' }
                });
            });
            it('should use SYSTEM as performer when not provided', async () => {
                const result = await repository.logEmployeeStatusChange('emp-123', 'ACTIVE', 'ON_LEAVE');
                expect(result.performedBy).toBe('SYSTEM');
            });
        });
        describe('logEmployeeDelete', () => {
            it('should log employee deletion', async () => {
                const employeeData = {
                    firstName: 'John',
                    lastName: 'Doe',
                    email: 'john@example.com'
                };
                const result = await repository.logEmployeeDelete('emp-123', employeeData, testUser.id);
                expect(result.entityType).toBe('EMPLOYEE');
                expect(result.entityId).toBe('emp-123');
                expect(result.action).toBe('DELETE');
                expect(result.changes).toEqual({ before: employeeData });
            });
        });
    });
    describe('User activity logging methods', () => {
        describe('logUserLogin', () => {
            it('should log user login', async () => {
                const result = await repository.logUserLogin(testUser.id, '192.168.1.1', 'Mozilla/5.0', 'session-123');
                expect(result.entityType).toBe('USER');
                expect(result.entityId).toBe(testUser.id);
                expect(result.action).toBe('LOGIN');
                expect(result.performedBy).toBe(testUser.id);
                expect(result.ipAddress).toBe('192.168.1.1');
                expect(result.userAgent).toBe('Mozilla/5.0');
                expect(result.sessionId).toBe('session-123');
            });
        });
        describe('logUserLogout', () => {
            it('should log user logout', async () => {
                const result = await repository.logUserLogout(testUser.id, 'session-123');
                expect(result.entityType).toBe('USER');
                expect(result.entityId).toBe(testUser.id);
                expect(result.action).toBe('LOGOUT');
                expect(result.performedBy).toBe(testUser.id);
                expect(result.sessionId).toBe('session-123');
            });
        });
    });
    describe('logDataExport', () => {
        it('should log data export', async () => {
            const exportedData = {
                recordCount: 100,
                fields: ['name', 'email', 'department']
            };
            const result = await repository.logDataExport('EMPLOYEE_ROSTER', exportedData, testUser.id, { format: 'CSV' });
            expect(result.entityType).toBe('EXPORT');
            expect(result.action).toBe('EXPORT');
            expect(result.changes).toEqual({ exported: exportedData });
            expect(result.metadata).toEqual({
                format: 'CSV',
                exportType: 'EMPLOYEE_ROSTER'
            });
            expect(result.performedBy).toBe(testUser.id);
        });
    });
    describe('getEntityAuditTrail', () => {
        beforeEach(async () => {
            // Create audit trail for an employee
            await repository.logEmployeeCreate('emp-123', { name: 'John' }, testUser.id);
            await repository.logEmployeeUpdate('emp-123', { name: 'John' }, { name: 'John Doe' }, testUser.id);
            await repository.logEmployeeStatusChange('emp-123', 'ACTIVE', 'ON_LEAVE', 'Vacation', testUser.id);
        });
        it('should return audit trail for specific entity', async () => {
            const result = await repository.getEntityAuditTrail('EMPLOYEE', 'emp-123');
            expect(result.data).toHaveLength(3);
            result.data.forEach(log => {
                expect(log.entityType).toBe('EMPLOYEE');
                expect(log.entityId).toBe('emp-123');
            });
            // Should be sorted by performed_at DESC
            const actions = result.data.map(log => log.action);
            expect(actions).toEqual(['STATUS_CHANGE', 'UPDATE', 'CREATE']);
        });
        it('should support pagination for audit trail', async () => {
            const result = await repository.getEntityAuditTrail('EMPLOYEE', 'emp-123', {
                pagination: { page: 1, limit: 2 }
            });
            expect(result.data).toHaveLength(2);
            expect(result.pagination.total).toBe(3);
            expect(result.pagination.totalPages).toBe(2);
        });
    });
    describe('getUserActivityLog', () => {
        beforeEach(async () => {
            await repository.logUserLogin(testUser.id, '192.168.1.1');
            await repository.logEmployeeCreate('emp-123', { name: 'John' }, testUser.id);
            await repository.logUserLogout(testUser.id);
        });
        it('should return user activity log', async () => {
            const result = await repository.getUserActivityLog(testUser.id);
            expect(result.data).toHaveLength(3);
            result.data.forEach(log => {
                expect(log.performedBy).toBe(testUser.id);
            });
        });
        it('should filter by date range', async () => {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            const result = await repository.getUserActivityLog(testUser.id, {
                dateFrom: tomorrow
            });
            expect(result.data).toHaveLength(0);
        });
    });
});
