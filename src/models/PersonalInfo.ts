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

export interface PersonalInfo {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  address?: Address;
  dateOfBirth?: Date;
  socialSecurityNumber?: string; // Encrypted
  emergencyContact?: EmergencyContact;
}