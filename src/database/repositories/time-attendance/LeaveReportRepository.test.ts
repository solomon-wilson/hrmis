import { LeaveReportRepository } from './LeaveReportRepository';
import { supabase } from '../../supabase';

// Mock the Supabase client
jest.mock('../../supabase');

describe('LeaveReportRepository', () => {
  let repository: LeaveReportRepository;
  let mockClient: any;

  beforeEach(() => {
    repository = new LeaveReportRepository();

    mockClient = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn(),
      rpc: jest.fn()
    };

    (supabase.getClient as jest.Mock).mockReturnValue(mockClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateLeaveUsageReport', () => {
    it('should generate leave usage report successfully', async () => {
      const filters = {
        dateRange: {
          start: new Date('2024-01-01'),
          end: new Date('2024-12-31')
        },
        employeeIds: ['emp-123'],
        includeBalances: true
      };

      const mockUsageData = [
        {
          employee_id: 'emp-123',
          employee_name: 'John Doe',
          department: 'Engineering',
          leave_type_id: 'lt-vacation',
          leave_type_name: 'Vacation',
          total_requests: '5',
          total_days_requested: '25',
          total_approved: '20',
          total_denied: '3',
          total_pending: '2',
          total_used: '20'
        }
      ];

      mockClient.rpc.mockResolvedValueOnce({
        data: mockUsageData,
        error: null
      });

      // Mock balance query
      mockClient.single.mockResolvedValue({
        data: { current_balance: 15, accrual_rate: 2, accrual_period: 'MONTHLY', last_accrual_date: '2024-01-01' },
        error: null
      });

      const result = await repository.generateLeaveUsageReport(filters);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].employeeId).toBe('emp-123');
      expect(result.data[0].employeeName).toBe('John Doe');
      expect(result.data[0].leaveTypeName).toBe('Vacation');
      expect(result.data[0].totalApproved).toBe(20);
      expect(result.data[0].totalDenied).toBe(3);
      expect(result.data[0].totalPending).toBe(2);
      expect(result.data[0].currentBalance).toBe(15);
      expect(result.data[0].utilizationRate).toBeGreaterThan(0);
    });

    it('should filter by leave type and status', async () => {
      const filters = {
        dateRange: {
          start: new Date('2024-01-01'),
          end: new Date('2024-12-31')
        },
        leaveTypeIds: ['lt-vacation'],
        status: 'APPROVED' as const
      };

      mockClient.rpc.mockResolvedValue({
        data: [],
        error: null
      });

      await repository.generateLeaveUsageReport(filters);

      const sqlCall = mockClient.rpc.mock.calls[0][1];
      expect(sqlCall.sql).toContain('lr.leave_type_id = ANY($3)');
      expect(sqlCall.sql).toContain('lr.status = $4');
      expect(sqlCall.params).toContainEqual(['lt-vacation']);
      expect(sqlCall.params).toContain('APPROVED');
    });

    it('should handle query errors gracefully', async () => {
      const filters = {
        dateRange: {
          start: new Date('2024-01-01'),
          end: new Date('2024-12-31')
        }
      };

      mockClient.rpc.mockResolvedValue({
        data: null,
        error: { message: 'Database error' }
      });

      await expect(repository.generateLeaveUsageReport(filters))
        .rejects.toThrow('Leave usage report query failed: Database error');
    });
  });

  describe('generateLeaveBalanceReport', () => {
    it('should generate leave balance report successfully', async () => {
      const mockBalanceData = [
        {
          employee_id: 'emp-123',
          employee_name: 'John Doe',
          department: 'Engineering',
          leave_type_id: 'lt-vacation',
          leave_type_name: 'Vacation',
          current_balance: '15.5',
          year_to_date_used: '10',
          year_to_date_accrued: '24',
          max_balance: '40',
          carryover_limit: '5',
          accrual_rate: '2',
          accrual_period: 'MONTHLY',
          last_accrual_date: '2024-01-01'
        }
      ];

      mockClient.rpc.mockResolvedValue({
        data: mockBalanceData,
        error: null
      });

      const result = await repository.generateLeaveBalanceReport();

      expect(result).toHaveLength(1);
      expect(result[0].employeeId).toBe('emp-123');
      expect(result[0].employeeName).toBe('John Doe');
      expect(result[0].leaveTypeName).toBe('Vacation');
      expect(result[0].currentBalance).toBe(15.5);
      expect(result[0].yearToDateUsed).toBe(10);
      expect(result[0].yearToDateAccrued).toBe(24);
      expect(result[0].maxBalance).toBe(40);
      expect(result[0].carryoverLimit).toBe(5);
      expect(result[0].accrualRate).toBe(2);
      expect(result[0].accrualPeriod).toBe('MONTHLY');
      expect(result[0].projectedEndOfYearBalance).toBeGreaterThan(0);
      expect(result[0].nextAccrualDate).toBeInstanceOf(Date);
    });

    it('should identify at-risk leave balances', async () => {
      const mockBalanceData = [
        {
          employee_id: 'emp-123',
          employee_name: 'John Doe',
          department: 'Engineering',
          leave_type_id: 'lt-vacation',
          leave_type_name: 'Vacation',
          current_balance: '38', // Close to max balance of 40
          year_to_date_used: '5',
          year_to_date_accrued: '40',
          max_balance: '40',
          carryover_limit: '5',
          accrual_rate: '2',
          accrual_period: 'MONTHLY',
          last_accrual_date: '2024-01-01'
        }
      ];

      mockClient.rpc.mockResolvedValue({
        data: mockBalanceData,
        error: null
      });

      const result = await repository.generateLeaveBalanceReport();

      expect(result[0].isAtRisk).toBe(true);
      expect(result[0].riskDescription).toContain('maximum balance limit');
    });

    it('should filter by employee and leave type IDs', async () => {
      const employeeIds = ['emp-123', 'emp-456'];
      const leaveTypeIds = ['lt-vacation', 'lt-sick'];

      mockClient.rpc.mockResolvedValue({
        data: [],
        error: null
      });

      await repository.generateLeaveBalanceReport(employeeIds, leaveTypeIds);

      const sqlCall = mockClient.rpc.mock.calls[0][1];
      expect(sqlCall.sql).toContain('lb.employee_id = ANY($1)');
      expect(sqlCall.sql).toContain('lb.leave_type_id = ANY($2)');
      expect(sqlCall.params).toContain(employeeIds);
      expect(sqlCall.params).toContain(leaveTypeIds);
    });
  });

  describe('generateLeavePatternAnalysis', () => {
    it('should generate leave pattern analysis successfully', async () => {
      const mockPatternData = [
        {
          employee_id: 'emp-123',
          employee_name: 'John Doe',
          department: 'Engineering',
          total_requests: '8',
          avg_duration: '3.5',
          avg_advance_notice: '14',
          approved_count: '7',
          last_minute_count: '1'
        }
      ];

      mockClient.rpc
        .mockResolvedValueOnce({ data: mockPatternData, error: null })
        .mockResolvedValueOnce({ data: [{ quarter: 'Q1', request_count: '2', total_days: '6' }], error: null })
        .mockResolvedValueOnce({ data: [{ name: 'Vacation' }], error: null })
        .mockResolvedValueOnce({ data: [{ day_name: 'Monday   ' }], error: null });

      const result = await repository.generateLeavePatternAnalysis(['emp-123']);

      expect(result).toHaveLength(1);
      expect(result[0].employeeId).toBe('emp-123');
      expect(result[0].totalLeaveRequests).toBe(8);
      expect(result[0].averageRequestDuration).toBe(3.5);
      expect(result[0].advanceNoticeAverage).toBe(14);
      expect(result[0].approvalRate).toBe(87.5); // 7/8 * 100
      expect(result[0].lastMinuteRequests).toBe(1);
      expect(result[0].seasonalPatterns).toHaveLength(1);
      expect(result[0].mostUsedLeaveType).toBe('Vacation');
      expect(result[0].frequentRequestDays).toContain('Monday');
    });

    it('should use default date range when not provided', async () => {
      const currentYear = new Date().getFullYear();

      mockClient.rpc.mockResolvedValue({
        data: [],
        error: null
      });

      await repository.generateLeavePatternAnalysis(['emp-123']);

      const sqlCall = mockClient.rpc.mock.calls[0][1];
      expect(sqlCall.params[0]).toBe(`${currentYear}-01-01`);
      expect(sqlCall.params[1]).toBe(`${currentYear}-12-31`);
    });
  });

  describe('generateTeamLeaveCalendar', () => {
    it('should generate team leave calendar successfully', async () => {
      const dateRange = {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-07')
      };

      const mockCalendarData = [
        {
          date: '2024-01-01',
          employee_id: null,
          employee_name: null,
          leave_type: null,
          status: null,
          is_partial_day: null
        },
        {
          date: '2024-01-02',
          employee_id: 'emp-123',
          employee_name: 'John Doe',
          leave_type: 'Vacation',
          status: 'APPROVED',
          is_partial_day: false
        }
      ];

      mockClient.rpc
        .mockResolvedValueOnce({ data: mockCalendarData, error: null })
        .mockResolvedValueOnce({ data: [{ team_size: '10' }], error: null })
        .mockResolvedValueOnce({ data: [{ team_size: '10' }], error: null });

      const result = await repository.generateTeamLeaveCalendar(dateRange);

      expect(result).toHaveLength(2);
      expect(result[0].date).toEqual(new Date('2024-01-01'));
      expect(result[0].employees).toHaveLength(0);
      expect(result[1].employees).toHaveLength(1);
      expect(result[1].employees[0].employeeId).toBe('emp-123');
      expect(result[1].employees[0].leaveType).toBe('Vacation');
      expect(result[1].employees[0].status).toBe('APPROVED');
      expect(result[1].teamCoverage).toBe(90); // 9/10 * 100
    });

    it('should filter by department IDs', async () => {
      const dateRange = {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-07')
      };
      const departmentIds = ['dept-123'];

      mockClient.rpc.mockResolvedValue({
        data: [],
        error: null
      });

      await repository.generateTeamLeaveCalendar(dateRange, departmentIds);

      const sqlCall = mockClient.rpc.mock.calls[0][1];
      expect(sqlCall.sql).toContain('d.id = ANY($3)');
      expect(sqlCall.params).toContain(departmentIds);
    });

    it('should identify critical coverage days', async () => {
      const dateRange = {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-01')
      };

      const mockCalendarData = [
        {
          date: '2024-01-01',
          employee_id: 'emp-1',
          employee_name: 'Employee 1',
          leave_type: 'Vacation',
          status: 'APPROVED',
          is_partial_day: false
        },
        {
          date: '2024-01-01',
          employee_id: 'emp-2',
          employee_name: 'Employee 2',
          leave_type: 'Sick',
          status: 'APPROVED',
          is_partial_day: false
        },
        {
          date: '2024-01-01',
          employee_id: 'emp-3',
          employee_name: 'Employee 3',
          leave_type: 'Personal',
          status: 'APPROVED',
          is_partial_day: false
        },
        {
          date: '2024-01-01',
          employee_id: 'emp-4',
          employee_name: 'Employee 4',
          leave_type: 'Vacation',
          status: 'APPROVED',
          is_partial_day: false
        }
      ];

      mockClient.rpc
        .mockResolvedValueOnce({ data: mockCalendarData, error: null })
        .mockResolvedValueOnce({ data: [{ team_size: '10' }], error: null });

      const result = await repository.generateTeamLeaveCalendar(dateRange);

      expect(result[0].teamCoverage).toBe(60); // 6/10 * 100
      expect(result[0].criticalCoverage).toBe(true); // Less than 70%
    });
  });

  describe('generateLeaveAccrualReport', () => {
    it('should generate leave accrual report successfully', async () => {
      const employeeId = 'emp-123';
      const leaveTypeId = 'lt-vacation';
      const dateRange = {
        start: new Date('2024-01-01'),
        end: new Date('2024-12-31')
      };

      const mockEmployeeData = [
        {
          employee_name: 'John Doe',
          department: 'Engineering',
          leave_type_name: 'Vacation'
        }
      ];

      const mockTransactions = [
        {
          transaction_date: '2024-01-01',
          transaction_type: 'ACCRUAL',
          amount: '2',
          description: 'Monthly accrual',
          related_request_id: null,
          current_balance: '12'
        },
        {
          transaction_date: '2024-01-15',
          transaction_type: 'USAGE',
          amount: '-5',
          description: 'Vacation leave',
          related_request_id: 'req-123',
          current_balance: '7'
        }
      ];

      mockClient.rpc
        .mockResolvedValueOnce({ data: mockEmployeeData, error: null })
        .mockResolvedValueOnce({ data: mockTransactions, error: null });

      const result = await repository.generateLeaveAccrualReport(
        employeeId,
        leaveTypeId,
        dateRange
      );

      expect(result.employeeId).toBe(employeeId);
      expect(result.employeeName).toBe('John Doe');
      expect(result.leaveTypeName).toBe('Vacation');
      expect(result.transactions).toHaveLength(2);
      expect(result.transactions[0].type).toBe('ACCRUAL');
      expect(result.transactions[0].amount).toBe(2);
      expect(result.transactions[1].type).toBe('USAGE');
      expect(result.transactions[1].amount).toBe(-5);
      expect(result.periodSummary.totalAccrued).toBe(2);
      expect(result.periodSummary.totalUsed).toBe(5);
    });

    it('should throw error when employee not found', async () => {
      mockClient.rpc.mockResolvedValue({
        data: [],
        error: null
      });

      await expect(repository.generateLeaveAccrualReport(
        'nonexistent',
        'lt-vacation',
        { start: new Date(), end: new Date() }
      )).rejects.toThrow('Employee or leave type not found');
    });

    it('should handle transaction query errors', async () => {
      const mockEmployeeData = [
        {
          employee_name: 'John Doe',
          department: 'Engineering',
          leave_type_name: 'Vacation'
        }
      ];

      mockClient.rpc
        .mockResolvedValueOnce({ data: mockEmployeeData, error: null })
        .mockResolvedValueOnce({ data: null, error: { message: 'Transaction error' } });

      await expect(repository.generateLeaveAccrualReport(
        'emp-123',
        'lt-vacation',
        { start: new Date(), end: new Date() }
      )).rejects.toThrow('Accrual transaction query failed: Transaction error');
    });
  });

  describe('abstract method implementations', () => {
    it('should throw errors for unsupported CRUD operations', async () => {
      await expect(repository.create({})).rejects.toThrow('Create operation not supported');
      await expect(repository.findById('id')).rejects.toThrow('FindById operation not supported');
      await expect(repository.update('id', {})).rejects.toThrow('Update operation not supported');
      await expect(repository.delete('id')).rejects.toThrow('Delete operation not supported');
    });
  });

  describe('helper methods', () => {
    it('should calculate projected balance correctly', async () => {
      // Test through generateLeaveBalanceReport
      const mockBalanceData = [
        {
          employee_id: 'emp-123',
          employee_name: 'John Doe',
          department: 'Engineering',
          leave_type_id: 'lt-vacation',
          leave_type_name: 'Vacation',
          current_balance: '10',
          year_to_date_used: '5',
          year_to_date_accrued: '15',
          max_balance: null,
          carryover_limit: null,
          accrual_rate: '2',
          accrual_period: 'MONTHLY',
          last_accrual_date: '2024-01-01'
        }
      ];

      mockClient.rpc.mockResolvedValue({
        data: mockBalanceData,
        error: null
      });

      const result = await repository.generateLeaveBalanceReport();

      expect(result[0].projectedEndOfYearBalance).toBeGreaterThan(10);
    });

    it('should calculate next accrual date correctly', async () => {
      const mockBalanceData = [
        {
          employee_id: 'emp-123',
          employee_name: 'John Doe',
          department: 'Engineering',
          leave_type_id: 'lt-vacation',
          leave_type_name: 'Vacation',
          current_balance: '10',
          year_to_date_used: '5',
          year_to_date_accrued: '15',
          max_balance: null,
          carryover_limit: null,
          accrual_rate: '2',
          accrual_period: 'MONTHLY',
          last_accrual_date: '2024-01-01'
        }
      ];

      mockClient.rpc.mockResolvedValue({
        data: mockBalanceData,
        error: null
      });

      const result = await repository.generateLeaveBalanceReport();

      expect(result[0].nextAccrualDate).toBeInstanceOf(Date);
      expect(result[0].nextAccrualDate.getMonth()).toBe(1); // February (0-indexed)
    });
  });
});