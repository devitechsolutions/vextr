// Test the mapping function with raw VTiger data like Mohanrao's
const fs = require('fs');

// Create a test contact object based on the VTiger debug data we saw for Mohanrao
const testContact = {
  id: "12x6968",
  firstname: "Mohanrao",
  lastname: "Sattineni", 
  title: "Staff CPU Performance Architect",  // This should map to jobTitle
  email: "",
  cf_867: "Arm",  // This should map to company
  cf_883: "I have over 10 years of experience where I withheld a range of roles where I built expertise in breadth of electronics including digital design, verification, modelling, FPGA programming and applications.",  // profile_summary
  cf_919: "https://linkedin.com/in/mohanrao-sattineni-298a211b"  // linkedin_url
};

console.log("=== Testing Mapping Function ===");
console.log("Input contact:", JSON.stringify(testContact, null, 2));

// Test the extractFieldValue function manually
function testExtractFieldValue(contact, fieldNames) {
  console.log(`\n--- Testing field extraction for: [${fieldNames.join(', ')}] ---`);
  
  for (const fieldName of fieldNames) {
    const value = contact[fieldName];
    console.log(`  ${fieldName}: ${value} (${typeof value})`);
    
    // Test ValidationUtils.isEmpty logic
    const isEmpty = !value || (typeof value === 'string' && value.trim() === '');
    console.log(`    isEmpty: ${isEmpty}`);
    
    if (!isEmpty) {
      console.log(`    ✅ FOUND: ${fieldName} = "${value}"`);
      return value;
    }
  }
  
  console.log(`    ❌ NO VALUE FOUND`);
  return null;
}

// Test the field mappings we're having issues with
const FIELD_MAPPINGS = {
  firstName: ['firstName', 'firstname', 'first_name', 'fname'],
  lastName: ['lastName', 'lastname', 'last_name', 'lname', 'surname'],
  jobTitle: ['jobTitle', 'title', 'jobtitle', 'job_title', 'position', 'role'],
  company: ['company', 'cf_company', 'accountname', 'employer', 'organization', 'cf_867'],
  profileSummary: ['profileSummary', 'cf_profile_summary', 'profile_summary', 'cf_883', 'description', 'summary'],
  linkedinUrl: ['linkedinUrl', 'linkedin_url', 'linkedIn', 'cf_919']
};

console.log("\n=== FIELD MAPPING TESTS ===");

const firstName = testExtractFieldValue(testContact, FIELD_MAPPINGS.firstName);
const lastName = testExtractFieldValue(testContact, FIELD_MAPPINGS.lastName);  
const jobTitle = testExtractFieldValue(testContact, FIELD_MAPPINGS.jobTitle);
const company = testExtractFieldValue(testContact, FIELD_MAPPINGS.company);
const profileSummary = testExtractFieldValue(testContact, FIELD_MAPPINGS.profileSummary);
const linkedinUrl = testExtractFieldValue(testContact, FIELD_MAPPINGS.linkedinUrl);

console.log("\n=== FINAL RESULTS ===");
console.log({
  firstName,
  lastName,
  jobTitle,
  company,
  profileSummary: profileSummary ? profileSummary.substring(0, 50) + "..." : null,
  linkedinUrl
});