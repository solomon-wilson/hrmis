'use client';

import React, { useState, useRef } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Tooltip } from '../ui/Tooltip';
import { cn } from '../../lib/utils';

interface DocumentUploadFormProps {
  onSubmit: (data: FormData) => Promise<void>;
  acceptedFileTypes?: string[];
  maxFileSize?: number; // in bytes
  employeeId?: string;
}

const DocumentUploadForm: React.FC<DocumentUploadFormProps> = ({
  onSubmit,
  acceptedFileTypes = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png'],
  maxFileSize = 10 * 1024 * 1024, // 10MB default
  employeeId
}) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    documentType: '',
    category: '',
    title: '',
    description: '',
    expirationDate: '',
    isConfidential: false,
    tags: [] as string[]
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [tagInput, setTagInput] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const documentTypes = [
    { value: 'identification', label: 'Identification Document', description: 'Driver\'s license, passport, ID card' },
    { value: 'employment', label: 'Employment Document', description: 'Contract, offer letter, job description' },
    { value: 'tax', label: 'Tax Document', description: 'W-4, tax returns, withholding forms' },
    { value: 'benefits', label: 'Benefits Document', description: 'Insurance forms, beneficiary information' },
    { value: 'training', label: 'Training Certificate', description: 'Certification, training completion' },
    { value: 'performance', label: 'Performance Review', description: 'Annual reviews, feedback forms' },
    { value: 'other', label: 'Other Document', description: 'Any other relevant document' }
  ];

  const categories = [
    { value: 'personal', label: 'Personal Information' },
    { value: 'employment', label: 'Employment Records' },
    { value: 'payroll', label: 'Payroll & Benefits' },
    { value: 'compliance', label: 'Compliance & Legal' },
    { value: 'development', label: 'Professional Development' }
  ];

  const validateFile = (file: File): string | null => {
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();

    if (!acceptedFileTypes.includes(fileExtension)) {
      return `File type ${fileExtension} is not supported. Accepted types: ${acceptedFileTypes.join(', ')}`;
    }

    if (file.size > maxFileSize) {
      return `File size (${(file.size / 1024 / 1024).toFixed(2)}MB) exceeds maximum allowed size (${(maxFileSize / 1024 / 1024)}MB)`;
    }

    return null;
  };

  const handleFileSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const file = files[0];
    const validationError = validateFile(file);

    if (validationError) {
      setErrors({ file: validationError });
      return;
    }

    setSelectedFile(file);
    setErrors({ ...errors, file: '' });
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    handleFileSelect(e.dataTransfer.files);
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
      setFormData({
        ...formData,
        tags: [...formData.tags, tagInput.trim()]
      });
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setFormData({
      ...formData,
      tags: formData.tags.filter(tag => tag !== tagToRemove)
    });
  };

  const validateStep = (step: number): boolean => {
    const newErrors: Record<string, string> = {};

    if (step === 1) {
      if (!formData.documentType) {
        newErrors.documentType = 'Please select a document type';
      }
      if (!formData.category) {
        newErrors.category = 'Please select a category';
      }
    }

    if (step === 2) {
      if (!formData.title.trim()) {
        newErrors.title = 'Document title is required';
      }
      if (!selectedFile) {
        newErrors.file = 'Please select a file to upload';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    setCurrentStep(currentStep - 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateStep(2)) return;

    setUploading(true);

    try {
      const submitData = new FormData();
      submitData.append('file', selectedFile!);
      submitData.append('documentType', formData.documentType);
      submitData.append('category', formData.category);
      submitData.append('title', formData.title);
      submitData.append('description', formData.description);
      submitData.append('expirationDate', formData.expirationDate);
      submitData.append('isConfidential', formData.isConfidential.toString());
      submitData.append('tags', JSON.stringify(formData.tags));

      if (employeeId) {
        submitData.append('employeeId', employeeId);
      }

      await onSubmit(submitData);

      // Reset form
      setCurrentStep(1);
      setFormData({
        documentType: '',
        category: '',
        title: '',
        description: '',
        expirationDate: '',
        isConfidential: false,
        tags: []
      });
      setSelectedFile(null);

    } catch (error) {
      setErrors({
        submit: error instanceof Error ? error.message : 'Upload failed. Please try again.'
      });
    } finally {
      setUploading(false);
    }
  };

  const steps = [
    { number: 1, title: 'Document Type', description: 'Select document type and category' },
    { number: 2, title: 'File & Details', description: 'Upload file and add details' },
    { number: 3, title: 'Review & Submit', description: 'Review and submit your document' }
  ];

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle level={2}>Upload Document</CardTitle>

        {/* Progress Indicator */}
        <div className="mt-4">
          <nav aria-label="Progress" className="flex items-center justify-between">
            {steps.map((step, index) => (
              <div key={step.number} className="flex items-center">
                <div
                  className={cn(
                    'flex items-center justify-center w-8 h-8 rounded-full border-2 text-sm font-medium',
                    step.number <= currentStep
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'border-gray-300 text-gray-500'
                  )}
                  aria-current={step.number === currentStep ? 'step' : undefined}
                >
                  {step.number}
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={cn(
                      'w-16 h-1 mx-4',
                      step.number < currentStep ? 'bg-blue-600' : 'bg-gray-300'
                    )}
                    aria-hidden="true"
                  />
                )}
              </div>
            ))}
          </nav>
          <div className="mt-2 text-center">
            <p className="text-sm font-medium text-gray-900">
              {steps[currentStep - 1].title}
            </p>
            <p className="text-xs text-gray-500">
              {steps[currentStep - 1].description}
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Step 1: Document Type Selection */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Document Type *
                </label>
                <div className="grid grid-cols-1 gap-3">
                  {documentTypes.map((type) => (
                    <div key={type.value}>
                      <label className="relative flex items-start p-4 border rounded-lg cursor-pointer hover:bg-gray-50 focus-within:ring-2 focus-within:ring-blue-500">
                        <input
                          type="radio"
                          name="documentType"
                          value={type.value}
                          checked={formData.documentType === type.value}
                          onChange={(e) => setFormData({ ...formData, documentType: e.target.value })}
                          className="sr-only"
                        />
                        <div
                          className={cn(
                            'w-4 h-4 rounded-full border-2 mr-3 mt-0.5',
                            formData.documentType === type.value
                              ? 'border-blue-600 bg-blue-600'
                              : 'border-gray-300'
                          )}
                        >
                          {formData.documentType === type.value && (
                            <div className="w-2 h-2 rounded-full bg-white mx-auto mt-0.5" />
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="font-medium text-gray-900">{type.label}</div>
                          <div className="text-sm text-gray-500">{type.description}</div>
                        </div>
                      </label>
                    </div>
                  ))}
                </div>
                {errors.documentType && (
                  <p className="mt-2 text-sm text-red-600" role="alert">
                    {errors.documentType}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-2">
                  Category *
                </label>
                <select
                  id="category"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  aria-describedby="category-help"
                >
                  <option value="">Select a category</option>
                  {categories.map((category) => (
                    <option key={category.value} value={category.value}>
                      {category.label}
                    </option>
                  ))}
                </select>
                <p id="category-help" className="mt-1 text-sm text-gray-500">
                  Choose the category that best fits this document
                </p>
                {errors.category && (
                  <p className="mt-2 text-sm text-red-600" role="alert">
                    {errors.category}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Step 2: File Upload and Details */}
          {currentStep === 2 && (
            <div className="space-y-6">
              {/* File Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select File *
                </label>
                <div
                  className={cn(
                    'relative border-2 border-dashed rounded-lg p-6 text-center hover:border-gray-400 transition-colors',
                    dragActive ? 'border-blue-400 bg-blue-50' : 'border-gray-300',
                    selectedFile && 'border-green-400 bg-green-50'
                  )}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={acceptedFileTypes.join(',')}
                    onChange={(e) => handleFileSelect(e.target.files)}
                    className="sr-only"
                    id="file-upload"
                  />

                  {selectedFile ? (
                    <div className="space-y-2">
                      <svg className="mx-auto h-12 w-12 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div className="text-sm">
                        <p className="font-medium text-gray-900">{selectedFile.name}</p>
                        <p className="text-gray-500">
                          {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        Choose Different File
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                        <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <div className="text-sm">
                        <label htmlFor="file-upload" className="cursor-pointer">
                          <span className="font-medium text-blue-600 hover:text-blue-500">
                            Click to upload
                          </span>
                          <span className="text-gray-500"> or drag and drop</span>
                        </label>
                        <p className="text-gray-500">
                          {acceptedFileTypes.join(', ')} up to {(maxFileSize / 1024 / 1024)}MB
                        </p>
                      </div>
                    </div>
                  )}
                </div>
                {errors.file && (
                  <p className="mt-2 text-sm text-red-600" role="alert">
                    {errors.file}
                  </p>
                )}
              </div>

              <Input
                label="Document Title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                error={errors.title}
                required
                placeholder="Enter a descriptive title for this document"
                helpText="Use a clear, descriptive title that will help you find this document later"
              />

              <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Optional: Add any additional details about this document"
                />
              </div>

              <Input
                label="Expiration Date"
                type="date"
                value={formData.expirationDate}
                onChange={(e) => setFormData({ ...formData, expirationDate: e.target.value })}
                helpText="Leave blank if the document doesn't expire"
              />

              <div className="flex items-center">
                <input
                  id="isConfidential"
                  type="checkbox"
                  checked={formData.isConfidential}
                  onChange={(e) => setFormData({ ...formData, isConfidential: e.target.checked })}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="isConfidential" className="ml-2 block text-sm text-gray-900">
                  Mark as confidential
                </label>
                <Tooltip content="Confidential documents have restricted access and additional security measures">
                  <svg className="ml-1 h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </Tooltip>
              </div>

              {/* Tags */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tags
                </label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {formData.tags.map((tag, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag)}
                        className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full hover:bg-blue-200"
                        aria-label={`Remove ${tag} tag`}
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTag();
                      }
                    }}
                    placeholder="Add a tag"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                  <Button type="button" variant="outline" size="sm" onClick={handleAddTag}>
                    Add
                  </Button>
                </div>
                <p className="mt-1 text-sm text-gray-500">
                  Tags help organize and search for documents
                </p>
              </div>
            </div>
          )}

          {/* Step 3: Review */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-medium text-gray-900 mb-3">Review Your Document</h3>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-gray-600">Document Type:</dt>
                    <dd className="text-gray-900">
                      {documentTypes.find(t => t.value === formData.documentType)?.label}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-600">Category:</dt>
                    <dd className="text-gray-900">
                      {categories.find(c => c.value === formData.category)?.label}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-600">Title:</dt>
                    <dd className="text-gray-900">{formData.title}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-600">File:</dt>
                    <dd className="text-gray-900">{selectedFile?.name}</dd>
                  </div>
                  {formData.expirationDate && (
                    <div className="flex justify-between">
                      <dt className="text-gray-600">Expires:</dt>
                      <dd className="text-gray-900">{formData.expirationDate}</dd>
                    </div>
                  )}
                  {formData.isConfidential && (
                    <div className="flex justify-between">
                      <dt className="text-gray-600">Confidential:</dt>
                      <dd className="text-red-600">Yes</dd>
                    </div>
                  )}
                  {formData.tags.length > 0 && (
                    <div className="flex justify-between">
                      <dt className="text-gray-600">Tags:</dt>
                      <dd className="text-gray-900">{formData.tags.join(', ')}</dd>
                    </div>
                  )}
                </dl>
              </div>

              {errors.submit && (
                <div
                  role="alert"
                  className="p-3 bg-red-50 border border-red-200 rounded-md"
                >
                  <p className="text-sm text-red-600">{errors.submit}</p>
                </div>
              )}
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex justify-between pt-6 border-t border-gray-200">
            <div>
              {currentStep > 1 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleBack}
                  disabled={uploading}
                >
                  Back
                </Button>
              )}
            </div>

            <div>
              {currentStep < 3 ? (
                <Button
                  type="button"
                  onClick={handleNext}
                  disabled={uploading}
                >
                  Next
                </Button>
              ) : (
                <Button
                  type="submit"
                  loading={uploading}
                  disabled={uploading}
                >
                  {uploading ? 'Uploading...' : 'Upload Document'}
                </Button>
              )}
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

export { DocumentUploadForm };