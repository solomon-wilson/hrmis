import Joi from 'joi';
import { validateAndThrow, requiredStringSchema, emailSchema, phoneSchema, optionalDateSchema, addressSchema, emergencyContactSchema } from '../utils/validation';
export class PersonalInfo {
    constructor(data) {
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
    validate(data) {
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
        validateAndThrow(schema, processedData);
    }
    update(updates) {
        const updatedData = { ...this.toJSON(), ...updates };
        return new PersonalInfo(updatedData);
    }
    toJSON() {
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
    getFullName() {
        return `${this.firstName} ${this.lastName}`;
    }
    validateEmail() {
        try {
            emailSchema.validate(this.email);
            return true;
        }
        catch {
            return false;
        }
    }
}
