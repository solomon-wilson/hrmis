import { PersonalInfo, PersonalInfoData, Address, EmergencyContact } from './PersonalInfo';
import { ValidationError } from '../utils/validation';

describe('PersonalInfo Model', () => {
  const validPersonalInfoData: PersonalInfoData = {
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@company.com',
    phone: '+1-555-123-4567',
    address: {
      street: '123 Main St',
      city: 'Anytown',
      state: 'CA',
      zipCode: '12345',
      country: 'USA'
    },
    dateOfBirth: new Date('1990-05-15'),
    emergencyContact: {
      name: 'Jane Doe',
      relationship: 'Spouse',
      phone: '+1-555-987-6543',
      email: 'jane.doe@email.com'
    }
  };

  describe('Constructor and Validation', () => {
    it('should create a valid PersonalInfo with all fields', () => {
      const personalInfo = new PersonalInfo(validPersonalInfoData);

      expect(personalInfo.firstName).toBe('John');
      expect(personalInfo.lastName).toBe('Doe');
      expect(personalInfo.email).toBe('john.doe@company.com');
      expect(personalInfo.phone).toBe('+1-555-123-4567');
      expect(personalInfo.address).toEqual(validPersonalInfoData.address);
      expect(personalInfo.dateOfBirth).toEqual(new Date('1990-05-15'));
      expect(personalInfo.emergencyContact).toEqual(validPersonalInfoData.emergencyContact);
    });

    it('should create a valid PersonalInfo with only required fields', () => {
      const minimalData: PersonalInfoData = {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane.smith@company.com'
      };

      const personalInfo = new PersonalInfo(minimalData);

      expect(personalInfo.firstName).toBe('Jane');
      expect(personalInfo.lastName).toBe('Smith');
      expect(personalInfo.email).toBe('jane.smith@company.com');
      expect(personalInfo.phone).toBeUndefined();
      expect(personalInfo.address).toBeUndefined();
      expect(personalInfo.dateOfBirth).toBeUndefined();
      expect(personalInfo.emergencyContact).toBeUndefined();
    });

    it('should trim whitespace from string fields', () => {
      const dataWithWhitespace: PersonalInfoData = {
        firstName: '  John  ',
        lastName: '  Doe  ',
        email: '  john.doe@company.com  '
      };

      const personalInfo = new PersonalInfo(dataWithWhitespace);

      expect(personalInfo.firstName).toBe('John');
      expect(personalInfo.lastName).toBe('Doe');
      expect(personalInfo.email).toBe('john.doe@company.com');
    });

    it('should trim whitespace from phone field', () => {
      const dataWithWhitespacePhone: PersonalInfoData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@company.com',
        phone: '  +1-555-123-4567  '
      };

      const personalInfo = new PersonalInfo(dataWithWhitespacePhone);

      expect(personalInfo.phone).toBe('+1-555-123-4567');
    });

    it('should convert email to lowercase', () => {
      const dataWithUppercaseEmail: PersonalInfoData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'JOHN.DOE@COMPANY.COM'
      };

      const personalInfo = new PersonalInfo(dataWithUppercaseEmail);

      expect(personalInfo.email).toBe('john.doe@company.com');
    });

    it('should throw ValidationError for missing required fields', () => {
      const invalidData = { firstName: 'John', lastName: 'Doe' } as PersonalInfoData;
      expect(() => new PersonalInfo(invalidData)).toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid email format', () => {
      const invalidData: PersonalInfoData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'invalid-email'
      };
      expect(() => new PersonalInfo(invalidData)).toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid phone format', () => {
      const invalidData: PersonalInfoData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@company.com',
        phone: '123' // Too short
      };
      expect(() => new PersonalInfo(invalidData)).toThrow(ValidationError);
    });

    it('should throw ValidationError for first name exceeding max length', () => {
      const invalidData: PersonalInfoData = {
        firstName: 'a'.repeat(51), // Exceeds 50 character limit
        lastName: 'Doe',
        email: 'john.doe@company.com'
      };
      expect(() => new PersonalInfo(invalidData)).toThrow(ValidationError);
    });

    it('should throw ValidationError for last name exceeding max length', () => {
      const invalidData: PersonalInfoData = {
        firstName: 'John',
        lastName: 'a'.repeat(51), // Exceeds 50 character limit
        email: 'john.doe@company.com'
      };
      expect(() => new PersonalInfo(invalidData)).toThrow(ValidationError);
    });

    it('should throw ValidationError for email exceeding max length', () => {
      const longEmail = 'a'.repeat(90) + '@company.com'; // Exceeds 100 character limit
      const invalidData: PersonalInfoData = {
        firstName: 'John',
        lastName: 'Doe',
        email: longEmail
      };
      expect(() => new PersonalInfo(invalidData)).toThrow(ValidationError);
    });

    it('should throw ValidationError for date of birth in the future', () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      const invalidData: PersonalInfoData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@company.com',
        dateOfBirth: futureDate
      };
      expect(() => new PersonalInfo(invalidData)).toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid SSN format', () => {
      const invalidData: PersonalInfoData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@company.com',
        socialSecurityNumber: '123456789' // Should be XXX-XX-XXXX format
      };
      expect(() => new PersonalInfo(invalidData)).toThrow(ValidationError);
    });

    it('should accept valid SSN format', () => {
      const validData: PersonalInfoData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@company.com',
        socialSecurityNumber: '123-45-6789'
      };
      expect(() => new PersonalInfo(validData)).not.toThrow();
    });
  });

  describe('Address Validation', () => {
    it('should validate complete address', () => {
      const validAddress: Address = {
        street: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        zipCode: '12345',
        country: 'USA'
      };

      const data: PersonalInfoData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@company.com',
        address: validAddress
      };

      expect(() => new PersonalInfo(data)).not.toThrow();
    });

    it('should throw ValidationError for invalid zip code format', () => {
      const invalidAddress: Address = {
        street: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        zipCode: '123', // Invalid format
        country: 'USA'
      };

      const data: PersonalInfoData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@company.com',
        address: invalidAddress
      };

      expect(() => new PersonalInfo(data)).toThrow(ValidationError);
    });

    it('should accept extended zip code format', () => {
      const validAddress: Address = {
        street: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        zipCode: '12345-6789',
        country: 'USA'
      };

      const data: PersonalInfoData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@company.com',
        address: validAddress
      };

      expect(() => new PersonalInfo(data)).not.toThrow();
    });
  });

  describe('Emergency Contact Validation', () => {
    it('should validate complete emergency contact', () => {
      const validEmergencyContact: EmergencyContact = {
        name: 'Jane Doe',
        relationship: 'Spouse',
        phone: '+1-555-987-6543',
        email: 'jane.doe@email.com'
      };

      const data: PersonalInfoData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@company.com',
        emergencyContact: validEmergencyContact
      };

      expect(() => new PersonalInfo(data)).not.toThrow();
    });

    it('should validate emergency contact without email', () => {
      const validEmergencyContact: EmergencyContact = {
        name: 'Jane Doe',
        relationship: 'Spouse',
        phone: '+1-555-987-6543'
      };

      const data: PersonalInfoData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@company.com',
        emergencyContact: validEmergencyContact
      };

      expect(() => new PersonalInfo(data)).not.toThrow();
    });

    it('should throw ValidationError for emergency contact with invalid phone', () => {
      const invalidEmergencyContact: EmergencyContact = {
        name: 'Jane Doe',
        relationship: 'Spouse',
        phone: '123' // Too short
      };

      const data: PersonalInfoData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@company.com',
        emergencyContact: invalidEmergencyContact
      };

      expect(() => new PersonalInfo(data)).toThrow(ValidationError);
    });
  });

  describe('Update Method', () => {
    let personalInfo: PersonalInfo;

    beforeEach(() => {
      personalInfo = new PersonalInfo(validPersonalInfoData);
    });

    it('should update personal info with new data', () => {
      const updates = {
        firstName: 'Jane',
        phone: '+1-555-999-8888'
      };

      const updatedPersonalInfo = personalInfo.update(updates);

      expect(updatedPersonalInfo.firstName).toBe('Jane');
      expect(updatedPersonalInfo.phone).toBe('+1-555-999-8888');
      expect(updatedPersonalInfo.lastName).toBe(personalInfo.lastName); // Unchanged
      expect(updatedPersonalInfo.email).toBe(personalInfo.email); // Unchanged
    });

    it('should validate updated data', () => {
      const invalidUpdates = {
        email: 'invalid-email'
      };

      expect(() => personalInfo.update(invalidUpdates)).toThrow(ValidationError);
    });
  });

  describe('Helper Methods', () => {
    let personalInfo: PersonalInfo;

    beforeEach(() => {
      personalInfo = new PersonalInfo(validPersonalInfoData);
    });

    it('should return full name', () => {
      expect(personalInfo.getFullName()).toBe('John Doe');
    });

    it('should validate email correctly', () => {
      expect(personalInfo.validateEmail()).toBe(true);

      const invalidPersonalInfo = new PersonalInfo({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@company.com'
      });
      expect(invalidPersonalInfo.validateEmail()).toBe(true);
    });
  });

  describe('JSON Serialization', () => {
    it('should serialize to JSON correctly', () => {
      const personalInfo = new PersonalInfo(validPersonalInfoData);
      const json = personalInfo.toJSON();

      expect(json.firstName).toBe('John');
      expect(json.lastName).toBe('Doe');
      expect(json.email).toBe('john.doe@company.com');
      expect(json.phone).toBe('+1-555-123-4567');
      expect(json.address).toEqual(validPersonalInfoData.address);
      expect(json.dateOfBirth).toEqual(new Date('1990-05-15'));
      expect(json.emergencyContact).toEqual(validPersonalInfoData.emergencyContact);
    });

    it('should round-trip through JSON correctly', () => {
      const originalPersonalInfo = new PersonalInfo(validPersonalInfoData);
      const json = originalPersonalInfo.toJSON();
      const recreatedPersonalInfo = new PersonalInfo(json);

      expect(recreatedPersonalInfo.firstName).toBe(originalPersonalInfo.firstName);
      expect(recreatedPersonalInfo.lastName).toBe(originalPersonalInfo.lastName);
      expect(recreatedPersonalInfo.email).toBe(originalPersonalInfo.email);
      expect(recreatedPersonalInfo.phone).toBe(originalPersonalInfo.phone);
      expect(recreatedPersonalInfo.address).toEqual(originalPersonalInfo.address);
      expect(recreatedPersonalInfo.dateOfBirth).toEqual(originalPersonalInfo.dateOfBirth);
      expect(recreatedPersonalInfo.emergencyContact).toEqual(originalPersonalInfo.emergencyContact);
    });
  });
});