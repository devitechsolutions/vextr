import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

interface CVData {
  candidateName: string;
  candidateEmail: string;
  candidatePhone: string;
  candidateLocation: string;
  candidateTitle: string;
  candidateSummary: string;
  candidateExperience: string;
  candidateEducation: string;
  candidateSkills: string;
  includeRecruiterInfo: boolean;
  recruiterName?: string;
  recruiterCompany?: string;
  recruiterEmail?: string;
  recruiterPhone?: string;
}

interface CVTemplate {
  name: string;
  primaryColor: string;
  includePhoto: boolean;
  includeContactInfo: boolean;
}

export class PDFDocument {
  private doc: any;
  private data: CVData;
  private template: CVTemplate;

  constructor(data: CVData, template: CVTemplate) {
    this.doc = new jsPDF();
    this.data = data;
    this.template = template;
  }

  /**
   * Generate a PDF based on template and data
   */
  public generate(): Blob {
    // Set default font
    this.doc.setFont('helvetica');

    // Only modern template is supported
    this.renderModernTemplate();

    return this.doc.output('blob');
  }

  /**
   * Get a data URL for preview
   */
  public getDataUrl(): string {
    this.generate();
    return this.doc.output('datauristring');
  }

  /**
   * Save the PDF with a given filename
   */
  public save(filename: string = 'resume.pdf'): void {
    this.doc.save(filename);
  }

  /**
   * Generate modern template
   */
  private renderModernTemplate(): void {
    const primaryColor = this.hexToRgb(this.template.primaryColor);
    
    // Header
    this.doc.setFillColor(primaryColor.r, primaryColor.g, primaryColor.b);
    this.doc.rect(0, 0, 210, 8, 'F');
    
    // Name
    this.doc.setFontSize(24);
    this.doc.setTextColor(primaryColor.r, primaryColor.g, primaryColor.b);
    this.doc.text(this.data.candidateName, 20, 20);
    
    // Title
    this.doc.setFontSize(14);
    this.doc.setTextColor(100, 100, 100);
    this.doc.text(this.data.candidateTitle, 20, 28);
    
    let yPos = 35;
    
    // Location (always shown if available)
    if (this.data.candidateLocation) {
      this.doc.setFontSize(10);
      this.doc.setTextColor(100, 100, 100);
      this.doc.text(this.data.candidateLocation, 20, yPos);
      yPos += 7;
    }
    
    // Contact info (conditionally shown)
    if (this.template.includeContactInfo) {
      this.doc.setFontSize(10);
      this.doc.setTextColor(60, 60, 60);
      const contactInfo = `${this.data.candidateEmail} | ${this.data.candidatePhone}`;
      this.doc.text(contactInfo, 20, yPos);
      yPos += 7;
    }
    
    yPos += 5; // Add some spacing
    
    // Summary heading
    this.doc.setFontSize(12);
    this.doc.setTextColor(primaryColor.r, primaryColor.g, primaryColor.b);
    this.doc.text('SUMMARY', 20, yPos);
    this.doc.setDrawColor(primaryColor.r, primaryColor.g, primaryColor.b);
    this.doc.line(20, yPos + 2, 190, yPos + 2);
    
    // Summary content
    this.doc.setFontSize(10);
    this.doc.setTextColor(0, 0, 0);
    const summaryLines = this.doc.splitTextToSize(this.data.candidateSummary, 170);
    this.doc.text(summaryLines, 20, yPos + 7);
    
    // Experience heading
    yPos = yPos + 7 + (summaryLines.length * 5);
    this.doc.setFontSize(12);
    this.doc.setTextColor(primaryColor.r, primaryColor.g, primaryColor.b);
    this.doc.text('EXPERIENCE', 20, yPos);
    this.doc.setDrawColor(primaryColor.r, primaryColor.g, primaryColor.b);
    this.doc.line(20, yPos + 2, 190, yPos + 2);
    
    // Experience content
    this.doc.setFontSize(10);
    this.doc.setTextColor(0, 0, 0);
    const experienceLines = this.doc.splitTextToSize(this.data.candidateExperience, 170);
    this.doc.text(experienceLines, 20, yPos + 7);
    
    // Education heading
    yPos = yPos + 7 + (experienceLines.length * 5);
    this.doc.setFontSize(12);
    this.doc.setTextColor(primaryColor.r, primaryColor.g, primaryColor.b);
    this.doc.text('EDUCATION', 20, yPos);
    this.doc.setDrawColor(primaryColor.r, primaryColor.g, primaryColor.b);
    this.doc.line(20, yPos + 2, 190, yPos + 2);
    
    // Education content
    this.doc.setFontSize(10);
    this.doc.setTextColor(0, 0, 0);
    const educationLines = this.doc.splitTextToSize(this.data.candidateEducation, 170);
    this.doc.text(educationLines, 20, yPos + 7);
    
    // Skills heading
    yPos = yPos + 7 + (educationLines.length * 5);
    this.doc.setFontSize(12);
    this.doc.setTextColor(primaryColor.r, primaryColor.g, primaryColor.b);
    this.doc.text('SKILLS', 20, yPos);
    this.doc.setDrawColor(primaryColor.r, primaryColor.g, primaryColor.b);
    this.doc.line(20, yPos + 2, 190, yPos + 2);
    
    // Skills content
    this.doc.setFontSize(10);
    this.doc.setTextColor(0, 0, 0);
    const skillsLines = this.doc.splitTextToSize(this.data.candidateSkills, 170);
    this.doc.text(skillsLines, 20, yPos + 7);
    
    // Recruiter info
    if (this.data.includeRecruiterInfo && this.data.recruiterName) {
      yPos = 280;
      this.doc.setFontSize(8);
      this.doc.setTextColor(100, 100, 100);
      this.doc.text(`Represented by: ${this.data.recruiterName} | ${this.data.recruiterCompany}`, 20, yPos);
      this.doc.text(`${this.data.recruiterEmail} | ${this.data.recruiterPhone}`, 20, yPos + 4);
    }
  }

  /**
   * Convert hex color to RGB
   */
  private hexToRgb(hex: string): { r: number, g: number, b: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
  }
}

/**
 * Generate a PDF with the given data
 */
export function generateCV(data: CVData, template: CVTemplate): Blob {
  const pdf = new PDFDocument(data, template);
  return pdf.generate();
}

/**
 * Get a preview URL for the PDF
 */
export function getCVPreviewUrl(data: CVData, template: CVTemplate): string {
  const pdf = new PDFDocument(data, template);
  return pdf.getDataUrl();
}

/**
 * Download the CV as PDF
 */
export function downloadCV(data: CVData, template: CVTemplate, filename: string = 'resume.pdf'): void {
  const pdf = new PDFDocument(data, template);
  pdf.save(filename);
}
