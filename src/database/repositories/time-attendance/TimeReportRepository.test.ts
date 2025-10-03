import { TimeReportRepository } from './TimeReportRepository';
import { supabase } from '../../supabase';

// Mock the Supabase client
jest.mock('../../supabase');

describe('TimeReportRepository', () => {
  let repository: TimeReportRepository;
  let mockClient: any;

  beforeEach(() => {
    repository = new TimeReportRepository();

    mockClient = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      rpc: jest.fn()
    };

    (supabase.getClient as jest.Mock).mockReturnValue(mockClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateAttendanceReport', () => {
    it('should generate attendance report successfully', async () => {
      const filters = {
        dateRange: {
          start: new Date('2024-01-01'),
          end: new Date('2024-01-31')
        },
        employeeIds: ['emp-123'],
        includeBreaks: true
      };

      const mockTimeEntries = [
        {
          employee_id: 'emp-123',
          employee_name: 'John Doe',
          department: 'Engineering',
          date: '2024-01-15',
          clock_in_time: '2024-01-15T09:00:00Z',
          clock_out_time: '2024-01-15T17:00:00Z',
          total_hours: 8,
          regular_hours: 8,
          overtime_hours: 0,
          manual_entry: false,
          status: 'COMPLETED',
          time_entry_id: 'entry-123'
        }
      ];

      mockClient.rpc.mockResolvedValueOnce({
        data: mockTimeEntries,
        error: null
      });

      // Mock break time query
      mockClient.select.mockReturnValue({
        eq: jest.fn().mockResolvedValue({
          data: [{ duration: 60, paid: false }],
          error: null
        })
      });

      const result = await repository.generateAttendanceReport(filters);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].employeeId).toBe('emp-123');
      expect(result.data[0].employeeName).toBe('John Doe');
      expect(result.data[0].totalHours).toBe(8);
      expect(result.data[0].breakTime).toBe(60);
      expect(result.data[0].status).toBe('PRESENT');
      expect(mockClient.rpc).toHaveBeenCalledWith('execute_sql', expect.any(Object));
    });

    it('should handle query errors gracefully', async () => {
      const filters = {
        dateRange: {
          start: new Date('2024-01-01'),
          end: new Date('2024-01-31')
        }
      };

      mockClient.rpc.mockResolvedValue({
        data: null,
        error: { message: 'Database error' }
      });

      await expect(repository.generateAttendanceReport(filters))
        .rejects.toThrow('Attendance report query failed: Database error');
    });
  });

  describe('generateTimeSummaryReport', () => {
    it('should generate time summary report successfully', async () => {
      const dateRange = {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-31')
      };

      const mockSummaryData = [
        {
          employee_id: 'emp-123',
          employee_name: 'John Doe',
          department: 'Engineering',
          present_days: '20',
          total_hours: '160',
          regular_hours: '160',
          overtime_hours: '0',
          late_days: '2'
        }
      ];

      mockClient.rpc.mockResolvedValue({
        data: mockSummaryData,
        error: null
      });

      const result = await repository.generateTimeSummaryReport(dateRange);

      expect(result).toHaveLength(1);
      expect(result[0].employeeId).toBe('emp-123');
      expect(result[0].presentDays).toBe(20);
      expect(result[0].totalHours).toBe(160);
      expect(result[0].lateDays).toBe(2);
      expect(result[0].attendanceRate).toBeGreaterThan(0);
    });
  });

  describe('generatePayrollExport', () => {
    it('should generate payroll export data successfully', async () => {
      const options = {
        payPeriodStart: new Date('2024-01-01'),
        payPeriodEnd: new Date('2024-01-15'),
        format: 'JSON' as const,
        includeBreakdown: true,
        includeAdjustments: false
      };

      const mockPayrollData = [
        {
          employee_id: 'emp-123',
          employee_number: 'E001',
          employee_name: 'John Doe',
          department: 'Engineering',
          regular_hours: '80',
          overtime_hours: '5',
          double_time_hours: '0',
          total_hours: '85'
        }
      ];

      mockClient.rpc.mockResolvedValueOnce({
        data: mockPayrollData,
        error: null
      });

      // Mock break time query
      mockClient.rpc.mockResolvedValueOnce({
        data: [{ 
          total_break_time: '10', 
          paid_break_time: '5', 
          unpaid_break_time: '5' 
        }],
        error: null
      });

      const result = await repository.generatePayrollExport(options);

      expect(result).toHaveLength(1);
      expect(result[0].employeeId).toBe('emp-123');
      expect(result[0].employeeNumber).toBe('E001');
      expect(result[0].regularHours).toBe(80);
      expect(result[0].overtimeHours).toBe(5);
      expect(result[0].totalBreakTime).toBe(10);
    });
  });

  describe('exportPayrollData', () => {
    it('should export payroll data as CSV', async () => {
      const options = {
        payPeriodStart: new Date('2024-01-01'),
        payPeriodEnd: new Date('2024-01-15'),
        format: 'CSV' as const,
        includeBreakdown: false,
        includeAdjustments: false
      };

      const mockPayrollData = [
        {
          employee_id: 'emp-123',
          employee_number: 'E001',
          employee_name: 'John Doe',
          department: 'Engineering',
          regular_hours: '80',
          overtime_hours: '5',
          double_time_hours: '0',
          total_hours: '85'
        }
      ];

      mockClient.rpc.mockResolvedValue({
        data: mockPayrollData,
        error: null
      });

      const result = await repository.exportPayrollData(options);

      expect(result.contentType).toBe('text/csv');
      expect(result.filename).toContain('.csv');
      expect(result.data).toContain('employeeId,employeeNumber');
      expect(result.data).toContain('"emp-123","E001"');
    });

    it('should throw error for unsupported format', async () => {
      const options = {
        payPeriodStart: new Date('2024-01-01'),
        payPeriodEnd: new Date('2024-01-15'),
        format: 'PDF' as any,
        includeBreakdown: false,
        includeAdjustments: false
      };

      const mockPayrollData = [
        {
          employee_id: 'emp-123',
          employee_number: 'E001',
          employee_name: 'John Doe',
          department: 'Engineering',
          regular_hours: '80',
          overtime_hours: '5',
          double_time_hours: '0',
          total_hours: '85'
        }
      ];

      mockClient.rpc.mockResolvedValue({
        data: mockPayrollData,
        error: null
      });

      await expect(repository.exportPayrollData(options))
        .rejects.toThrow('Unsupported export format: PDF');
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
});