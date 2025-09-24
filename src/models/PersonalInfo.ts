import Joi from 'joi';
import { 
  validateAndThrow, 
  requiredStringSchema, 
  emailSchema, 
  phoneSchema, 
  optionalDateSchema,
  addressSchema,
  emergencyContactSchema
} from '../utils/validation';

export interface Address {
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

export interface EmergencyContact {
  name: string;
  relationship: string;
  phone: string;
  email?: string;
}

export interface PersonalInfoData {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  address?: Address;
  dateOfBirth?: Date;
  socialSecurityNumber?: string; // Encrypted
  emergencyContact?: EmergencyContact;
}

export class PersonalInfo implements PersonalInfoData {
  public firstName: string;
  public lastName: string;
  public email: string;
  public phone?: string;
  public address?: Address;
  public dateOfBirth?: Date;
  public socialSecurityNumber?: string;
  public emergencyContact?: EmergencyContact;

  constructor(data: PersonalInfoData) {
    this.validate(data);
    
    this.firstName = data.firstName.trim();
    this.lastName = data.lastName.trim();
    this.email = data.email.toLowerCase().trim();
    this.phone = data.phone?.trim();
    this.address = data.address;
    this.dateOfBirth = data.dateOfBirth;
    this.socialSecurityNumber = data.socialSecurityNumber;
    this.emergencyContact = data.emergencyContact;
  }

  private validate(data: PersonalInfoData): void {
    // Pre-process data to trim strings for validation
    const processedData = {
      ...data,
      firstName: data.firstName?.trim(),
      lastName: data.lastName?.trim(),
      email: data.email?.trim(),
      phone: data.phone?.trim()
    };

    const schema = Joi.object({
      firstName: requiredStringSchema.max(50),
      lastName: requiredStringSchema.max(50),
      email: emailSchema.max(100),
      phone: phoneSchema.optional(),
      address: addressSchema.optional(),
      dateOfBirth: optionalDateSchema.max('now'),
      socialSecurityNumber: Joi.string().optional().pattern(/^\d{3}-\d{2}-\d{4}$/),
      emergencyContact: emergencyContactSchema.optional()
    });

    validateAndThrow<PersonalInfoData>(schema, processedData);
  }

  public update(updates: Partial<PersonalInfoData>): PersonalInfo {
    const updatedData = { ...this.toJSON(), ...updates };
    return new PersonalInfo(updatedData);
  }

  public toJSON(): PersonalInfoData {
    return {
      firstName: this.firstName,
      lastName: this.lastName,
      email: this.email,
      phone: this.phone,
      address: this.address,
      dateOfBirth: this.dateOfBirth,
      socialSecurityNumber: this.socialSecurityNumber,
      emergencyContact: this.emergencyContact
    };
  }

  public getFullName(): string {
    return `${this.firstName} ${this.lastName}`;
  }

  public validateEmail(): boolean {
    try {
      emailSchema.validate(this.email);
      return true;
    } catch {
      return false;
    }
  }
}