import { TimeEntryRepository } from './TimeEntryRepository';
import { BreakEntryRepository } from './BreakEntryRepository';
import { TimeEntry } from '../../../models/time-attendance/TimeEntry';
import { supabase } from '../../supabase';
// Mock the Supabase client
jest.mock('../../supabase');
describe('TimeEntryRepository', () => {
    let repository;
    let mockClient;
    beforeEach(() => {
        repository = new TimeEntryRepository();
        mockClient = {
            from: jest.fn().mockReturnThis(),
            insert: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            update: jest.fn().mockReturnThis(),
            delete: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            is: jest.fn().mockReturnThis(),
            gte: jest.fn().mockReturnThis(),
            lte: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            range: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            single: jest.fn(),
            maybeSingle: jest.fn()
        };
        supabase.getClient.mockReturnValue(mockClient);
    });
    afterEach(() => {
        jest.clearAllMocks();
    });
    describe('create', () => {
        it('should create a new time entry successfully', async () => {
            const timeEntryData = {
                employeeId: 'emp-123',
                clockInTime: new Date('2024-01-15T09:00:00Z'),
                manualEntry: false,
                status: 'ACTIVE'
            };
            const mockResult = {
                id: 'entry-123',
                employee_id: 'emp-123',
                clock_in_time: '2024-01-15T09:00:00Z',
                clock_out_time: null,
                status: 'ACTIVE',
                manual_entry: false,
                location: null,
                notes: null,
                created_at: '2024-01-15T09:00:00Z',
                updated_at: '2024-01-15T09:00:00Z',
                total_hours: null,
                regular_hours: null,
                overtime_hours: null,
                approved_by: null,
                approved_at: null
            };
            mockClient.single.mockResolvedValue({ data: mockResult, error: null });
            const result = await repository.create(timeEntryData);
            expect(result).toBeInstanceOf(TimeEntry);
            expect(result.employeeId).toBe('emp-123');
            expect(result.status).toBe('ACTIVE');
            expect(mockClient.from).toHaveBeenCalledWith('time_entries');
            expect(mockClient.insert).toHaveBeenCalled();
        });
        it('should create time entry with break entries', async () => {
            const timeEntryData = {
                employeeId: 'emp-123',
                clockInTime: new Date('2024-01-15T09:00:00Z'),
                breakEntries: [{
                        timeEntryId: 'entry-123',
                        breakType: 'LUNCH',
                        startTime: new Date('2024-01-15T12:00:00Z'),
                        endTime: new Date('2024-01-15T13:00:00Z'),
                        duration: 60,
                        paid: false
                    }]
            };
            const mockTimeEntry = {
                id: 'entry-123',
                employee_id: 'emp-123',
                clock_in_time: '2024-01-15T09:00:00Z',
                status: 'ACTIVE',
                manual_entry: false
            };
            mockClient.single.mockResolvedValue({ data: mockTimeEntry, error: null });
            mockClient.insert.mockResolvedValue({ data: [], error: null });
            const result = await repository.create(timeEntryData);
            expect(result).toBeInstanceOf(TimeEntry);
            expect(mockClient.insert).toHaveBeenCalledTimes(2); // Time entry + break entries
        });
        it('should throw error when creation fails', async () => {
            const timeEntryData = {
                employeeId: 'emp-123',
                clockInTime: new Date('2024-01-15T09:00:00Z')
            };
            mockClient.single.mockResolvedValue({
                data: null,
                error: { message: 'Database error' }
            });
            await expect(repository.create(timeEntryData)).rejects.toThrow('create time entry failed: Database error');
        });
    });
    describe('findById', () => {
        it('should find time entry by ID with break entries', async () => {
            const mockResult = {
                id: 'entry-123',
                employee_id: 'emp-123',
                clock_in_time: '2024-01-15T09:00:00Z',
                clock_out_time: '2024-01-15T17:00:00Z',
                status: 'COMPLETED',
                manual_entry: false,
                location: null,
                notes: null,
                created_at: '2024-01-15T09:00:00Z',
                updated_at: '2024-01-15T17:00:00Z',
                total_hours: 8,
                regular_hours: 8,
                overtime_hours: 0,
                approved_by: null,
                approved_at: null,
                break_entries: [{
                        id: 'break-123',
                        break_type: 'LUNCH',
                        start_time: '2024-01-15T12:00:00Z',
                        end_time: '2024-01-15T13:00:00Z',
                        duration: 60,
                        paid: false
                    }]
            };
            mockClient.single.mockResolvedValue({ data: mockResult, error: null });
            const result = await repository.findById('entry-123');
            expect(result).toBeInstanceOf(TimeEntry);
            expect(result?.id).toBe('entry-123');
            expect(result?.breakEntries).toHaveLength(1);
            expect(result?.breakEntries?.[0].breakType).toBe('LUNCH');
        });
        it('should return null when time entry not found', async () => {
            mockClient.single.mockResolvedValue({ data: null, error: null });
            const result = await repository.findById('nonexistent-id');
            expect(result).toBeNull();
        });
    });
    describe('update', () => {
        it('should update time entry successfully', async () => {
            const updateData = {
                clockOutTime: new Date('2024-01-15T17:00:00Z'),
                status: 'COMPLETED',
                totalHours: 8
            };
            const mockUpdatedEntry = {
                id: 'entry-123',
                employee_id: 'emp-123',
                clock_out_time: '2024-01-15T17:00:00Z',
                status: 'COMPLETED',
                total_hours: 8
            };
            mockClient.single.mockResolvedValue({ data: mockUpdatedEntry, error: null });
            // Mock findById call for final result
            jest.spyOn(repository, 'findById').mockResolvedValue(new TimeEntry({
                id: 'entry-123',
                employeeId: 'emp-123',
                clockInTime: new Date('2024-01-15T09:00:00Z'),
                clockOutTime: new Date('2024-01-15T17:00:00Z'),
                status: 'COMPLETED',
                manualEntry: false,
                totalHours: 8
            }));
            const result = await repository.update('entry-123', updateData);
            expect(result).toBeInstanceOf(TimeEntry);
            expect(result?.status).toBe('COMPLETED');
            expect(mockClient.update).toHaveBeenCalled();
        });
    });
    describe('findActiveTimeEntry', () => {
        it('should find active time entry for employee', async () => {
            const mockResult = {
                id: 'entry-123',
                employee_id: 'emp-123',
                clock_in_time: '2024-01-15T09:00:00Z',
                status: 'ACTIVE',
                break_entries: []
            };
            mockClient.maybeSingle.mockResolvedValue({ data: mockResult, error: null });
            const result = await repository.findActiveTimeEntry('emp-123');
            expect(result).toBeInstanceOf(TimeEntry);
            expect(result?.status).toBe('ACTIVE');
            expect(mockClient.eq).toHaveBeenCalledWith('employee_id', 'emp-123');
            expect(mockClient.eq).toHaveBeenCalledWith('status', 'ACTIVE');
        });
        it('should return null when no active entry found', async () => {
            mockClient.maybeSingle.mockResolvedValue({ data: null, error: null });
            const result = await repository.findActiveTimeEntry('emp-123');
            expect(result).toBeNull();
        });
    });
    describe('findIncompleteEntries', () => {
        it('should find entries missing clock out', async () => {
            const mockResults = [{
                    id: 'entry-123',
                    employee_id: 'emp-123',
                    clock_in_time: '2024-01-14T09:00:00Z',
                    location: { latitude: 40.7128, longitude: -74.0060 }
                }];
            mockClient.order.mockResolvedValue({ data: mockResults, error: null });
            const result = await repository.findIncompleteEntries();
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('entry-123');
            expect(result[0].daysSinceClockIn).toBeGreaterThan(0);
            expect(mockClient.is).toHaveBeenCalledWith('clock_out_time', null);
        });
    });
    describe('clockOut', () => {
        it('should clock out employee successfully', async () => {
            const mockActiveEntry = new TimeEntry({
                id: 'entry-123',
                employeeId: 'emp-123',
                clockInTime: new Date('2024-01-15T09:00:00Z'),
                status: 'ACTIVE',
                manualEntry: false
            });
            jest.spyOn(repository, 'findActiveTimeEntry').mockResolvedValue(mockActiveEntry);
            jest.spyOn(repository, 'update').mockResolvedValue(new TimeEntry({
                id: 'entry-123',
                employeeId: 'emp-123',
                clockInTime: new Date('2024-01-15T09:00:00Z'),
                clockOutTime: new Date('2024-01-15T17:00:00Z'),
                status: 'COMPLETED',
                manualEntry: false
            }));
            const clockOutTime = new Date('2024-01-15T17:00:00Z');
            const result = await repository.clockOut('emp-123', clockOutTime);
            expect(result?.status).toBe('COMPLETED');
            expect(result?.clockOutTime).toEqual(clockOutTime);
        });
        it('should throw error when no active entry found', async () => {
            jest.spyOn(repository, 'findActiveTimeEntry').mockResolvedValue(null);
            await expect(repository.clockOut('emp-123')).rejects.toThrow('No active time entry found for employee');
        });
    });
    describe('getEmployeeTimeStatus', () => {
        it('should return null when no active entry exists', async () => {
            jest.spyOn(repository, 'findActiveTimeEntry').mockResolvedValue(null);
            const result = await repository.getEmployeeTimeStatus('emp-123');
            expect(result).toBeNull();
        });
        it('should return time status with active entry', async () => {
            const mockActiveEntry = new TimeEntry({
                id: 'entry-123',
                employeeId: 'emp-123',
                clockInTime: new Date('2024-01-15T09:00:00Z'),
                status: 'ACTIVE',
                manualEntry: false,
                breakEntries: []
            });
            jest.spyOn(repository, 'findActiveTimeEntry').mockResolvedValue(mockActiveEntry);
            const result = await repository.getEmployeeTimeStatus('emp-123');
            expect(result).toBeTruthy();
            expect(result?.isActive).toBe(true);
            expect(result?.isOnBreak).toBe(false);
        });
    });
    describe('findByDateRange', () => {
        it('should find time entries within date range', async () => {
            const startDate = new Date('2024-01-15T00:00:00Z');
            const endDate = new Date('2024-01-15T23:59:59Z');
            jest.spyOn(repository, 'findAll').mockResolvedValue({
                data: [new TimeEntry({
                        id: 'entry-123',
                        employeeId: 'emp-123',
                        clockInTime: new Date('2024-01-15T09:00:00Z'),
                        status: 'COMPLETED',
                        manualEntry: false
                    })],
                pagination: {
                    page: 1,
                    limit: 25,
                    total: 1,
                    totalPages: 1,
                    hasNext: false,
                    hasPrev: false
                }
            });
            const result = await repository.findByDateRange('emp-123', startDate, endDate);
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('entry-123');
        });
    });
});
describe('BreakEntryRepository', () => {
    let repository;
    let mockClient;
    beforeEach(() => {
        repository = new BreakEntryRepository();
        mockClient = {
            from: jest.fn().mockReturnThis(),
            insert: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            update: jest.fn().mockReturnThis(),
            delete: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            is: jest.fn().mockReturnThis(),
            gte: jest.fn().mockReturnThis(),
            lte: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            range: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            single: jest.fn(),
            maybeSingle: jest.fn(),
            rpc: jest.fn()
        };
        supabase.getClient.mockReturnValue(mockClient);
    });
    afterEach(() => {
        jest.clearAllMocks();
    });
    describe('create', () => {
        it('should create a new break entry successfully', async () => {
            const breakEntryData = {
                timeEntryId: 'entry-123',
                breakType: 'LUNCH',
                startTime: new Date('2024-01-15T12:00:00Z'),
                paid: false
            };
            const mockResult = {
                id: 'break-123',
                time_entry_id: 'entry-123',
                break_type: 'LUNCH',
                start_time: '2024-01-15T12:00:00Z',
                end_time: null,
                duration: null,
                paid: false,
                created_at: '2024-01-15T12:00:00Z',
                updated_at: '2024-01-15T12:00:00Z'
            };
            mockClient.single.mockResolvedValue({ data: mockResult, error: null });
            const result = await repository.create(breakEntryData);
            expect(result.breakType).toBe('LUNCH');
            expect(result.timeEntryId).toBe('entry-123');
            expect(result.paid).toBe(false);
            expect(mockClient.from).toHaveBeenCalledWith('break_entries');
        });
    });
    describe('endBreak', () => {
        it('should end an active break successfully', async () => {
            const mockBreakEntry = {
                id: 'break-123',
                time_entry_id: 'entry-123',
                break_type: 'LUNCH',
                start_time: '2024-01-15T12:00:00Z',
                end_time: null,
                duration: null,
                paid: false
            };
            jest.spyOn(repository, 'findById').mockResolvedValue({
                id: 'break-123',
                timeEntryId: 'entry-123',
                breakType: 'LUNCH',
                startTime: new Date('2024-01-15T12:00:00Z'),
                paid: false
            });
            jest.spyOn(repository, 'update').mockResolvedValue({
                id: 'break-123',
                timeEntryId: 'entry-123',
                breakType: 'LUNCH',
                startTime: new Date('2024-01-15T12:00:00Z'),
                endTime: new Date('2024-01-15T13:00:00Z'),
                duration: 60,
                paid: false
            });
            const endTime = new Date('2024-01-15T13:00:00Z');
            const result = await repository.endBreak('break-123', endTime);
            expect(result?.endTime).toEqual(endTime);
            expect(result?.duration).toBe(60);
        });
        it('should throw error when break not found', async () => {
            jest.spyOn(repository, 'findById').mockResolvedValue(null);
            await expect(repository.endBreak('nonexistent-id')).rejects.toThrow('Break entry not found');
        });
        it('should throw error when break already ended', async () => {
            jest.spyOn(repository, 'findById').mockResolvedValue({
                id: 'break-123',
                timeEntryId: 'entry-123',
                breakType: 'LUNCH',
                startTime: new Date('2024-01-15T12:00:00Z'),
                endTime: new Date('2024-01-15T13:00:00Z'),
                paid: false
            });
            await expect(repository.endBreak('break-123')).rejects.toThrow('Break has already ended');
        });
    });
    describe('validateBreakRules', () => {
        it('should validate lunch break rules', async () => {
            jest.spyOn(repository, 'findByDateRange').mockResolvedValue([]);
            jest.spyOn(repository, 'findActiveBreak').mockResolvedValue(null);
            const result = await repository.validateBreakRules('emp-123', 'LUNCH');
            expect(result.isValid).toBe(true);
            expect(result.violations).toHaveLength(0);
        });
        it('should detect active break violation', async () => {
            jest.spyOn(repository, 'findByDateRange').mockResolvedValue([]);
            jest.spyOn(repository, 'findActiveBreak').mockResolvedValue({});
            const result = await repository.validateBreakRules('emp-123', 'LUNCH');
            expect(result.isValid).toBe(false);
            expect(result.violations).toContain('Employee is already on an active break');
        });
        it('should detect short break limit violation', async () => {
            const mockBreaks = [
                { breakType: 'SHORT_BREAK' },
                { breakType: 'SHORT_BREAK' },
                { breakType: 'SHORT_BREAK' }
            ];
            jest.spyOn(repository, 'findByDateRange').mockResolvedValue(mockBreaks);
            jest.spyOn(repository, 'findActiveBreak').mockResolvedValue(null);
            const result = await repository.validateBreakRules('emp-123', 'SHORT_BREAK');
            expect(result.isValid).toBe(false);
            expect(result.violations).toContain('Maximum of 3 short breaks per day exceeded');
        });
    });
});
