import * as fs from 'fs';
import * as path from 'path';
import { createObjectCsvWriter } from 'csv-writer';
import PDFDocument from 'pdfkit';
import { Employee } from '../models/Employee';
import { AuditLogRepository } from '../database/repositories/audit';
import { ValidationError } from '../utils/validation';
import { PermissionContext } from './EmployeeService';
import { 
  ExportOptions, 
  ExportResult, 
  EmployeeRosterReport, 
  DepartmentBreakdownReport, 
  WorkforceAnalytics 
} from './ReportService';

export interface ExportData {
  type: 'EMPLOYEE_ROSTER' | 'DEPARTMENT_BREAKDOWN' | 'WORKFORCE_ANALYTICS';
  data: EmployeeRosterReport | DepartmentBreakdownReport | WorkforceAnalytics;
  permissionContext: PermissionContext;
}

export class ExportService {
  private auditLogRepository: AuditLogRepository;
  private exportDirectory: string;

  constructor() {
    this.auditLogRepository = new AuditLogRepository();
    this.exportDirectory = process.env.EXPORT_DIRECTORY || './exports';
    
    // Ensure export directory exists
    if (!fs.existsSync(this.exportDirectory)) {
      fs.mkdirSync(this.exportDirectory, { recursive: true });
    }
  }

  /**
   * Export employee roster report
   */
  async exportEmployeeRoster(
    report: EmployeeRosterReport,
    options: ExportOptions,
    permissionContext: PermissionContext
  ): Promise<ExportResult> {
    // Check permissions
    if (permissionContext.role !== 'HR_ADMIN' && permissionContext.role !== 'MANAGER') {
      throw new ValidationError('Insufficient permissions to export employee data', []);
    }

    const exportData: ExportData = {
      type: 'EMPLOYEE_ROSTER',
      data: report,
      permissionContext
    };

    if (options.format === 'CSV') {
      return this.exportToCSV(exportData, options);
    } else if (options.format === 'PDF') {
      return this.exportToPDF(exportData, options);
    } else {
      throw new ValidationError('Unsupported export format', []);
    }
  }

  /**
   * Export department breakdown report
   */
  async exportDepartmentBreakdown(
    report: DepartmentBreakdownReport,
    options: ExportOptions,
    permissionContext: PermissionContext
  ): Promise<ExportResult> {
    // Check permissions
    if (permissionContext.role !== 'HR_ADMIN' && permissionContext.role !== 'MANAGER') {
      throw new ValidationError('Insufficient permissions to export department data', []);
    }

    const exportData: ExportData = {
      type: 'DEPARTMENT_BREAKDOWN',
      data: report,
      permissionContext
    };

    if (options.format === 'CSV') {
      return this.exportToCSV(exportData, options);
    } else if (options.format === 'PDF') {
      return this.exportToPDF(exportData, options);
    } else {
      throw new ValidationError('Unsupported export format', []);
    }
  }

  /**
   * Export workforce analytics
   */
  async exportWorkforceAnalytics(
    analytics: WorkforceAnalytics,
    options: ExportOptions,
    permissionContext: PermissionContext
  ): Promise<ExportResult> {
    // Check permissions - only HR_ADMIN can export comprehensive analytics
    if (permissionContext.role !== 'HR_ADMIN') {
      throw new ValidationError('Insufficient permissions to export workforce analytics', []);
    }

    const exportData: ExportData = {
      type: 'WORKFORCE_ANALYTICS',
      data: analytics,
      permissionContext
    };

    if (options.format === 'CSV') {
      return this.exportToCSV(exportData, options);
    } else if (options.format === 'PDF') {
      return this.exportToPDF(exportData, options);
    } else {
      throw new ValidationError('Unsupported export format', []);
    }
  }

  /**
   * Export data to CSV format
   */
  private async exportToCSV(exportData: ExportData, options: ExportOptions): Promise<ExportResult> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = options.fileName || `${exportData.type.toLowerCase()}_${timestamp}.csv`;
    const filePath = path.join(this.exportDirectory, fileName);

    let records: any[] = [];
    let recordCount = 0;

    switch (exportData.type) {
      case 'EMPLOYEE_ROSTER':
        const rosterData = exportData.data as EmployeeRosterReport;
        records = this.prepareEmployeeRosterForCSV(rosterData.employees, exportData.permissionContext, options);
        recordCount = rosterData.employees.length;
        break;

      case 'DEPARTMENT_BREAKDOWN':
        const deptData = exportData.data as DepartmentBreakdownReport;
        records = this.prepareDepartmentBreakdownForCSV(deptData.departments);
        recordCount = deptData.departments.length;
        break;

      case 'WORKFORCE_ANALYTICS':
        const analyticsData = exportData.data as WorkforceAnalytics;
        records = this.prepareWorkforceAnalyticsForCSV(analyticsData);
        recordCount = 1; // Single summary record
        break;
    }

    if (records.length === 0) {
      throw new ValidationError('No data available for export', []);
    }

    // Create CSV writer with dynamic headers based on the first record
    const headers = Object.keys(records[0]).map(key => ({ id: key, title: key }));
    const csvWriter = createObjectCsvWriter({
      path: filePath,
      header: headers
    });

    await csvWriter.writeRecords(records);

    // Log export activity
    await this.auditLogRepository.logDataExport(
      exportData.type,
      { format: 'CSV', recordCount, fileName },
      exportData.permissionContext.userId,
      { 
        action: 'csv_export',
        filters: options.includeFields || options.excludeFields ? { includeFields: options.includeFields, excludeFields: options.excludeFields } : undefined
      }
    );

    return {
      fileName,
      filePath,
      format: 'CSV',
      recordCount,
      generatedAt: new Date(),
      generatedBy: exportData.permissionContext.userId
    };
  }

  /**
   * Export data to PDF format
   */
  private async exportToPDF(exportData: ExportData, options: ExportOptions): Promise<ExportResult> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = options.fileName || `${exportData.type.toLowerCase()}_${timestamp}.pdf`;
    const filePath = path.join(this.exportDirectory, fileName);

    const doc = new PDFDocument();
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    let recordCount = 0;

    // Add header
    doc.fontSize(16).text(`${exportData.type.replace(/_/g, ' ')} Report`, { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).text(`Generated on: ${new Date().toLocaleString()}`, { align: 'right' });
    doc.text(`Generated by: ${exportData.permissionContext.userId}`, { align: 'right' });
    doc.moveDown(2);

    switch (exportData.type) {
      case 'EMPLOYEE_ROSTER':
        const rosterData = exportData.data as EmployeeRosterReport;
        recordCount = await this.addEmployeeRosterToPDF(doc, rosterData, exportData.permissionContext, options);
        break;

      case 'DEPARTMENT_BREAKDOWN':
        const deptData = exportData.data as DepartmentBreakdownReport;
        recordCount = await this.addDepartmentBreakdownToPDF(doc, deptData);
        break;

      case 'WORKFORCE_ANALYTICS':
        const analyticsData = exportData.data as WorkforceAnalytics;
        recordCount = await this.addWorkforceAnalyticsToPDF(doc, analyticsData);
        break;
    }

    doc.end();

    // Wait for PDF generation to complete
    await new Promise<void>((resolve, reject) => {
      stream.on('finish', () => resolve());
      stream.on('error', reject);
    });

    // Log export activity
    await this.auditLogRepository.logDataExport(
      exportData.type,
      { format: 'PDF', recordCount, fileName },
      exportData.permissionContext.userId,
      { 
        action: 'pdf_export',
        filters: options.includeFields || options.excludeFields ? { includeFields: options.includeFields, excludeFields: options.excludeFields } : undefined
      }
    );

    return {
      fileName,
      filePath,
      format: 'PDF',
      recordCount,
      generatedAt: new Date(),
      generatedBy: exportData.permissionContext.userId
    };
  }

  /**
   * Prepare employee roster data for CSV export
   */
  private prepareEmployeeRosterForCSV(
    employees: Employee[], 
    permissionContext: PermissionContext, 
    options: ExportOptions
  ): any[] {
    return employees.map(employee => {
      const baseData = {
        'Employee ID': employee.employeeId,
        'First Name': employee.personalInfo.firstName,
        'Last Name': employee.personalInfo.lastName,
        'Email': employee.personalInfo.email,
        'Job Title': employee.jobInfo.jobTitle,
        'Department': employee.jobInfo.department,
        'Employment Type': employee.jobInfo.employmentType,
        'Start Date': employee.jobInfo.startDate.toISOString().split('T')[0],
        'Location': employee.jobInfo.location,
        'Status': employee.status.current,
        'Status Effective Date': employee.status.effectiveDate.toISOString().split('T')[0]
      };

      // Add optional fields based on permissions
      if (permissionContext.role === 'HR_ADMIN') {
        if (employee.personalInfo.phone) {
          (baseData as any)['Phone'] = employee.personalInfo.phone;
        }
        if (employee.personalInfo.dateOfBirth) {
          (baseData as any)['Date of Birth'] = employee.personalInfo.dateOfBirth.toISOString().split('T')[0];
        }
        if (employee.jobInfo.salary) {
          (baseData as any)['Salary'] = employee.jobInfo.salary;
        }
      }

      // Apply field filtering if specified
      return this.applyFieldFiltering(baseData, options);
    });
  }

  /**
   * Prepare department breakdown data for CSV export
   */
  private prepareDepartmentBreakdownForCSV(departments: any[]): any[] {
    return departments.map(dept => ({
      'Department': dept.departmentName,
      'Total Employees': dept.totalEmployees,
      'Active': dept.activeEmployees,
      'Inactive': dept.inactiveEmployees,
      'Terminated': dept.terminatedEmployees,
      'On Leave': dept.onLeaveEmployees,
      'Full Time': dept.employmentTypeBreakdown.fullTime,
      'Part Time': dept.employmentTypeBreakdown.partTime,
      'Contract': dept.employmentTypeBreakdown.contract,
      'Intern': dept.employmentTypeBreakdown.intern,
      'Avg Years of Service': dept.averageYearsOfService
    }));
  }

  /**
   * Prepare workforce analytics data for CSV export
   */
  private prepareWorkforceAnalyticsForCSV(analytics: WorkforceAnalytics): any[] {
    return [{
      'Total Employees': analytics.totalEmployees,
      'Active Employees': analytics.statusBreakdown.active,
      'Inactive Employees': analytics.statusBreakdown.inactive,
      'Terminated Employees': analytics.statusBreakdown.terminated,
      'On Leave Employees': analytics.statusBreakdown.onLeave,
      'Full Time Employees': analytics.employmentTypeBreakdown.fullTime,
      'Part Time Employees': analytics.employmentTypeBreakdown.partTime,
      'Contract Employees': analytics.employmentTypeBreakdown.contract,
      'Intern Employees': analytics.employmentTypeBreakdown.intern,
      'Average Years of Service': analytics.averageYearsOfService,
      'New Hires Last Month': analytics.newHiresLastMonth,
      'Terminations Last Month': analytics.terminationsLastMonth
    }];
  }

  /**
   * Add employee roster to PDF
   */
  private async addEmployeeRosterToPDF(
    doc: PDFKit.PDFDocument, 
    report: EmployeeRosterReport, 
    permissionContext: PermissionContext,
    _options: ExportOptions
  ): Promise<number> {
    doc.fontSize(14).text('Employee Roster', { underline: true });
    doc.moveDown();

    // Add summary
    doc.fontSize(10).text(`Total Employees: ${report.totalCount}`);
    doc.moveDown();

    // Add employee details
    report.employees.forEach((employee, index) => {
      if (index > 0) doc.moveDown();
      
      doc.text(`${employee.employeeId} - ${employee.getFullName()}`);
      doc.text(`Job Title: ${employee.jobInfo.jobTitle}`);
      doc.text(`Department: ${employee.jobInfo.department}`);
      doc.text(`Status: ${employee.status.current}`);
      doc.text(`Employment Type: ${employee.jobInfo.employmentType}`);
      
      if (permissionContext.role === 'HR_ADMIN' && employee.jobInfo.salary) {
        doc.text(`Salary: $${employee.jobInfo.salary.toLocaleString()}`);
      }
    });

    return report.employees.length;
  }

  /**
   * Add department breakdown to PDF
   */
  private async addDepartmentBreakdownToPDF(
    doc: PDFKit.PDFDocument, 
    report: DepartmentBreakdownReport
  ): Promise<number> {
    doc.fontSize(14).text('Department Breakdown', { underline: true });
    doc.moveDown();

    // Add summary
    doc.fontSize(10).text(`Total Employees: ${report.totalEmployees}`);
    doc.moveDown();

    // Add department details
    report.departments.forEach((dept, index) => {
      if (index > 0) doc.moveDown();
      
      doc.text(`Department: ${dept.departmentName}`);
      doc.text(`Total: ${dept.totalEmployees} | Active: ${dept.activeEmployees} | Inactive: ${dept.inactiveEmployees}`);
      doc.text(`Terminated: ${dept.terminatedEmployees} | On Leave: ${dept.onLeaveEmployees}`);
      doc.text(`Employment Types - FT: ${dept.employmentTypeBreakdown.fullTime}, PT: ${dept.employmentTypeBreakdown.partTime}, Contract: ${dept.employmentTypeBreakdown.contract}, Intern: ${dept.employmentTypeBreakdown.intern}`);
      doc.text(`Average Years of Service: ${dept.averageYearsOfService}`);
    });

    return report.departments.length;
  }

  /**
   * Add workforce analytics to PDF
   */
  private async addWorkforceAnalyticsToPDF(
    doc: PDFKit.PDFDocument, 
    analytics: WorkforceAnalytics
  ): Promise<number> {
    doc.fontSize(14).text('Workforce Analytics', { underline: true });
    doc.moveDown();

    doc.fontSize(12).text('Overall Statistics', { underline: true });
    doc.fontSize(10);
    doc.text(`Total Employees: ${analytics.totalEmployees}`);
    doc.text(`Average Years of Service: ${analytics.averageYearsOfService}`);
    doc.moveDown();

    doc.fontSize(12).text('Status Breakdown', { underline: true });
    doc.fontSize(10);
    doc.text(`Active: ${analytics.statusBreakdown.active}`);
    doc.text(`Inactive: ${analytics.statusBreakdown.inactive}`);
    doc.text(`Terminated: ${analytics.statusBreakdown.terminated}`);
    doc.text(`On Leave: ${analytics.statusBreakdown.onLeave}`);
    doc.moveDown();

    doc.fontSize(12).text('Employment Type Breakdown', { underline: true });
    doc.fontSize(10);
    doc.text(`Full Time: ${analytics.employmentTypeBreakdown.fullTime}`);
    doc.text(`Part Time: ${analytics.employmentTypeBreakdown.partTime}`);
    doc.text(`Contract: ${analytics.employmentTypeBreakdown.contract}`);
    doc.text(`Intern: ${analytics.employmentTypeBreakdown.intern}`);
    doc.moveDown();

    doc.fontSize(12).text('Recent Activity', { underline: true });
    doc.fontSize(10);
    doc.text(`New Hires Last Month: ${analytics.newHiresLastMonth}`);
    doc.text(`Terminations Last Month: ${analytics.terminationsLastMonth}`);

    return 1; // Single analytics record
  }

  /**
   * Apply field filtering based on export options
   */
  private applyFieldFiltering(data: any, options: ExportOptions): any {
    if (options.includeFields && options.includeFields.length > 0) {
      const filtered: any = {};
      options.includeFields.forEach(field => {
        if (data.hasOwnProperty(field)) {
          filtered[field] = data[field];
        }
      });
      return filtered;
    }

    if (options.excludeFields && options.excludeFields.length > 0) {
      const filtered = { ...data };
      options.excludeFields.forEach(field => {
        delete filtered[field];
      });
      return filtered;
    }

    return data;
  }

  /**
   * Clean up old export files
   */
  async cleanupOldExports(maxAgeHours: number = 24): Promise<number> {
    const files = fs.readdirSync(this.exportDirectory);
    const cutoffTime = new Date(Date.now() - (maxAgeHours * 60 * 60 * 1000));
    let deletedCount = 0;

    for (const file of files) {
      const filePath = path.join(this.exportDirectory, file);
      const stats = fs.statSync(filePath);
      
      if (stats.mtime < cutoffTime) {
        fs.unlinkSync(filePath);
        deletedCount++;
      }
    }

    return deletedCount;
  }
}