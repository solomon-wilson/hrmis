import { ReportService } from '../services/ReportService';
import { ValidationError } from '../utils/validation';
export class ReportController {
    constructor() {
        this.reportService = new ReportService();
    }
    /**
     * Generate employee roster report
     */
    async generateEmployeeRoster(req, res) {
        try {
            const filters = this.parseReportFilters(req.query);
            const permissionContext = this.createPermissionContext(req.user);
            const report = await this.reportService.generateEmployeeRosterReport(filters, permissionContext);
            res.json({
                success: true,
                data: report
            });
        }
        catch (error) {
            this.handleError(error, res);
        }
    }
    /**
     * Generate department breakdown report
     */
    async generateDepartmentBreakdown(req, res) {
        try {
            const filters = this.parseReportFilters(req.query);
            const permissionContext = this.createPermissionContext(req.user);
            const report = await this.reportService.generateDepartmentBreakdownReport(filters, permissionContext);
            res.json({
                success: true,
                data: report
            });
        }
        catch (error) {
            this.handleError(error, res);
        }
    }
    /**
     * Generate workforce analytics
     */
    async generateWorkforceAnalytics(req, res) {
        try {
            const filters = this.parseReportFilters(req.query);
            const permissionContext = this.createPermissionContext(req.user);
            const analytics = await this.reportService.generateWorkforceAnalytics(filters, permissionContext);
            res.json({
                success: true,
                data: analytics
            });
        }
        catch (error) {
            this.handleError(error, res);
        }
    }
    /**
     * Export employee roster report
     */
    async exportEmployeeRoster(req, res) {
        try {
            const filters = this.parseReportFilters(req.query);
            const exportOptions = this.parseExportOptions(req.body);
            const permissionContext = this.createPermissionContext(req.user);
            const result = await this.reportService.exportEmployeeRoster(filters, exportOptions, permissionContext);
            res.json({
                success: true,
                data: result
            });
        }
        catch (error) {
            this.handleError(error, res);
        }
    }
    /**
     * Export department breakdown report
     */
    async exportDepartmentBreakdown(req, res) {
        try {
            const filters = this.parseReportFilters(req.query);
            const exportOptions = this.parseExportOptions(req.body);
            const permissionContext = this.createPermissionContext(req.user);
            const result = await this.reportService.exportDepartmentBreakdown(filters, exportOptions, permissionContext);
            res.json({
                success: true,
                data: result
            });
        }
        catch (error) {
            this.handleError(error, res);
        }
    }
    /**
     * Export workforce analytics
     */
    async exportWorkforceAnalytics(req, res) {
        try {
            const filters = this.parseReportFilters(req.query);
            const exportOptions = this.parseExportOptions(req.body);
            const permissionContext = this.createPermissionContext(req.user);
            const result = await this.reportService.exportWorkforceAnalytics(filters, exportOptions, permissionContext);
            res.json({
                success: true,
                data: result
            });
        }
        catch (error) {
            this.handleError(error, res);
        }
    }
    /**
     * Download exported file
     */
    async downloadExport(req, res) {
        try {
            const { fileName } = req.params;
            // Validate file name to prevent directory traversal
            if (!fileName || fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
                res.status(400).json({
                    success: false,
                    error: {
                        code: 'INVALID_FILE_NAME',
                        message: 'Invalid file name provided'
                    }
                });
                return;
            }
            const exportDirectory = process.env.EXPORT_DIRECTORY || './exports';
            const filePath = `${exportDirectory}/${fileName}`;
            // Check if file exists
            const fs = require('fs');
            if (!fs.existsSync(filePath)) {
                res.status(404).json({
                    success: false,
                    error: {
                        code: 'FILE_NOT_FOUND',
                        message: 'Export file not found'
                    }
                });
                return;
            }
            // Set appropriate headers based on file type
            const fileExtension = fileName.split('.').pop()?.toLowerCase();
            if (fileExtension === 'csv') {
                res.setHeader('Content-Type', 'text/csv');
            }
            else if (fileExtension === 'pdf') {
                res.setHeader('Content-Type', 'application/pdf');
            }
            res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
            res.download(filePath);
        }
        catch (error) {
            this.handleError(error, res);
        }
    }
    /**
     * Create permission context from authenticated user
     */
    createPermissionContext(user) {
        return {
            userId: user.id,
            role: user.role,
            managedEmployeeIds: [] // This would be populated by middleware in a real implementation
        };
    }
    /**
     * Parse report filters from query parameters
     */
    parseReportFilters(query) {
        const filters = {};
        if (query.department) {
            filters.department = query.department;
        }
        if (query.status) {
            filters.status = query.status;
        }
        if (query.employmentType) {
            filters.employmentType = query.employmentType;
        }
        if (query.startDateFrom) {
            filters.startDateFrom = new Date(query.startDateFrom);
        }
        if (query.startDateTo) {
            filters.startDateTo = new Date(query.startDateTo);
        }
        if (query.managerId) {
            filters.managerId = query.managerId;
        }
        return filters;
    }
    /**
     * Parse export options from request body
     */
    parseExportOptions(body) {
        const options = {
            format: body.format || 'CSV'
        };
        if (body.includeFields && Array.isArray(body.includeFields)) {
            options.includeFields = body.includeFields;
        }
        if (body.excludeFields && Array.isArray(body.excludeFields)) {
            options.excludeFields = body.excludeFields;
        }
        if (body.fileName) {
            options.fileName = body.fileName;
        }
        // Validate format
        if (!['CSV', 'PDF'].includes(options.format)) {
            throw new ValidationError('Invalid export format. Must be CSV or PDF', []);
        }
        return options;
    }
    /**
     * Handle errors and send appropriate response
     */
    handleError(error, res) {
        console.error('Report Controller Error:', error);
        if (error instanceof ValidationError) {
            res.status(400).json({
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: error.message,
                    details: error.details
                }
            });
            return;
        }
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'An unexpected error occurred'
            }
        });
    }
}
