import { JobInfo, JobInfoData, EmploymentType } from './JobInfo';
import { ValidationError } from '../utils/validation';

describe('JobInfo Model', () => {
  const validJobInfoData: JobInfoData = {
    jobTitle: 'Software Engineer',
    department: 'Engineering',
    startDate: new Date('2023-01-15'),
    employmentType: 'FULL_TIME' as EmploymentType,
    location: 'San Francisco, CA',
    managerId: '123e4567-e89b-12d3-a456-426614174000',
    salary: 120000
  };

  describe('Constructor and Validation', () => {
    it('should create a valid JobInfo with all fields', () => {
      const jobInfo = new JobInfo(validJobInfoData);

      expect(jobInfo.jobTitle).toBe('Software Engineer');
      expect(jobInfo.department).toBe('Engineering');
      expect(jobInfo.startDate).toEqual(new Date('2023-01-15'));
      expect(jobInfo.employmentType).toBe('FULL_TIME');
      expect(jobInfo.location).toBe('San Francisco, CA');
      expect(jobInfo.managerId).toBe('123e4567-e89b-12d3-a456-426614174000');
      expect(jobInfo.salary).toBe(120000);
    });

    it('should create a valid JobInfo with only required fields', () => {
      const minimalData: JobInfoData = {
        jobTitle: 'Developer',
        department: 'IT',
        startDate: new Date('2023-02-01'),
        employmentType: 'PART_TIME' as EmploymentType,
        location: 'Remote'
      };

      const jobInfo = new JobInfo(minimalData);

      expect(jobInfo.jobTitle).toBe('Developer');
      expect(jobInfo.department).toBe('IT');
      expect(jobInfo.startDate).toEqual(new Date('2023-02-01'));
      expect(jobInfo.employmentType).toBe('PART_TIME');
      expect(jobInfo.location).toBe('Remote');
      expect(jobInfo.managerId).toBeUndefined();
      expect(jobInfo.salary).toBeUndefined();
    });

    it('should trim whitespace from string fields', () => {
      const dataWithWhitespace: JobInfoData = {
        jobTitle: '  Senior Developer  ',
        department: '  Engineering  ',
        startDate: new Date('2023-01-15'),
        employmentType: 'FULL_TIME' as EmploymentType,
        location: '  New York, NY  '
      };

      const jobInfo = new JobInfo(dataWithWhitespace);

      expect(jobInfo.jobTitle).toBe('Senior Developer');
      expect(jobInfo.department).toBe('Engineering');
      expect(jobInfo.location).toBe('New York, NY');
    });

    it('should throw ValidationError for missing required fields', () => {
      const invalidData = { jobTitle: 'Developer' } as JobInfoData;
      expect(() => new JobInfo(invalidData)).toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid employment type', () => {
      const invalidData: JobInfoData = {
        jobTitle: 'Developer',
        department: 'IT',
        startDate: new Date('2023-01-15'),
        employmentType: 'INVALID_TYPE' as EmploymentType,
        location: 'Remote'
      };
      expect(() => new JobInfo(invalidData)).toThrow(ValidationError);
    });

    it('should throw ValidationError for job title exceeding max length', () => {
      const invalidData: JobInfoData = {
        jobTitle: 'a'.repeat(101), // Exceeds 100 character limit
        department: 'Engineering',
        startDate: new Date('2023-01-15'),
        employmentType: 'FULL_TIME',
        location: 'San Francisco, CA'
      };
      expect(() => new JobInfo(invalidData)).toThrow(ValidationError);
    });

    it('should throw ValidationError for department exceeding max length', () => {
      const invalidData: JobInfoData = {
        jobTitle: 'Software Engineer',
        department: 'a'.repeat(51), // Exceeds 50 character limit
        startDate: new Date('2023-01-15'),
        employmentType: 'FULL_TIME',
        location: 'San Francisco, CA'
      };
      expect(() => new JobInfo(invalidData)).toThrow(ValidationError);
    });

    it('should throw ValidationError for location exceeding max length', () => {
      const invalidData: JobInfoData = {
        jobTitle: 'Software Engineer',
        department: 'Engineering',
        startDate: new Date('2023-01-15'),
        employmentType: 'FULL_TIME',
        location: 'a'.repeat(101) // Exceeds 100 character limit
      };
      expect(() => new JobInfo(invalidData)).toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid manager ID format', () => {
      const invalidData: JobInfoData = {
        jobTitle: 'Software Engineer',
        department: 'Engineering',
        startDate: new Date('2023-01-15'),
        employmentType: 'FULL_TIME',
        location: 'San Francisco, CA',
        managerId: 'invalid-uuid'
      };
      expect(() => new JobInfo(invalidData)).toThrow(ValidationError);
    });

    it('should throw ValidationError for negative salary', () => {
      const invalidData: JobInfoData = {
        jobTitle: 'Software Engineer',
        department: 'Engineering',
        startDate: new Date('2023-01-15'),
        employmentType: 'FULL_TIME',
        location: 'San Francisco, CA',
        salary: -50000
      };
      expect(() => new JobInfo(invalidData)).toThrow(ValidationError);
    });

    it('should accept zero salary', () => {
      const validData: JobInfoData = {
        jobTitle: 'Intern',
        department: 'Engineering',
        startDate: new Date('2023-01-15'),
        employmentType: 'INTERN',
        location: 'San Francisco, CA',
        salary: 0
      };
      expect(() => new JobInfo(validData)).not.toThrow();
    });
  });

  describe('Employment Type Validation', () => {
    const baseData = {
      jobTitle: 'Software Engineer',
      department: 'Engineering',
      startDate: new Date('2023-01-15'),
      location: 'San Francisco, CA'
    };

    it('should accept FULL_TIME employment type', () => {
      const data: JobInfoData = { ...baseData, employmentType: 'FULL_TIME' };
      expect(() => new JobInfo(data)).not.toThrow();
    });

    it('should accept PART_TIME employment type', () => {
      const data: JobInfoData = { ...baseData, employmentType: 'PART_TIME' };
      expect(() => new JobInfo(data)).not.toThrow();
    });

    it('should accept CONTRACT employment type', () => {
      const data: JobInfoData = { ...baseData, employmentType: 'CONTRACT' };
      expect(() => new JobInfo(data)).not.toThrow();
    });

    it('should accept INTERN employment type', () => {
      const data: JobInfoData = { ...baseData, employmentType: 'INTERN' };
      expect(() => new JobInfo(data)).not.toThrow();
    });
  });

  describe('Update Method', () => {
    let jobInfo: JobInfo;

    beforeEach(() => {
      jobInfo = new JobInfo(validJobInfoData);
    });

    it('should update job info with new data', () => {
      const updates = {
        jobTitle: 'Senior Software Engineer',
        salary: 150000
      };

      const updatedJobInfo = jobInfo.update(updates);

      expect(updatedJobInfo.jobTitle).toBe('Senior Software Engineer');
      expect(updatedJobInfo.salary).toBe(150000);
      expect(updatedJobInfo.department).toBe(jobInfo.department); // Unchanged
      expect(updatedJobInfo.startDate).toEqual(jobInfo.startDate); // Unchanged
    });

    it('should validate updated data', () => {
      const invalidUpdates = {
        employmentType: 'INVALID_TYPE' as EmploymentType
      };

      expect(() => jobInfo.update(invalidUpdates)).toThrow(ValidationError);
    });
  });

  describe('Helper Methods', () => {
    let jobInfo: JobInfo;

    beforeEach(() => {
      jobInfo = new JobInfo(validJobInfoData);
    });

    it('should correctly identify full-time employment', () => {
      expect(jobInfo.isFullTime()).toBe(true);

      const partTimeJobInfo = new JobInfo({
        ...validJobInfoData,
        employmentType: 'PART_TIME'
      });
      expect(partTimeJobInfo.isFullTime()).toBe(false);
    });

    it('should correctly identify contractor employment', () => {
      expect(jobInfo.isContractor()).toBe(false);

      const contractorJobInfo = new JobInfo({
        ...validJobInfoData,
        employmentType: 'CONTRACT'
      });
      expect(contractorJobInfo.isContractor()).toBe(true);
    });

    it('should calculate years of service correctly', () => {
      const startDate = new Date();
      startDate.setFullYear(startDate.getFullYear() - 3); // 3 years ago

      const jobInfoWithOlderStart = new JobInfo({
        ...validJobInfoData,
        startDate
      });

      expect(jobInfoWithOlderStart.getYearsOfService()).toBe(3);
    });

    it('should calculate years of service for recent start date', () => {
      const recentStartDate = new Date();
      recentStartDate.setMonth(recentStartDate.getMonth() - 6); // 6 months ago

      const recentJobInfo = new JobInfo({
        ...validJobInfoData,
        startDate: recentStartDate
      });

      expect(recentJobInfo.getYearsOfService()).toBe(0);
    });

    it('should calculate years of service for exactly one year', () => {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      oneYearAgo.setDate(oneYearAgo.getDate() - 1); // Ensure it's slightly more than a year

      const oneYearJobInfo = new JobInfo({
        ...validJobInfoData,
        startDate: oneYearAgo
      });

      expect(oneYearJobInfo.getYearsOfService()).toBe(1);
    });
  });

  describe('JSON Serialization', () => {
    it('should serialize to JSON correctly', () => {
      const jobInfo = new JobInfo(validJobInfoData);
      const json = jobInfo.toJSON();

      expect(json.jobTitle).toBe('Software Engineer');
      expect(json.department).toBe('Engineering');
      expect(json.startDate).toEqual(new Date('2023-01-15'));
      expect(json.employmentType).toBe('FULL_TIME');
      expect(json.location).toBe('San Francisco, CA');
      expect(json.managerId).toBe('123e4567-e89b-12d3-a456-426614174000');
      expect(json.salary).toBe(120000);
    });

    it('should serialize to JSON correctly with minimal data', () => {
      const minimalData: JobInfoData = {
        jobTitle: 'Developer',
        department: 'IT',
        startDate: new Date('2023-02-01'),
        employmentType: 'PART_TIME',
        location: 'Remote'
      };

      const jobInfo = new JobInfo(minimalData);
      const json = jobInfo.toJSON();

      expect(json.jobTitle).toBe('Developer');
      expect(json.department).toBe('IT');
      expect(json.startDate).toEqual(new Date('2023-02-01'));
      expect(json.employmentType).toBe('PART_TIME');
      expect(json.location).toBe('Remote');
      expect(json.managerId).toBeUndefined();
      expect(json.salary).toBeUndefined();
    });

    it('should round-trip through JSON correctly', () => {
      const originalJobInfo = new JobInfo(validJobInfoData);
      const json = originalJobInfo.toJSON();
      const recreatedJobInfo = new JobInfo(json);

      expect(recreatedJobInfo.jobTitle).toBe(originalJobInfo.jobTitle);
      expect(recreatedJobInfo.department).toBe(originalJobInfo.department);
      expect(recreatedJobInfo.startDate).toEqual(originalJobInfo.startDate);
      expect(recreatedJobInfo.employmentType).toBe(originalJobInfo.employmentType);
      expect(recreatedJobInfo.location).toBe(originalJobInfo.location);
      expect(recreatedJobInfo.managerId).toBe(originalJobInfo.managerId);
      expect(recreatedJobInfo.salary).toBe(originalJobInfo.salary);
    });
  });
});