import { apiRequest } from "./queryClient";

// The newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user

/**
 * Generates a job description using OpenAI's API
 * @param title Job title
 * @param skills Array of required skills
 * @param experience Experience level (entry, mid, senior, lead)
 * @returns Promise with the generated job description
 */
export async function generateJobDescription(
  title: string,
  skills?: string[],
  experience?: string
) {
  try {
    const response = await apiRequest("POST", "/api/job-description/generate", {
      title,
      skills,
      experience,
    });

    return response;
  } catch (error) {
    console.error("Error generating job description:", error);
    throw new Error("Failed to generate job description");
  }
}

/**
 * Formats the job description styling
 * This is used client-side to format the returned job description
 */
export function formatJobDescription(description: string): string {
  // Replace line breaks with <br /> tags for HTML rendering
  return description.replace(/\n/g, "<br />");
}

/**
 * Improves a job description with more specific language
 * @param jobDescription Original job description
 * @param enhancementType Type of enhancement (more detailed, more concise, more technical, etc.)
 * @returns Promise with the enhanced job description
 */
export async function enhanceJobDescription(
  jobDescription: string,
  enhancementType: string
) {
  try {
    const response = await apiRequest("POST", "/api/job-description/enhance", {
      description: jobDescription,
      enhancementType,
    });

    return response;
  } catch (error) {
    console.error("Error enhancing job description:", error);
    throw new Error("Failed to enhance job description");
  }
}
