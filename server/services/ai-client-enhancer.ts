import OpenAI from "openai";
import fetch from "node-fetch";

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

export interface ClientEnhancementData {
  industry?: string;
  description?: string;
  website?: string;
  location?: string;
  logoUrl?: string;
  confidence: number;
  enhancedFields: string[];
}

export interface ClientNotification {
  id: string;
  type: 'missing_info' | 'enhancement_failed' | 'logo_missing';
  clientId: number;
  clientName: string;
  message: string;
  priority: 'low' | 'medium' | 'high';
  createdAt: Date;
  resolved: boolean;
}

class AIClientEnhancerService {
  private notifications: ClientNotification[] = [];

  async enhanceClientData(clientName: string, existingWebsite?: string): Promise<ClientEnhancementData> {
    try {
      if (!openai) {
        console.warn('OpenAI API key not configured. Client enhancement is unavailable.');
        return {
          confidence: 0,
          enhancedFields: []
        };
      }

      console.log(`🔍 Enhancing client data for: ${clientName}`);

      // First, try to enhance with AI
      const enhancedData = await this.getAIEnhancement(clientName, existingWebsite);
      
      // Then try to fetch logo
      const logoUrl = await this.fetchCompanyLogo(clientName, enhancedData.website || existingWebsite);
      
      return {
        ...enhancedData,
        logoUrl,
      };
    } catch (error) {
      console.error(`❌ Error enhancing client data for ${clientName}:`, error);
      
      // Create notification for failed enhancement
      this.addNotification({
        type: 'enhancement_failed',
        clientId: 0, // Will be set by caller
        clientName,
        message: `AI enhancement failed for ${clientName}. Please manually update client information.`,
        priority: 'medium',
      });
      
      return {
        confidence: 0,
        enhancedFields: [],
      };
    }
  }

  private async getAIEnhancement(clientName: string, website?: string): Promise<Omit<ClientEnhancementData, 'logoUrl'>> {
    const prompt = `
You are a business intelligence assistant. I need you to research and provide information about the company "${clientName}"${website ? ` (website: ${website})` : ''}.

Please provide the following information in JSON format:
{
  "industry": "Primary industry/sector (e.g., Data Centers, Cloud Computing, Telecommunications)",
  "description": "Brief 2-3 sentence description of what the company does",
  "website": "Company website URL if not provided or if you found a better one",
  "location": "Primary headquarters location (City, Country)",
  "confidence": "Your confidence level from 0-100 in the accuracy of this information",
  "enhancedFields": ["List of fields you provided/enhanced"]
}

Focus on:
- Accurate industry classification
- Professional business description
- Correct website if missing
- Main business location
- Only provide information you're confident about

If you cannot find reliable information about this company, return low confidence and minimal data.
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content: "You are a business research assistant. Provide accurate, professional information about companies. Always respond with valid JSON."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3, // Lower temperature for more factual responses
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("No response from AI service");
    }

    return JSON.parse(content);
  }

  private async fetchCompanyLogo(clientName: string, website?: string): Promise<string | undefined> {
    try {
      // Try multiple approaches to get the logo
      const logoUrls = await this.generateLogoUrls(clientName, website);
      
      for (const url of logoUrls) {
        try {
          const response = await fetch(url, { 
            method: 'HEAD',
            timeout: 5000,
          });
          
          if (response.ok && response.headers.get('content-type')?.startsWith('image/')) {
            console.log(`✅ Found logo for ${clientName}: ${url}`);
            return url;
          }
        } catch (logoError) {
          // Try next URL
          continue;
        }
      }
      
      console.log(`⚠️ No logo found for ${clientName}`);
      return undefined;
    } catch (error) {
      console.error(`❌ Error fetching logo for ${clientName}:`, error);
      return undefined;
    }
  }

  private async generateLogoUrls(clientName: string, website?: string): Promise<string[]> {
    const urls: string[] = [];
    
    if (website) {
      const domain = website.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
      
      // Common logo paths
      urls.push(
        `https://${domain}/logo.png`,
        `https://${domain}/logo.svg`,
        `https://${domain}/assets/logo.png`,
        `https://${domain}/assets/images/logo.png`,
        `https://${domain}/static/logo.png`,
        `https://${domain}/images/logo.png`,
        `https://www.${domain}/logo.png`,
        `https://www.${domain}/logo.svg`
      );
      
      // Favicon as fallback
      urls.push(
        `https://${domain}/favicon.ico`,
        `https://www.${domain}/favicon.ico`
      );
      
      // Google's favicon service
      urls.push(`https://www.google.com/s2/favicons?domain=${domain}&sz=128`);
    }
    
    // Clearbit Logo API (free tier)
    if (website) {
      const domain = website.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
      urls.push(`https://logo.clearbit.com/${domain}`);
    }
    
    return urls;
  }

  addNotification(notification: Omit<ClientNotification, 'id' | 'createdAt' | 'resolved'>): void {
    const newNotification: ClientNotification = {
      ...notification,
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date(),
      resolved: false,
    };
    
    this.notifications.unshift(newNotification);
    
    // Keep only last 100 notifications
    if (this.notifications.length > 100) {
      this.notifications = this.notifications.slice(0, 100);
    }
  }

  getNotifications(resolved = false): ClientNotification[] {
    return this.notifications.filter(n => n.resolved === resolved);
  }

  markNotificationResolved(id: string): boolean {
    const notification = this.notifications.find(n => n.id === id);
    if (notification) {
      notification.resolved = true;
      return true;
    }
    return false;
  }

  checkClientDataCompleteness(client: any): void {
    const missingFields: string[] = [];
    const requiredFields = {
      industry: 'Industry',
      location: 'Location',
      website: 'Website', 
      description: 'Description',
      contactName: 'Contact Person',
      contactEmail: 'Contact Email'
    };

    for (const [field, label] of Object.entries(requiredFields)) {
      if (!client[field] || client[field].trim() === '') {
        missingFields.push(label);
      }
    }

    if (missingFields.length > 0) {
      this.addNotification({
        type: 'missing_info',
        clientId: client.id,
        clientName: client.name,
        message: `${client.name} is missing: ${missingFields.join(', ')}. Please update client information.`,
        priority: missingFields.length > 3 ? 'high' : 'medium',
      });
    }
  }
}

export const aiClientEnhancer = new AIClientEnhancerService();