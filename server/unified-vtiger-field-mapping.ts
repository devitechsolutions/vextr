/**
 * Unified Vtiger Field Mapping Module
 * 
 * This module provides comprehensive field mapping between Vtiger CRM contact records
 * and the internal candidate database schema. It handles both standard Vtiger fields
 * and custom fields with priority-based mapping, data validation, and normalization.
 * 
 * Key features:
 * - Priority-based field mapping (tries multiple field names per target)
 * - Data validation and normalization (URLs, strings, trimming)
 * - Protection against overwriting good data with empty values
 * - Comprehensive support for all database schema fields
 * - Proper TypeScript typing
 */

import type { Candidate } from '@shared/schema';

/**
 * Interface for Vtiger contact data
 * This represents the structure we expect from Vtiger API responses
 */
interface VtigerContact {
  id?: string;
  vtigerId?: string;
  
  // Standard Vtiger fields
  firstname?: string;
  lastname?: string;
  title?: string;
  email?: string;
  phone?: string;
  description?: string;
  
  // Known custom fields with confirmed mappings
  cf_883?: string; // Profile Summary
  cf_885?: string; // Title Description  
  cf_919?: string; // LinkedIn URL
  
  // Other potential custom fields based on existing patterns
  cf_857?: string;
  cf_859?: string;
  cf_861?: string;
  cf_863?: string;
  cf_865?: string;
  cf_867?: string;
  cf_871?: string;
  cf_873?: string;
  cf_877?: string;
  cf_879?: string;
  cf_881?: string;
  cf_887?: string;
  cf_889?: string;
  cf_891?: string;
  cf_893?: string;
  cf_895?: string;
  cf_897?: string;
  cf_899?: string;
  cf_901?: string;
  cf_903?: string;
  cf_905?: string;
  cf_907?: string;
  cf_911?: string;
  cf_913?: string;
  cf_915?: string;
  cf_917?: string;
  cf_921?: string;
  cf_923?: string;
  cf_925?: string;
  cf_927?: string;
  cf_929?: string;
  
  // Additional fields that might exist
  [key: string]: any;
}

/**
 * Field mapping configuration for priority-based lookups
 * Each array contains field names in priority order (first match wins)
 * IMPORTANT: Pre-processed field names (camelCase) are checked FIRST, then raw Vtiger field names
 */
const FIELD_MAPPINGS = {
  // Standard personal information - check pre-processed names first, then raw Vtiger names
  firstName: ['firstName', 'firstname', 'first_name', 'fname'],
  lastName: ['lastName', 'lastname', 'last_name', 'lname', 'surname'],
  email: ['email', 'email1', 'primary_email', 'contact_email'],
  phone: ['phone', 'mobile', 'phone1', 'primary_phone', 'contact_phone'],
  
  // Job and title information - PRIORITIZE NAMED FIELDS FIRST for reliability
  jobTitle: ['jobTitle', 'title', 'jobtitle', 'job_title', 'position', 'role'],
  titleDescription: ['titleDescription', 'cf_title_description', 'title_description', 'cf_885'],
  profileSummary: ['profileSummary', 'cf_profile_summary', 'profile_summary', 'cf_883', 'description', 'summary'],
  
  // Company information - PRIORITIZE NAMED FIELDS FIRST for reliability
  company: ['company', 'cf_company', 'accountname', 'employer', 'organization', 'cf_867'],
  companyLocation: ['companyLocation', 'cf_company_location', 'company_location', 'company_address', 'cf_887'],
  branche: ['branche', 'cf_branche', 'industry', 'sector', 'field', 'cf_863'],
  
  // Location - PRIORITIZE NAMED FIELDS FIRST for reliability
  location: ['location', 'cf_location', 'city', 'address', 'geographic_location', 'cf_857'],
  
  // Experience and duration fields - PRIORITIZE NAMED FIELDS FIRST for reliability
  durationCurrentRole: ['durationCurrentRole', 'cf_duration_current_role', 'duration_current_role', 'current_role_duration', 'cf_889'],
  durationAtCompany: ['durationAtCompany', 'cf_duration_at_company', 'duration_at_company', 'company_duration', 'cf_891'],
  pastEmployer: ['pastEmployer', 'cf_past_employer', 'past_employer', 'previous_employer', 'former_employer', 'cf_893'],
  pastRoleTitle: ['pastRoleTitle', 'cf_past_role_title', 'past_role_title', 'previous_role', 'former_position', 'cf_897'],
  pastExperienceDuration: ['pastExperienceDuration', 'cf_past_experience_duration', 'past_experience_duration', 'previous_experience', 'cf_901'],
  
  // Salary and financial fields - PRIORITIZE NAMED FIELDS for reliability
  salaryRangeMin: ['salaryRangeMin', 'cf_salary_min', 'salary_range_min', 'min_salary', 'salary_min'],
  salaryRangeMax: ['salaryRangeMax', 'cf_salary_max', 'salary_range_max', 'max_salary', 'salary_max'], 
  salaryCurrency: ['salaryCurrency', 'cf_salary_currency', 'salary_currency', 'currency', 'salary_curr'],
  
  // Social and metadata - PRIORITIZE NAMED FIELDS FIRST for reliability
  linkedinUrl: ['linkedinUrl', 'cf_linkedin_url', 'linkedin_url', 'linkedin', 'social_linkedin', 'linkedin_profile', 'cf_919'],
  scrapedOn: ['scrapedOn', 'cf_scraped_on', 'scraped_on', 'scrape_date', 'extraction_date'],
};

/**
 * Utility functions for data validation and normalization
 */
const ValidationUtils = {
  /**
   * Check if a value is empty (null, undefined, empty string, or whitespace only)
   */
  isEmpty(value: any): boolean {
    return value == null || (typeof value === 'string' && value.trim() === '');
  },

  /**
   * Safely trim a string value
   */
  trimString(value: any): string | null {
    if (this.isEmpty(value)) return null;
    const trimmed = String(value).trim();
    return trimmed === '' ? null : trimmed;
  },

  /**
   * Validate and normalize a URL
   */
  normalizeUrl(value: any): string | null {
    if (this.isEmpty(value)) return null;
    
    let url = String(value).trim();
    
    // Handle LinkedIn URLs specifically
    if (url.includes('linkedin')) {
      // Remove any trailing parameters or anchors that might be invalid
      url = url.split('?')[0].split('#')[0];
      
      // Ensure it starts with http/https
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }
      
      // Basic LinkedIn URL validation
      if (url.match(/https?:\/\/(www\.)?linkedin\.com\/(in\/|pub\/|profile\/view)/)) {
        return url;
      }
    }
    
    // For other URLs, basic validation
    try {
      const urlObj = new URL(url.startsWith('http') ? url : 'https://' + url);
      return urlObj.toString();
    } catch {
      // If URL parsing fails, return null instead of invalid data
      return null;
    }
  },

  /**
   * Normalize a phone number (basic cleanup)
   */
  normalizePhone(value: any): string | null {
    if (this.isEmpty(value)) return null;
    
    const cleaned = String(value).trim()
      .replace(/[^\d+\-\s()]/g, '') // Keep only digits, +, -, spaces, parentheses
      .replace(/\s+/g, ' ') // Normalize multiple spaces to single space
      .trim();
    
    return cleaned === '' ? null : cleaned;
  }
};

/**
 * Priority-based field extraction
 * Tries multiple field names in priority order and returns the first non-empty value
 */
function extractFieldValue(contact: VtigerContact, fieldNames: string[]): string | null {
  for (const fieldName of fieldNames) {
    const value = contact[fieldName];
    if (!ValidationUtils.isEmpty(value)) {
      return ValidationUtils.trimString(value);
    }
  }
  return null;
}

/**
 * Authoritative field extraction for VTiger-first mode
 * Tries multiple field names in priority order and returns the first found value (even if empty)
 * This ensures VTiger data (including empty values) always overwrites database data
 */
function extractFieldValueAuthoritative(contact: VtigerContact, fieldNames: string[]): string | null {
  for (const fieldName of fieldNames) {
    if (contact.hasOwnProperty(fieldName)) {
      const value = contact[fieldName];
      return ValidationUtils.trimString(value);
    }
  }
  return null;
}

/**
 * Main mapping function that transforms Vtiger contact data to internal candidate format
 * Uses authoritative mapping for VTiger-first data integrity - VTiger data (including empty values) 
 * will overwrite existing database values to ensure data consistency.
 * 
 * @param contact - Vtiger contact object with various field formats
 * @returns Partial candidate object with authoritative VTiger data
 */
export function mapVtigerContactUnified(contact: VtigerContact): Partial<Candidate> {
  console.log('=== 🚀 UNIFIED MAPPING FUNCTION CALLED 🚀 ===');
  console.log('Contact ID:', contact?.vtigerId || contact?.id);
  console.log('Contact field values:', {
    firstName: contact?.firstName,
    lastName: contact?.lastName,
    jobTitle: contact?.jobTitle,
    email: contact?.email,
    allFields: Object.entries(contact || {}).slice(0, 10) // Show first 10 field-value pairs
  });
  
  if (!contact || typeof contact !== 'object') {
    console.warn('Invalid contact object provided to mapVtigerContactUnified');
    return {};
  }

  // Initialize the mapped candidate object
  const mappedCandidate: Partial<Candidate> = {};

  // Helper function to authoritatively set a field (VTiger-first mode)
  // This ensures VTiger data (including null/empty values) always overwrites database data
  const authoritativeSet = (field: keyof Candidate, value: any) => {
    (mappedCandidate as any)[field] = value;
  };

  // Helper function to safely set a field only if it has a value (used for optional fields)
  const safeSet = (field: keyof Candidate, value: any) => {
    if (!ValidationUtils.isEmpty(value)) {
      (mappedCandidate as any)[field] = value;
    }
  };

  // Map standard personal information fields (authoritative - VTiger should always overwrite these core identity fields)
  authoritativeSet('firstName', extractFieldValueAuthoritative(contact, FIELD_MAPPINGS.firstName));
  authoritativeSet('lastName', extractFieldValueAuthoritative(contact, FIELD_MAPPINGS.lastName));
  authoritativeSet('email', extractFieldValueAuthoritative(contact, FIELD_MAPPINGS.email));
  
  // Map and normalize phone (authoritative - VTiger should overwrite incorrect phone numbers)
  const phoneValue = extractFieldValueAuthoritative(contact, FIELD_MAPPINGS.phone);
  authoritativeSet('phone', phoneValue ? ValidationUtils.normalizePhone(phoneValue) : null);

  // Map job title (authoritative - VTiger should overwrite job titles)
  const jobTitleValue = extractFieldValueAuthoritative(contact, FIELD_MAPPINGS.jobTitle);
  authoritativeSet('jobTitle', jobTitleValue);
  authoritativeSet('currentTitle', jobTitleValue);

  // Map rich profile fields (authoritative - VTiger should always overwrite these)
  authoritativeSet('titleDescription', extractFieldValueAuthoritative(contact, FIELD_MAPPINGS.titleDescription));
  authoritativeSet('profileSummary', extractFieldValueAuthoritative(contact, FIELD_MAPPINGS.profileSummary));

  // Map company information (authoritative - VTiger should overwrite company data)
  authoritativeSet('company', extractFieldValueAuthoritative(contact, FIELD_MAPPINGS.company));
  authoritativeSet('companyLocation', extractFieldValueAuthoritative(contact, FIELD_MAPPINGS.companyLocation));
  authoritativeSet('branche', extractFieldValueAuthoritative(contact, FIELD_MAPPINGS.branche));

  // Map location (authoritative - VTiger should overwrite location data)
  authoritativeSet('location', extractFieldValueAuthoritative(contact, FIELD_MAPPINGS.location));

  // Map experience and duration fields (authoritative - VTiger should overwrite experience data)
  authoritativeSet('durationCurrentRole', extractFieldValueAuthoritative(contact, FIELD_MAPPINGS.durationCurrentRole));
  authoritativeSet('durationAtCompany', extractFieldValueAuthoritative(contact, FIELD_MAPPINGS.durationAtCompany));
  authoritativeSet('pastEmployer', extractFieldValueAuthoritative(contact, FIELD_MAPPINGS.pastEmployer));
  authoritativeSet('pastRoleTitle', extractFieldValueAuthoritative(contact, FIELD_MAPPINGS.pastRoleTitle));
  authoritativeSet('pastExperienceDuration', extractFieldValueAuthoritative(contact, FIELD_MAPPINGS.pastExperienceDuration));

  // Map salary and financial fields
  const salaryMinValue = extractFieldValue(contact, FIELD_MAPPINGS.salaryRangeMin);
  if (salaryMinValue) {
    const parsedMin = parseInt(salaryMinValue.replace(/[^\d]/g, ''), 10);
    if (!isNaN(parsedMin)) {
      safeSet('salaryRangeMin', parsedMin);
    }
  }
  
  const salaryMaxValue = extractFieldValue(contact, FIELD_MAPPINGS.salaryRangeMax);
  if (salaryMaxValue) {
    const parsedMax = parseInt(salaryMaxValue.replace(/[^\d]/g, ''), 10);
    if (!isNaN(parsedMax)) {
      safeSet('salaryRangeMax', parsedMax);
    }
  }
  
  safeSet('salaryCurrency', extractFieldValue(contact, FIELD_MAPPINGS.salaryCurrency));

  // Map and validate LinkedIn URL (authoritative - VTiger should overwrite LinkedIn URLs)
  const linkedinValue = extractFieldValueAuthoritative(contact, FIELD_MAPPINGS.linkedinUrl);
  const normalizedUrl = linkedinValue ? ValidationUtils.normalizeUrl(linkedinValue) : null;
  authoritativeSet('linkedinUrl', normalizedUrl);

  // Map metadata (authoritative - VTiger should overwrite metadata)
  authoritativeSet('scrapedOn', extractFieldValueAuthoritative(contact, FIELD_MAPPINGS.scrapedOn));

  // Set Vtiger ID for tracking
  const vtigerIdValue = contact.vtigerId || contact.id;
  if (vtigerIdValue) {
    safeSet('vtigerId', ValidationUtils.trimString(vtigerIdValue));
  }

  // Set source
  safeSet('source', 'Vtiger CRM');

  // Debug logging for mapping validation
  console.log(`🔍 FIELD MAPPING DEBUG for Contact ${vtigerIdValue}:`, {
    inputFields: Object.keys(contact),
    mappedFields: Object.keys(mappedCandidate),
    standardFields: {
      firstName: mappedCandidate.firstName,
      lastName: mappedCandidate.lastName,
      jobTitle: mappedCandidate.jobTitle,
      email: mappedCandidate.email
    },
    customFields: {
      titleDescription: mappedCandidate.titleDescription,
      profileSummary: mappedCandidate.profileSummary,
      linkedinUrl: mappedCandidate.linkedinUrl
    },
    companyFields: {
      company: mappedCandidate.company,
      branche: mappedCandidate.branche,
      location: mappedCandidate.location
    }
  });

  return mappedCandidate;
}

/**
 * Export additional utilities for external use if needed
 */
export { ValidationUtils, FIELD_MAPPINGS };

/**
 * Type export for the function signature
 */
export type VtigerContactMappingFunction = typeof mapVtigerContactUnified;