import OpenAI from "openai";
import multer from "multer";
import { Router, Request, Response } from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
// PDF parsing via OpenAI vision API for maximum reliability
import pdf2pic from "pdf2pic";
import mammoth from "mammoth";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Configure multer for CV file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), "uploads/cvs");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + crypto.randomBytes(6).toString("hex");
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    // Accept PDF, DOC, DOCX files
    const allowedTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain"
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF, DOC, DOCX, and TXT files are allowed"));
    }
  }
});

export const cvParserRouter = Router();

/**
 * Extract text content from uploaded CV file
 */
async function extractTextFromFile(filePath: string, mimeType: string): Promise<string> {
  try {
    console.log(`Extracting text from: ${filePath}, MIME type: ${mimeType}`);
    
    // File size check (5MB limit)
    const stats = fs.statSync(filePath);
    const maxSize = 5 * 1024 * 1024; // 5MB in bytes
    
    if (stats.size > maxSize) {
      throw new Error("File is too large. Please upload a smaller CV (max 5MB).");
    }
    
    // Handle different file types with proper extraction
    if (mimeType === "application/pdf") {
      try {
        console.log("Converting PDF to images for OpenAI vision analysis");
        
        // Convert PDF to images and save to temp directory
        const tempDir = path.join(path.dirname(filePath), "temp");
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
        
        const convert = pdf2pic.fromPath(filePath, {
          density: 150, // Increased for better text legibility (was 72)
          saveFilename: "page",
          savePath: tempDir,
          format: "png", // PNG for lossless quality - critical for OCR/text extraction
          width: 2000, // Increased width for better quality (was 1024)
          // Removed height to maintain aspect ratio - prevents distortion/cropping
        });

        // Convert all pages of the PDF
        console.log("Attempting to convert all pages...");
        let results;
        try {
          results = await convert.bulk(-1); // Convert all pages
        } catch (bulkError) {
          console.log("Bulk conversion failed, trying page by page...");
          results = [];
          // Try converting pages one by one
          for (let pageNum = 1; pageNum <= 12; pageNum++) { // Max 12 pages
            try {
              const pageResult = await convert(pageNum);
              results.push(pageResult);
              console.log(`Successfully converted page ${pageNum}`);
            } catch (pageError) {
              console.log(`No more pages found at page ${pageNum}`);
              break;
            }
          }
        }
        
        if (!results || results.length === 0) {
          throw new Error("Failed to convert PDF to images");
        }

        console.log(`Successfully converted PDF to ${results.length} images`);
        
        // Process all pages and extract text from each
        let allExtractedText = "";
        const imagePaths: string[] = [];
        
        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          if (!result.path) {
            console.warn(`Failed to convert page ${i + 1} of PDF`);
            continue;
          }
          
          imagePaths.push(result.path);
          
          // Read the converted image file
          const imageBuffer = fs.readFileSync(result.path);
          const base64Image = imageBuffer.toString('base64');
          
          console.log(`Analyzing page ${i + 1} with OpenAI vision API`);
          
          const response = await openai.chat.completions.create({
            model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: `Extract ALL text content from this CV/resume page ${i + 1}. 

CRITICAL REQUIREMENTS:
- Extract EVERY piece of text visible on the page, including:
  * Full name (typically at the top)
  * Contact information (email, phone, address, LinkedIn, etc.)
  * Professional title/headline
  * All section headers (Education, Work Experience, Skills, etc.)
  * ALL job titles, company names, and dates
  * ALL education entries with degrees, institutions, and dates
  * ALL skills, certifications, languages
  * ALL text in headers, footers, margins, and sidebars
  * Do NOT skip any text regardless of font size or position

- Maintain the reading order as it appears on the page
- Include dates, locations, and all details
- Return ONLY the extracted text without formatting, analysis, or comments
- If text appears in columns, extract left-to-right, top-to-bottom
- Be thorough - missing information will cause parsing failures`
                  },
                  {
                    type: "image_url", 
                    image_url: {
                      url: `data:image/png;base64,${base64Image}`
                    }
                  }
                ]
              }
            ],
            max_tokens: 4000,
            temperature: 0
          });

          const pageText = response.choices[0].message.content;
          if (pageText && pageText.trim()) {
            allExtractedText += `\n\n=== PAGE ${i + 1} ===\n${pageText}`;
            console.log(`Extracted ${pageText.length} characters from page ${i + 1}`);
          } else {
            console.log(`No text extracted from page ${i + 1}`);
          }
        }

        // Clean up temporary files
        try {
          for (const imagePath of imagePaths) {
            fs.unlinkSync(imagePath);
          }
          fs.rmdirSync(tempDir, { recursive: true });
        } catch (cleanupError) {
          console.warn("Could not clean up temp files:", cleanupError);
        }

        const extractedText = allExtractedText;
        
        if (!extractedText || !extractedText.trim()) {
          throw new Error("Could not extract text from PDF using OpenAI vision API.");
        }
        
        console.log(`Final extracted text length: ${extractedText.length} characters from ${results.length} pages`);
        console.log("=== EXTRACTED TEXT FROM ALL PAGES ===");
        console.log(extractedText);
        console.log("=== END EXTRACTED TEXT ===");
        return extractedText.trim();
        
      } catch (pdfError) {
        console.error("PDF parsing error:", pdfError);
        throw new Error("Failed to parse PDF file. Please ensure the file is readable and not corrupted.");
      }
      
    } else if (mimeType === "text/plain") {
      // Simple text file
      const plainText = fs.readFileSync(filePath, 'utf-8');
      console.log(`Read ${plainText.length} characters from text file`);
      return plainText;
      
    } else if (mimeType === "application/msword" || 
               mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      
      // For Word documents, use mammoth for proper text extraction
      try {
        const result = await mammoth.extractRawText({ path: filePath });
        const extractedText = result.value;
        
        console.log(`Extracted ${extractedText.length} characters from Word document via mammoth`);
        
        if (!extractedText.trim()) {
          throw new Error("Could not extract readable text from Word document");
        }
        
        console.log("=== EXTRACTED TEXT FROM DOCX ===");
        console.log(extractedText);
        console.log("=== END EXTRACTED TEXT ===");
        
        return extractedText;
      } catch (docxError) {
        console.error("DOCX parsing error:", docxError);
        throw new Error("Failed to parse Word document. Please ensure the file is not corrupted.");
      }
      
    } else {
      throw new Error("Unsupported file type. Please upload PDF, DOC, DOCX, or TXT files.");
    }
    
  } catch (error) {
    console.error("Error extracting text from file:", error);
    throw new Error(`Unable to extract text from the uploaded file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Parse CV content using OpenAI - Enhanced with structured output
 */
async function parseCV(textContent: string): Promise<any> {
  try {
    // Process the entire document content (all pages)
    // With 15k max tokens, we can handle much larger documents
    const fullContent = textContent;
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content: `You are processing a CV upload (PDF, DOC, DOCX, or TXT) for a candidate. Your job is to accurately extract and format the candidate's information and detect the language to populate a form with the following fields:

⸻

✳️ Form Fields to Fill
        •       First Name
        •       Last Name
        •       Current Title
        •       Email
        •       Phone
        •       Location
        •       Professional Summary
        •       Skills
        •       Work Experience
        •       Education
        •       Courses & Certifications

⸻

🔍 Extraction Instructions

1. Name Handling
        •       If the full name is provided (e.g. "Nils Dekker"), split it into:
        •       First Name: "Nils"
        •       Last Name: "Dekker"

2. Work Experience

CRITICAL: Extract ALL work experience entries from the CV, not just the most recent. For each role:
        •       Job Title
        •       Company Name (include secondment agency if applicable)
        •       Date Range (e.g. "April 2023 – Present")
        •       3–8 bullet points describing responsibilities, tools used, and outcomes

Format each job entry as a clearly separated section with line breaks and bullet points:

Job Title
Company Name
Date Range
• Responsibility 1
• Responsibility 2
• Responsibility 3

Next Job Title
Next Company Name
Next Date Range
• Responsibility 1
• Responsibility 2

Include ALL positions mentioned in the CV, even if briefly described.

3. Skills - TECHNICAL EXPERTISE EXTRACTION

CRITICAL: Extract ALL technical skills and expertise from the following sections:
        •       EXPERTISE sections (titled "EXPERTISE", "Technical Skills", "Competences", "Tech Stack", "Technical Competencies", "Core Skills", "Technical Proficiencies")
        •       Skills sections that contain technical items
        •       Professional competencies mentioned in experience descriptions
        •       Software, tools, platforms, technologies, frameworks mentioned throughout the CV
        •       Technical methodologies and processes (e.g., "Agile", "SCRUM", "DevOps")

IMPORTANT - LANGUAGE SEPARATION RULE:
        •       DO NOT include human languages (English, French, Turkish, Dutch, German, Spanish, etc.) in the Skills array
        •       Languages belong ONLY in the separate Languages section (section 8)
        •       Focus ONLY on technical skills, software, tools, platforms, and professional competencies

Examples of what TO INCLUDE in Skills:
["AWS Cloud computing", "Linux (different versions)", "SCCM", "SLA Ticketing system", "Python", "Java", "Docker", "Kubernetes", "Project Management", "Data Analysis", "Network Administration"]

Examples of what NOT to include in Skills (these go to Languages section):
["English", "French", "Turkish", "Dutch", "German", "Spanish", "Italian", "Arabic"]

Return as an array of strings, ensuring each skill is a distinct technical competency.

4. Professional Summary

Generate a concise, 3–5 sentence profile that summarizes the candidate's:
        •       Domain expertise
        •       Career level (e.g., mid/senior)
        •       Sector experience (e.g., fintech, cybersecurity)
        •       Distinguishing strengths or tools

⚠️ CRITICAL LANGUAGE PRESERVATION REQUIREMENTS - APPLIES TO ALL FIELDS:
- DETECT the language of the CV content (Dutch or English) 
- PRESERVE the exact same language throughout the ENTIRE extraction
- If the CV content is in Dutch → ALL output text MUST be in Dutch (professional summary, work responsibilities, education descriptions, course descriptions, etc.)
- If the CV content is in English → ALL output text MUST be in English
- DO NOT translate any content - keep the original language intact
- This applies to: professional_summary, all work_experience responsibilities, education details, course descriptions
- ONLY exception: Language names and proficiency levels are ALWAYS in English (e.g., Dutch, English, Fluent, Native)

5. Education

Include all degrees. For each, extract:
        •       Degree Name
        •       Institution
        •       Graduation year or duration (if available)

6. Courses & Certifications

Include all professional courses, certifications, training programs, and continuing education. For each, extract:
        •       Course/Certification Name - ONLY the actual course/certification title (e.g., "AccessData FTK Bootcamp", "CCNA Routing and Switching")
        •       Institution/Provider - The organization that provided the training
        •       Completion Date (year or full date)
        •       Certificate Number (if available)
        •       Description - SEPARATE field for detailed descriptions, training methods, topics covered, etc.

IMPORTANT: Do NOT put descriptions or training details in the Course Name field. Keep course names concise and descriptive titles only.

7. Contact Information
        •       Prefer personal email and phone number
        •       Exclude recruiter/agency contact details

8. Language Skills Extraction - CRITICAL REQUIREMENT
        •       Extract ALL languages mentioned ANYWHERE in the CV document
        •       Look for sections titled: "Languages", "Talen", "Sprachen", "Language Skills", "Taalvaardigheden"
        •       Search for specific language patterns:
            - Nederlands/Dutch + any proficiency (Moedertaal, Native, Fluent, etc.)
            - Engels/English + any proficiency (Vaardig, Fluent, Advanced, etc.)
            - Duits/German + any proficiency (Gevorderd, Intermediate, Basic, etc.)
            - Frans/French + any proficiency
            - Spaans/Spanish + any proficiency  
            - Italiaans/Italian + any proficiency
            - Any other language names with proficiency indicators
        •       STANDARDIZED OUTPUT - ALWAYS use English terms for consistency:
            - Language names: ALWAYS use English names (Dutch, English, German, French, Spanish, etc.)
            - Proficiency levels: ALWAYS use English levels: "Beginner", "Intermediate", "Fluent", "Native"
        •       PROFICIENCY MAPPING RULES:
            - Native/Moedertaal/Mother tongue → "Native"
            - Fluent/Vloeiend/Gevorderd → "Fluent" 
            - Intermediate/Gemiddeld/Goed → "Intermediate"
            - Basic/Beginner/Basis → "Beginner"
            - Fluent/Vloeiend/Advanced/Proficient/Vaardig → "Fluent"
            - Intermediate/Gemiddeld/Good/Conversational → "Intermediate"
            - Basic/Beginner/Elementary/Limited → "Beginner"
        •       If languages are found but no proficiency is specified, use "Intermediate" as default
        •       NEVER return empty languages array if ANY language mention is found in the CV

9. Language Detection
        •       Detect if the CV TEXT CONTENT is primarily written in Dutch or English
        •       Look at the actual language used in job descriptions, summaries, education details, etc.
        •       Ignore Dutch/English company names, locations, and nationality - focus on the WRITING LANGUAGE
        •       Return "dutch" ONLY if the CV text itself is written in Dutch language (job descriptions, summaries in Dutch)
        •       Return "english" if the CV text is written in English (even if it mentions Dutch companies/locations)
        •       Example: A CV with "Dutch National Police" but English job descriptions = "english"
        •       Only Dutch and English are supported; other languages default to English

CRITICAL EXTRACTION REQUIREMENTS:
- ALWAYS extract name, email, phone, location even if the CV is in Dutch or any other language
- For Dutch CVs, look for terms like "naam", "e-mail", "telefoon", "locatie", "adres", "woonplaats"
- For education, look for "opleiding", "onderwijs", "studie", "universiteit", "hogeschool", "diploma"
- LANGUAGE EXTRACTION - MANDATORY: Extract ALL languages mentioned anywhere in the CV, including:
  * Explicit language sections (Languages, Talen, Sprachen, etc.)
  * Skills sections that mention languages
  * Text that mentions language proficiency (e.g., "fluent in Spanish", "spreekt vloeiend Duits")
  * Any mention of language capabilities throughout the document
  * Even if just language names appear without proficiency, extract them with "Intermediate" as default
  * CRITICAL: At minimum, extract the native language (Dutch for Dutch CVs, English for English CVs)
  * If NO explicit languages found, infer from CV content (Dutch CV = Dutch as Native, English CV = English as Native)
- Extract ALL information regardless of language - do not leave basic fields empty

⸻

🧾 Output Formatting Rules (for clean UI display)
        •       Use line breaks between each job in "Work Experience"
        •       Use bullet points or dashes for skills and job duties
        •       Avoid long paragraphs or comma-separated lists
        •       Use proper casing and punctuation

⸻

IMPORTANT: Return ONLY valid JSON in this exact format:
{
  "first_name": "string",
  "last_name": "string", 
  "current_title": "string",
  "email": "string",
  "phone": "string",
  "location": "string",
  "professional_summary": "string",
  "skills": ["array", "of", "individual", "skills"],
  "work_experience": [
    {
      "title": "Job Title",
      "company": "Company Name",
      "dates": "Start Date - End Date",
      "responsibilities": ["Responsibility 1", "Responsibility 2", "Responsibility 3"]
    }
  ],
  "education": [
    {
      "degree": "Degree Name",
      "institution": "Institution Name",
      "dates": "Start Year - End Year"
    }
  ],
  "courses": [
    {
      "courseName": "AccessData FTK Bootcamp",
      "institution": "AccessData Training Center",
      "completionDate": "2016",
      "certificateNumber": "",
      "description": "Digital Forensics Training on research and use of the FTK software."
    }
  ],
  "languages": [
    {
      "language": "Language Name (ALWAYS use English names regardless of CV language: Dutch, English, German, French, Spanish, etc.)",
      "proficiency": "Proficiency Level - ONLY use these 4 levels: ALWAYS use English terms: Beginner, Intermediate, Fluent, Native. Map any other terms to the closest match."
    }
  ],
  "detected_language": "english or dutch"
}

If any field cannot be determined from the CV, use an empty string "" for strings or empty array [] for arrays.`
        },
        {
          role: "user", 
          content: `Extract information from the following CV text and format it according to the instructions above.

CRITICAL REQUIREMENTS:
1. ALWAYS extract first_name and last_name - look carefully throughout the CV document
2. ALWAYS extract email and phone if present - check headers, footers, contact sections
3. ALWAYS extract location/address information if available
4. For work experience, extract ALL jobs mentioned in the CV, not just the most recent one
5. For education, extract ALL degrees, certifications, and educational background
6. EXPERTISE → SKILLS MAPPING - MANDATORY:
   - Extract ALL items from EXPERTISE sections (titled "EXPERTISE", "Technical Skills", "Competences", "Tech Stack") into the Skills array
   - Include technical tools, software, platforms, methodologies from these sections
   - Focus on technical competencies like "AWS Cloud computing", "Linux (different versions)", "SCCM", "SLA Ticketing system"
7. STRICT LANGUAGE vs SKILLS SEPARATION - CRITICAL:
   - NEVER include human languages in the Skills array
   - Skills array = ONLY technical skills, software, tools, platforms, methodologies
   - Languages array = ONLY human languages (English, French, Turkish, Dutch, German, Spanish, etc.)
   - If you find "English", "French", "Turkish" in any section → put in Languages array, NOT Skills array
   - Example: "English" goes to Languages with proficiency level, NOT to Skills
8. LANGUAGE STANDARDIZATION:
   - ALWAYS use English language names: Dutch, English, German, French, Spanish, etc.
   - ALWAYS use English proficiency levels: Beginner, Intermediate, Fluent, Native
   - ⚠️ CRITICAL: ALL extracted text (professional summary, work responsibilities, education, courses) MUST match the source CV language
   - If CV is in Dutch → output in Dutch; if CV is in English → output in English
   - DO NOT translate content - preserve the original language across ALL fields
   - Language names and proficiency levels are the ONLY fields always in English
9. COMPREHENSIVE LANGUAGE EXTRACTION - MANDATORY:
   - Scan the ENTIRE CV for any mention of languages, not just dedicated language sections
   - Look for phrases like "speaks fluent German", "native Dutch speaker", "intermediate Spanish", etc.
   - Extract ALL languages found, even if mentioned briefly or in different sections
   - Don't miss languages mentioned in skills, experience descriptions, or education sections
   - FALLBACK RULE: If no explicit languages found, infer from document language:
     * Dutch CV detected → Add "Dutch" with "Native" proficiency
     * English CV detected → Add "English" with "Native" proficiency
   - PROFICIENCY STANDARDIZATION: Always map extracted proficiency levels to the 4 standard levels:
     * ALWAYS use: Beginner, Intermediate, Fluent, Native
   - NEVER return empty languages array - always extract at least the document's primary language

CV TEXT:
${fullContent}

Please return the extracted information in the specified JSON format with complete personal details, work experience history, and education background.`
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0, // ZERO temperature for consistency
      max_tokens: 16000
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    console.log("=== OPENAI PARSE RESULT ===");
    console.log(JSON.stringify(result, null, 2));
    console.log("===========================");
    return result;
  } catch (error) {
    console.error("Error parsing CV with OpenAI:", error);
    throw new Error("Failed to parse CV content. Please ensure the file contains readable text and try again.");
  }
}

/**
 * Upload and parse CV file endpoint
 */
cvParserRouter.post("/upload-and-parse", upload.single("cv"), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const { path: filePath, mimetype, originalname } = req.file;

    // Store the original CV in object storage
    let cvUrl = null;
    try {
      const { ObjectStorageService } = await import("./objectStorage");
      const objectStorageService = new ObjectStorageService();
      
      // Get upload URL for object storage
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      
      // Read the file and upload to object storage
      const fileBuffer = fs.readFileSync(filePath);
      const uploadResult = await fetch(uploadURL, {
        method: 'PUT',
        body: fileBuffer,
        headers: {
          'Content-Type': mimetype,
        },
      });
      
      if (uploadResult.ok) {
        cvUrl = objectStorageService.normalizeObjectEntityPath(uploadURL.split('?')[0]);
        console.log('Successfully stored original CV in object storage:', cvUrl);
      }
    } catch (storageError) {
      console.error('Failed to store CV in object storage:', storageError);
      // Continue with parsing even if storage fails
    }

    // Extract text from the uploaded file
    const textContent = await extractTextFromFile(filePath, mimetype);
    
    if (!textContent.trim()) {
      return res.status(400).json({ error: "Could not extract text from the uploaded file" });
    }

    // Parse the CV content using OpenAI
    console.log("=== EXTRACTED TEXT FROM YOUR CV ===");
    console.log(textContent);
    console.log("=== END EXTRACTED TEXT ===");
    
    const parsedData = await parseCV(textContent);
    console.log("=== PARSED RESULT ===");
    console.log(JSON.stringify(parsedData, null, 2));
    console.log("=== END PARSED RESULT ===");
    
    // Clean up the uploaded file
    fs.unlinkSync(filePath);

    res.json({
      success: true,
      data: parsedData,
      cvUrl: cvUrl // Include the CV URL in response
    });

  } catch (error) {
    console.error("CV parsing error:", error);
    
    // Clean up file if it exists
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {}
    }

    res.status(500).json({ 
      error: "Failed to parse CV", 
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

/**
 * Get language-specific labels for CV sections
 */
function getLanguageLabels(language: string) {
  const labels = {
    dutch: {
      skills: 'Vaardigheden',
      workExperience: 'Werkervaring',
      education: 'Opleiding',
      courses: 'Cursussen & Certificaten',
      languages: 'Talen',
      contact: 'Contact',
      professional_summary: 'Professionele samenvatting',
      notice_period: 'Opzegtermijn',
      detected_language: 'dutch'
    },
    english: {
      skills: 'Skills',
      workExperience: 'Work Experience', 
      education: 'Education',
      courses: 'Courses & Certifications',
      languages: 'Languages',
      contact: 'Contact',
      professional_summary: 'Professional Summary',
      notice_period: 'Notice Period',
      detected_language: 'english'
    }
  };
  
  return language === 'dutch' ? labels.dutch : labels.english;
}

/**
 * Generate PDF from CV data
 */
cvParserRouter.post("/generate-pdf", async (req: Request, res: Response) => {
  try {
    const cvData = req.body;
    
    // Validate required fields
    if (!cvData.firstName || !cvData.lastName) {
      return res.status(400).json({ error: "First name and last name are required" });
    }

    // Get language-specific labels
    const detectedLanguage = cvData.detected_language || cvData.detectedLanguage || 'english';
    const labels = getLanguageLabels(detectedLanguage);

    // Import jsPDF and fs
    const { jsPDF } = await import('jspdf');
    const fs = await import('fs');
    const path = await import('path');
    
    // Create new PDF document with compression
    const doc = new jsPDF({
      compress: true, // Enable compression to reduce file size
      precision: 2    // Reduce precision for smaller file size
    });
    
    // Set font and colors
    const primaryColor = cvData.primaryColor || '#2563EB';
    const textColor = '#1f2937';
    
    // Helper function to convert hex to RGB
    const hexToRgb = (hex: string) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      } : { r: 37, g: 99, b: 235 };
    };

    const primaryRgb = hexToRgb(primaryColor);
    
    // Load and add DC People logo
    let logoBase64 = '';
    try {
      const logoPath = path.join(process.cwd(), 'attached_assets', 'DC People Image_1753449062638.png');
      console.log('Loading logo from:', logoPath);
      const logoBuffer = fs.readFileSync(logoPath);
      logoBase64 = logoBuffer.toString('base64');
      console.log('Logo loaded successfully, base64 length:', logoBase64.length);
      
      // Add DC People logo at the top right (2.5x bigger)
      doc.addImage(`data:image/png;base64,${logoBase64}`, 'PNG', 145, 5, 37.5, 20);
    } catch (logoError) {
      console.error('Error loading logo:', logoError);
      console.error('Logo path attempted:', path.join(process.cwd(), 'attached_assets', 'DC People Image_1753449062638.png'));
      // Fallback to text only
      doc.setFontSize(12);
      doc.setTextColor(primaryRgb.r, primaryRgb.g, primaryRgb.b);
      doc.text('DC PEOPLE', 140, 15);
    }
    
    let yPosition = 20;
    
    // Header with name and title
    doc.setFontSize(24);
    doc.setTextColor(primaryRgb.r, primaryRgb.g, primaryRgb.b);
    doc.text(`${cvData.firstName} ${cvData.lastName}`, 20, yPosition);
    yPosition += 10;
    
    doc.setFontSize(16);
    doc.setTextColor(100, 100, 100);
    doc.text(cvData.currentTitle || '', 20, yPosition);
    yPosition += 10;
    
    // Location (always shown if available)
    if (cvData.location) {
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text(cvData.location, 20, yPosition);
      yPosition += 10;
    }
    
    // Contact information (conditionally included)
    if (cvData.includeContactInfo) {
      doc.setFontSize(10);
      doc.setTextColor(60, 60, 60);
      const contactInfo = [];
      if (cvData.email) contactInfo.push(cvData.email);
      if (cvData.phone) contactInfo.push(cvData.phone);
      doc.text(contactInfo.join(' | '), 20, yPosition);
      yPosition += 10;
    }
    
    yPosition += 5; // Add some spacing after header section
    
    // Professional Summary
    if (cvData.professionalSummary || cvData.professional_summary) {
      doc.setFontSize(14);
      doc.setTextColor(primaryRgb.r, primaryRgb.g, primaryRgb.b);
      doc.text(labels.professional_summary, 20, yPosition);
      yPosition += 8;
      
      doc.setFontSize(10);
      doc.setTextColor(60, 60, 60);
      const summaryText = cvData.professionalSummary || cvData.professional_summary;
      const summaryLines = doc.splitTextToSize(summaryText, 170);
      doc.text(summaryLines, 20, yPosition);
      yPosition += (summaryLines.length * 5) + 10;
      
      // Check if we need a new page after summary
      if (yPosition > 220) {
        doc.addPage();
        yPosition = 20;
      }
    }
    
    // Skills - Pill Style
    if (cvData.skills && cvData.skills.length > 0) {
      doc.setFontSize(14);
      doc.setTextColor(primaryRgb.r, primaryRgb.g, primaryRgb.b);
      doc.text(labels.skills, 20, yPosition);
      yPosition += 8;
      
      // Draw skills as pills
      const validSkills = cvData.skills.filter((skill: string) => skill.trim());
      let xPosition = 20;
      let currentRow = yPosition;
      const pillHeight = 6;
      const pillPadding = 3;
      const rowSpacing = 10;
      const maxWidth = 170;
      
      doc.setFontSize(9);
      validSkills.forEach((skill: string, index: number) => {
        const skillText = skill.trim();
        const textWidth = doc.getTextWidth(skillText);
        const pillWidth = textWidth + (pillPadding * 2);
        
        // Check if we need to wrap to next row
        if (xPosition + pillWidth > 20 + maxWidth && index > 0) {
          xPosition = 20;
          currentRow += rowSpacing;
        }
        
        // Draw pill background (light blue)
        doc.setFillColor(219, 234, 254); // Light blue background
        doc.roundedRect(xPosition, currentRow - 4, pillWidth, pillHeight, 2, 2, 'F');
        
        // Draw pill border
        doc.setDrawColor(147, 197, 253); // Blue border
        doc.setLineWidth(0.5);
        doc.roundedRect(xPosition, currentRow - 4, pillWidth, pillHeight, 2, 2, 'S');
        
        // Draw skill text
        doc.setTextColor(30, 64, 175); // Blue text
        doc.text(skillText, xPosition + pillPadding, currentRow);
        
        xPosition += pillWidth + 4; // Space between pills
      });
      
      yPosition = currentRow + 12;
      
      // Check if we need a new page after skills section
      if (yPosition > 220) {
        doc.addPage();
        yPosition = 20;
      }
    }
    
    // Work Experience
    if (cvData.workExperience && cvData.workExperience.length > 0) {
      doc.setFontSize(14);
      doc.setTextColor(primaryRgb.r, primaryRgb.g, primaryRgb.b);
      doc.text(labels.workExperience, 20, yPosition);
      yPosition += 8;
      
      // Handle both structured and legacy format
      if (Array.isArray(cvData.workExperience)) {
        cvData.workExperience.forEach((exp: any, index: number) => {
          // Job title and company
          doc.setFontSize(11);
          doc.setTextColor(40, 40, 40);
          doc.text(`${exp.title} at ${exp.company}`, 20, yPosition);
          yPosition += 5;
          
          // Dates
          doc.setFontSize(9);
          doc.setTextColor(100, 100, 100);
          doc.text(exp.dates || '', 20, yPosition);
          yPosition += 8;
          
          // Responsibilities
          if (exp.responsibilities && exp.responsibilities.length > 0) {
            doc.setFontSize(10);
            doc.setTextColor(60, 60, 60);
            exp.responsibilities.forEach((resp: string) => {
              if (resp.trim()) {
                const respLines = doc.splitTextToSize(`• ${resp}`, 170);
                // Check if responsibility will overflow page before adding
                if (yPosition + (respLines.length * 4) + 2 > 245) {
                  doc.addPage();
                  yPosition = 20;
                }
                doc.text(respLines, 25, yPosition);
                yPosition += (respLines.length * 4) + 2;
              }
            });
          }
          
          yPosition += 5; // Space between jobs
          
          // Check if we need a new page before adding next work experience
          // Leave 50 units for bottom margin
          if (yPosition > 245 && index < cvData.workExperience.length - 1) {
            doc.addPage();
            yPosition = 20;
          }
        });
      } else {
        // Legacy format fallback
        doc.setFontSize(10);
        doc.setTextColor(60, 60, 60);
        const workLines = doc.splitTextToSize(cvData.workExperience, 170);
        doc.text(workLines, 20, yPosition);
        yPosition += (workLines.length * 5) + 10;
      }
    }
    
    // Education
    if (cvData.education && cvData.education.length > 0) {
      // Check if we need a new page before starting education section
      // Estimate space needed: title + at least one entry (minimum 20 units)
      if (yPosition > 230) {
        doc.addPage();
        yPosition = 20;
      }
      
      doc.setFontSize(14);
      doc.setTextColor(primaryRgb.r, primaryRgb.g, primaryRgb.b);
      doc.text(labels.education, 20, yPosition);
      yPosition += 8;
      
      // Handle both structured and legacy format
      if (Array.isArray(cvData.education)) {
        cvData.education.forEach((edu: any, index: number) => {
          // Check if we have enough space for this education entry (minimum 15 units)
          // Leave 50 units for bottom margin
          if (yPosition > 245) {
            doc.addPage();
            yPosition = 20;
          }
          
          // Degree
          doc.setFontSize(11);
          doc.setTextColor(40, 40, 40);
          doc.text(edu.degree || '', 20, yPosition);
          yPosition += 5;
          
          // Institution and dates
          doc.setFontSize(10);
          doc.setTextColor(60, 60, 60);
          const eduInfo = [];
          if (edu.institution) eduInfo.push(edu.institution);
          if (edu.dates) eduInfo.push(edu.dates);
          doc.text(eduInfo.join(' | '), 20, yPosition);
          yPosition += 8;
        });
      } else {
        // Legacy format fallback
        doc.setFontSize(10);
        doc.setTextColor(60, 60, 60);
        const educationLines = doc.splitTextToSize(cvData.education, 170);
        doc.text(educationLines, 20, yPosition);
        yPosition += (educationLines.length * 5) + 10;
      }
    }
    
    // Courses & Certifications
    if (cvData.courses && cvData.courses.length > 0) {
      // Check if we need a new page before starting courses section
      if (yPosition > 230) {
        doc.addPage();
        yPosition = 20;
      }
      
      doc.setFontSize(14);
      doc.setTextColor(primaryRgb.r, primaryRgb.g, primaryRgb.b);
      doc.text(labels.courses, 20, yPosition);
      yPosition += 8;
      
      cvData.courses.forEach((course: any, index: number) => {
        // Calculate total space needed for this complete course entry
        let courseBlockHeight = 0;
        
        // Course name space (5 units if present)
        if (course.courseName) {
          courseBlockHeight += 5;
        }
        
        // Institution info space (5 units if present)
        const courseInfo = [];
        if (course.institution) courseInfo.push(course.institution);
        if (course.completionDate) courseInfo.push(course.completionDate);
        if (course.certificateNumber) courseInfo.push(`Cert: ${course.certificateNumber}`);
        
        if (courseInfo.length > 0) {
          courseBlockHeight += 5;
        }
        
        // Description space (calculate based on text length)
        if (course.description && course.description.trim()) {
          doc.setFontSize(9); // Temporarily set font size to calculate text wrap
          const descLines = doc.splitTextToSize(course.description, 170);
          courseBlockHeight += (descLines.length * 4) + 5;
        } else {
          courseBlockHeight += 3;
        }
        
        // Space between course items
        courseBlockHeight += 8;
        
        // Check if we have enough space for the ENTIRE course block
        // Leave 50 units for bottom margin
        if (yPosition + courseBlockHeight > 245) {
          doc.addPage();
          yPosition = 20;
        }
        
        // Now write the complete course entry (guaranteed to fit on one page)
        // Course name
        doc.setFontSize(11);
        doc.setTextColor(40, 40, 40);
        if (course.courseName) {
          doc.text(course.courseName, 20, yPosition);
          yPosition += 5;
        }
        
        // Institution, completion date, and certificate number
        doc.setFontSize(10);
        doc.setTextColor(60, 60, 60);
        if (courseInfo.length > 0) {
          doc.text(courseInfo.join(' | '), 20, yPosition);
          yPosition += 5;
        }
        
        // Course description (if available)
        if (course.description && course.description.trim()) {
          doc.setFontSize(9);
          doc.setTextColor(80, 80, 80);
          const descLines = doc.splitTextToSize(course.description, 170);
          doc.text(descLines, 20, yPosition);
          yPosition += (descLines.length * 4) + 5;
        } else {
          yPosition += 3;
        }
        
        // Add more space between course items
        yPosition += 8;
      });
      
      yPosition += 5; // Extra space after courses section
    }

    // Languages
    if (cvData.languages && cvData.languages.length > 0) {
      // Check if we need a new page before starting languages section
      if (yPosition > 230) {
        doc.addPage();
        yPosition = 20;
      }
      
      doc.setFontSize(14);
      doc.setTextColor(primaryRgb.r, primaryRgb.g, primaryRgb.b);
      doc.text(labels.languages, 20, yPosition);
      yPosition += 8;
      
      cvData.languages.forEach((lang: any, index: number) => {
        // Check if we have enough space for this language entry
        if (yPosition > 250) {
          doc.addPage();
          yPosition = 20;
        }
        
        // Language name and proficiency
        doc.setFontSize(11);
        doc.setTextColor(40, 40, 40);
        const languageText = lang.language || '';
        const proficiencyText = lang.proficiency || '';
        const fullText = proficiencyText ? `${languageText} - ${proficiencyText}` : languageText;
        
        if (fullText.trim()) {
          doc.text(fullText, 20, yPosition);
          yPosition += 6;
        }
      });
      
      yPosition += 5; // Extra space after languages section
    }
    
    // Notice Period (if provided)
    if (cvData.noticePeriod && cvData.noticePeriodUnit) {
      // Check if we have enough space for notice period
      if (yPosition > 250) {
        doc.addPage();
        yPosition = 20;
      }
      
      doc.setFontSize(14);
      doc.setTextColor(primaryRgb.r, primaryRgb.g, primaryRgb.b);
      doc.text(labels.notice_period, 20, yPosition);
      yPosition += 8;
      
      doc.setFontSize(11);
      doc.setTextColor(40, 40, 40);
      // Translate notice period unit based on detected language
      let unitText = cvData.noticePeriodUnit;
      if (detectedLanguage === 'dutch') {
        if (cvData.noticePeriodUnit === 'Day(s)') {
          unitText = 'dagen';
        } else if (cvData.noticePeriodUnit === 'Month(s)') {
          unitText = 'maand(en)';
        }
      }
      
      let noticePeriodText = `${cvData.noticePeriod} ${unitText}`;
      
      // Add negotiable flag if enabled
      if (cvData.noticePeriodNegotiable) {
        const negotiableLabel = detectedLanguage === 'dutch' ? ' (Onderhandelbaar)' : ' (Negotiable)';
        noticePeriodText += negotiableLabel;
      }
      
      doc.text(noticePeriodText, 20, yPosition);
      yPosition += 8;
    }
    
    // Recruiter information (if enabled)
    if (cvData.includeRecruiterInfo && cvData.recruiterName) {
      // Check if we need space for recruiter info (estimate ~35 units + bottom margin)
      if (yPosition > 220) {
        doc.addPage();
        yPosition = 20;
      } else {
        yPosition += 10;
      }
      
      // Add DC People branding with logo (2.5x bigger)
      // Use text instead of image for smaller file size
      doc.setFontSize(14);
      doc.setTextColor(primaryRgb.r, primaryRgb.g, primaryRgb.b);
      doc.text('DC PEOPLE', 20, yPosition);
      yPosition += 8;
      
      doc.setFontSize(12);
      doc.setTextColor(primaryRgb.r, primaryRgb.g, primaryRgb.b);
      doc.text('Represented by:', 20, yPosition);
      yPosition += 8;
      
      doc.setFontSize(10);
      doc.setTextColor(60, 60, 60);
      doc.text(`${cvData.recruiterName} | ${cvData.recruiterCompany}`, 20, yPosition);
      yPosition += 5;
      
      const recruiterContact = [];
      if (cvData.recruiterEmail) recruiterContact.push(cvData.recruiterEmail);
      if (cvData.recruiterPhone) recruiterContact.push(cvData.recruiterPhone);
      if (recruiterContact.length > 0) {
        doc.text(recruiterContact.join(' | '), 20, yPosition);
      }
    }
    
    // Footer removed to reduce file size
    
    // Generate PDF buffer
    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
    
    // Generate filename in format: DC People - [Name] - [Role]
    const candidateName = `${cvData.firstName} ${cvData.lastName}`;
    const roleTitle = cvData.currentRole || cvData.targetRole || 'Professional';
    
    // Sanitize filename by removing special characters that could cause issues
    const sanitizeFilename = (str: string) => str.replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, ' ').trim();
    const filename = sanitizeFilename(`DC People - ${candidateName} - ${roleTitle}.pdf`);
    
    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    
    // Send PDF
    res.send(pdfBuffer);
    
  } catch (error) {
    console.error("PDF generation error:", error);
    res.status(500).json({ 
      error: "Failed to generate PDF", 
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

/**
 * Test endpoint to verify OpenAI connection
 */
cvParserRouter.get("/test", async (req: Request, res: Response) => {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hello, respond with 'CV Parser is working!'" }],
      max_tokens: 20
    });

    res.json({
      success: true,
      message: response.choices[0].message.content
    });
  } catch (error) {
    console.error("OpenAI test error:", error);
    res.status(500).json({
      success: false,
      error: "OpenAI connection failed",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
});