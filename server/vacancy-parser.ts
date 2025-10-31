import OpenAI from "openai";
import multer from "multer";
import { Router, Request, Response } from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { z } from "zod";
// PDF parsing via OpenAI vision API for maximum reliability
import pdf2pic from "pdf2pic";
import mammoth from "mammoth";
import { authenticateToken } from "./auth-middleware";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

// Configure multer for vacancy file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), "uploads/vacancies");
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
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit (aligned with extraction check)
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

// Response validation schema
const extractedVacancySchema = z.object({
  organization: z.string().nullable(),
  function: z.string().nullable(),
  jobRequirements: z.string().nullable(),
  offer: z.string().nullable(),
  location: z.string().nullable(),
  employmentType: z.string().nullable(),
  experienceLevel: z.string().nullable(),
  educationLevel: z.string().nullable(),
  salaryRangeMin: z.number().nullable(),
  salaryRangeMax: z.number().nullable(),
  skills: z.array(z.string()),
  companyName: z.string().nullable(),
  extractedCompanyInfo: z.any().nullable()
});

// Rate limiting - Simple in-memory store (in production use Redis)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 5; // 5 requests per minute per IP

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const userLimit = rateLimitStore.get(ip);
  
  if (!userLimit || now > userLimit.resetTime) {
    rateLimitStore.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }
  
  if (userLimit.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }
  
  userLimit.count++;
  return true;
}

export const vacancyParserRouter = Router();

/**
 * Extract text content from uploaded vacancy file
 */
async function extractTextFromFile(filePath: string, mimeType: string): Promise<string> {
  try {
    if (!openai) {
      throw new Error("OpenAI API key not configured. Vacancy parsing is unavailable.");
    }

    console.log(`Extracting text from vacancy file: ${path.basename(filePath)}, MIME type: ${mimeType}`);

    // File size check (5MB limit)
    const stats = fs.statSync(filePath);
    const maxSize = 5 * 1024 * 1024; // 5MB in bytes
    
    if (stats.size > maxSize) {
      throw new Error("File is too large. Please upload a smaller job posting (max 5MB).");
    }
    
    // Handle different file types with proper extraction
    if (mimeType === "application/pdf") {
      try {
        console.log("Converting PDF to images for OpenAI vision analysis (limited to 3 pages)");
        
        // Convert PDF to images and save to temp directory
        const tempDir = path.join(path.dirname(filePath), "temp");
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
        
        const convert = pdf2pic.fromPath(filePath, {
          density: 72, // Reduced from 100 for smaller file size
          saveFilename: "page",
          savePath: tempDir,
          format: "jpeg", // JPEG is smaller than PNG for photos/scanned docs
          width: 1024, // Reduced from 2048 for smaller file size
          height: 1024, // Reduced from 2048
          quality: 85 // High quality JPEG compression
        });

        // Convert all pages of the PDF
        console.log("Attempting to convert all pages...");
        let results;
        try {
          results = await convert.bulk(-1); // Convert all pages
        } catch (bulkError) {
          console.log("Bulk conversion failed, trying page by page...");
          results = [];
          // Try converting pages one by one (limit to 3 pages for performance)
          for (let pageNum = 1; pageNum <= 3; pageNum++) {
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
        
        // Process all pages and extract text from each (limit to first 3 pages)
        let allExtractedText = "";
        const imagePaths: string[] = [];
        const maxPages = Math.min(results.length, 3);
        
        for (let i = 0; i < maxPages; i++) {
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
                    text: `Extract ALL text content from this job posting page ${i + 1}. Return only the exact text content without any formatting, analysis, or additional comments. Just provide the raw text as it appears in the document.`
                  },
                  {
                    type: "image_url", 
                    image_url: {
                      url: `data:image/jpeg;base64,${base64Image}`
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
        
        console.log(`Final extracted text length: ${extractedText.length} characters from ${maxPages} pages`);
        // Removed sensitive content logging for security
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
        
        // Removed sensitive content logging for security
        return extractedText;
      } catch (docxError) {
        console.error("DOCX parsing error:", docxError);
        throw new Error("Failed to parse Word document. Please ensure the file is not corrupted.");
      }
      
    } else {
      throw new Error("Unsupported file type. Please upload PDF, DOC, DOCX, or TXT files.");
    }
    
  } catch (error) {
    console.error("Error extracting text from vacancy file:", error);
    throw new Error(`Unable to extract text from the uploaded file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Parse job posting content using OpenAI - Enhanced with structured output
 */
async function parseJobPosting(textContent: string): Promise<any> {
  try {
    // Process the entire document content (all pages)
    const fullContent = textContent;
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content: `You are processing a job posting upload (PDF, DOC, DOCX, or TXT) for a vacancy. Your job is to accurately extract and format the job posting information to populate a form with the following fields:

⸻

✳️ Form Fields to Fill
        •       Organization (company description)
        •       Function (role/job description)
        •       Job Requirements
        •       Offer (what the company offers)
        •       Location
        •       Employment Type
        •       Experience Level
        •       Education Level
        •       Salary Range (min/max)
        •       Skills
        •       Company Name

⸻

🔍 Extraction Instructions

1. Organization
Extract the company description, about the company section, or organizational information. This should be 2-5 sentences describing what the company does, their mission, size, industry, etc.

2. Function
Extract the main job role description - what the position entails, day-to-day responsibilities, the role's purpose within the company. This should be 3-8 sentences about the actual job function.

3. Job Requirements
Extract all job requirements, qualifications, skills needed, experience requirements, education requirements, certifications, etc. Format as bullet points or clear sections.

4. Offer
Extract what the company offers - benefits, salary information, perks, work environment, growth opportunities, etc. Everything the company provides to the employee.

5. Location
Extract the job location(s). Could be city, remote, hybrid, multiple locations, etc.

6. Employment Type
Determine the employment type from these options:
- "full-time"
- "part-time" 
- "contract"
- "temporary"
- "internship"
- "freelance"

7. Experience Level
Determine the experience level from these options:
- "entry-level" (0-2 years, junior, graduate, starter positions)
- "mid-level" (3-7 years, experienced, senior individual contributor)
- "senior-level" (8+ years, lead, senior, principal, architect roles)
- "executive" (director, VP, C-level positions)

8. Education Level
Determine the education level from these options:
- "high-school" (high school diploma, secondary education)
- "associate" (associate degree, 2-year college)
- "bachelor" (bachelor's degree, 4-year college)
- "master" (master's degree, graduate school)
- "doctorate" (PhD, doctoral degree)
- "certification" (professional certifications, trade school)

9. Salary Range
Extract salary information and convert to numbers:
- salaryRangeMin: minimum salary as integer (no currency symbols)
- salaryRangeMax: maximum salary as integer (no currency symbols)
- If salary is "50k-70k EUR" return min: 50000, max: 70000
- If only one salary mentioned, use it for both min and max
- If no salary mentioned, return null for both

10. Skills
Extract all technical skills, technologies, programming languages, tools, software, methodologies mentioned. Return as an array of strings.
Example: ["JavaScript", "React", "Node.js", "SQL", "Git", "Agile", "Scrum"]

11. Company Name & Company Info
- companyName: Extract the hiring company name
- extractedCompanyInfo: Object with additional company details like industry, size, website, etc.

LANGUAGE REQUIREMENTS:
- If the job posting is in Dutch, write descriptions in Dutch
- If the job posting is in English, write descriptions in English
- Match the language of the source document

Return the response as a valid JSON object with these exact field names:
{
  "organization": "Company description...",
  "function": "Role description...",
  "jobRequirements": "Requirements and qualifications...",
  "offer": "What the company offers...",
  "location": "Job location",
  "employmentType": "full-time",
  "experienceLevel": "mid-level",
  "educationLevel": "bachelor", 
  "salaryRangeMin": 50000,
  "salaryRangeMax": 70000,
  "skills": ["skill1", "skill2", "skill3"],
  "companyName": "Company Name",
  "extractedCompanyInfo": {
    "industry": "Technology",
    "size": "100-500 employees",
    "website": "company.com"
  }
}

If any field cannot be determined from the content, use null for that field.`
        },
        {
          role: "user",
          content: `Please analyze this job posting and extract the structured information in the exact JSON format specified:\n\n${fullContent}`
        }
      ],
      max_tokens: 4000,
      temperature: 0
    });

    const aiResponse = response.choices[0].message.content;
    console.log(`AI response received, length: ${aiResponse?.length || 0} characters`);

    if (!aiResponse) {
      throw new Error("No response from AI service");
    }

    // Try to parse the JSON response
    let parsedData;
    try {
      // Clean the response to extract JSON
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in AI response");
      }
    } catch (parseError) {
      console.error("Failed to parse AI response as JSON:", parseError);
      console.error("AI response was:", aiResponse);
      throw new Error("AI returned invalid JSON format");
    }

    // Validate and clean the parsed data
    const cleanedData = {
      organization: parsedData.organization || null,
      function: parsedData.function || null,
      jobRequirements: parsedData.jobRequirements || null,
      offer: parsedData.offer || null,
      location: parsedData.location || null,
      employmentType: parsedData.employmentType || null,
      experienceLevel: parsedData.experienceLevel || null,
      educationLevel: parsedData.educationLevel || null,
      salaryRangeMin: parsedData.salaryRangeMin || null,
      salaryRangeMax: parsedData.salaryRangeMax || null,
      skills: Array.isArray(parsedData.skills) ? parsedData.skills : [],
      companyName: parsedData.companyName || null,
      extractedCompanyInfo: parsedData.extractedCompanyInfo || null
    };

    console.log(`Successfully parsed job posting data with ${Object.keys(cleanedData).length} fields`);
    return cleanedData;

  } catch (error) {
    console.error("Error parsing job posting with AI:", error);
    throw new Error(`Failed to parse job posting: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Upload and process vacancy file endpoint
 * Protected with authentication and rate limiting
 */
vacancyParserRouter.post("/extract-vacancy-from-file", authenticateToken, (req: Request, res: Response, next) => {
  // Rate limiting check
  const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({ 
      message: "Too many requests. Please try again in a minute." 
    });
  }
  
  // Set request timeout with file cleanup
  const timeout = setTimeout(() => {
    // Critical fix: Clean up uploaded file on timeout
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
        console.log("Cleaned up uploaded file on timeout");
      } catch (cleanupError) {
        console.warn("Could not clean up uploaded file on timeout:", cleanupError);
      }
    }
    res.status(408).json({ message: "Request timeout. Please try again with a smaller file." });
  }, 120000); // 2 minute timeout
  
  res.on('finish', () => clearTimeout(timeout));
  res.on('close', () => clearTimeout(timeout));
  
  next();
}, upload.single("file"), async (req: Request, res: Response) => {
  try {
    console.log("Vacancy file upload request from authenticated user");
    
    if (!req.file) {
      return res.status(400).json({ 
        message: "No file uploaded. Please select a PDF, DOC, DOCX, or TXT file." 
      });
    }

    console.log("Uploaded file info:", {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
      // Path removed for security
    });

    // Extract text from the uploaded file
    const extractedText = await extractTextFromFile(req.file.path, req.file.mimetype);
    
    if (!extractedText || extractedText.trim().length === 0) {
      // Clean up the uploaded file
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupError) {
        console.warn("Could not clean up uploaded file:", cleanupError);
      }
      
      return res.status(400).json({ 
        message: "Could not extract readable text from the uploaded file. Please ensure the file contains text content." 
      });
    }

    console.log(`Successfully extracted ${extractedText.length} characters from uploaded vacancy file`);

    // Parse the extracted text with AI
    const parsedData = await parseJobPosting(extractedText);
    
    // Validate response data
    const validatedData = extractedVacancySchema.parse(parsedData);

    // Clean up the uploaded file
    try {
      fs.unlinkSync(req.file.path);
      console.log("Successfully cleaned up uploaded file");
    } catch (cleanupError) {
      console.warn("Could not clean up uploaded file:", cleanupError);
    }

    console.log("Vacancy parsing complete");

    res.json(validatedData);

  } catch (error) {
    console.error("Vacancy file processing error:", error instanceof Error ? error.message : 'Unknown error');
    
    // Clean up uploaded file on error
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupError) {
        console.warn("Could not clean up uploaded file after error:", cleanupError);
      }
    }

    // Determine appropriate status code
    let statusCode = 500;
    let message = "Failed to process vacancy file";
    
    if (error instanceof z.ZodError) {
      statusCode = 422;
      message = "Invalid data format in extracted content";
    } else if (error instanceof Error) {
      if (error.message.includes("too large")) {
        statusCode = 413;
      } else if (error.message.includes("Unsupported file type")) {
        statusCode = 415;
      }
      message = error.message;
    }
    
    res.status(statusCode).json({ message });
  }
});