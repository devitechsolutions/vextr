import { Request, Response } from 'express';
import { createVtigerAPI } from '../client/src/lib/vtiger-api';

/**
 * Debug endpoint to show raw Vtiger contact data for field mapping
 */
export async function debugVtigerContact(req: Request, res: Response) {
  try {
    const { firstName, lastName } = req.query;
    
    if (!firstName || !lastName) {
      return res.status(400).json({ 
        error: "Please provide firstName and lastName query parameters" 
      });
    }

    console.log(`🔍 Searching for contact: ${firstName} ${lastName}`);
    
    // Create Vtiger API client
    const vtigerApi = createVtigerAPI(
      process.env.VTIGER_SERVER_URL || "",
      process.env.VTIGER_USERNAME || "",
      process.env.VTIGER_ACCESS_KEY || ""
    );
    
    await vtigerApi.login();
    
    // Search for the specific contact
    const searchQuery = `SELECT * FROM Contacts WHERE firstname='${firstName}' AND lastname='${lastName}' LIMIT 0, 1;`;
    const contacts = await vtigerApi.query(searchQuery);
    
    if (!contacts || contacts.length === 0) {
      return res.status(404).json({ 
        error: `Contact not found: ${firstName} ${lastName}` 
      });
    }

    const contact = contacts[0];
    
    // Extract all custom fields
    const customFields: Record<string, any> = {};
    const standardFields: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(contact)) {
      if (key.startsWith('cf_')) {
        customFields[key] = value;
      } else {
        standardFields[key] = value;
      }
    }
    
    console.log(`✅ Found contact data for ${firstName} ${lastName}`);
    console.log("Standard fields:", Object.keys(standardFields));
    console.log("Custom fields:", Object.keys(customFields));
    console.log("Custom fields with values:", Object.entries(customFields).filter(([_, value]) => value && value.trim()));
    
    return res.json({
      success: true,
      contact: {
        id: contact.id,
        firstName: contact.firstname,
        lastName: contact.lastname,
        standardFields,
        customFields,
        customFieldsWithValues: Object.entries(customFields)
          .filter(([_, value]) => value && value.trim())
          .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {})
      }
    });
    
  } catch (error) {
    console.error('Debug Vtiger contact error:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch contact data from Vtiger',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}