import React from 'react';

interface JobDescriptionResponse {
  description: string;
  responsibilities: string[];
  requirements: string[];
  qualifications: string[];
  benefits: string[];
}

/**
 * Professional writing style for job descriptions
 * @param jobTitle The title of the job
 * @param jobDescription The job description data
 * @returns Formatted job description in professional tone
 */
export function professionalWriting(
  jobTitle: string,
  jobDescription: JobDescriptionResponse
): React.ReactNode {
  return (
    <>
      <h1 className="text-2xl font-bold mb-4">{jobTitle.toUpperCase()}</h1>
      
      <div className="mb-6">
        <p>{jobDescription.description}</p>
      </div>
      
      <h2 className="text-xl font-semibold mb-2">Key Responsibilities</h2>
      <ul className="list-disc pl-6 mb-6">
        {jobDescription.responsibilities.map((responsibility, index) => (
          <li key={index} className="mb-1">{responsibility}</li>
        ))}
      </ul>
      
      <h2 className="text-xl font-semibold mb-2">Requirements</h2>
      <ul className="list-disc pl-6 mb-6">
        {jobDescription.requirements.map((requirement, index) => (
          <li key={index} className="mb-1">{requirement}</li>
        ))}
      </ul>
      
      <h2 className="text-xl font-semibold mb-2">Qualifications</h2>
      <ul className="list-disc pl-6 mb-6">
        {jobDescription.qualifications.map((qualification, index) => (
          <li key={index} className="mb-1">{qualification}</li>
        ))}
      </ul>
      
      <h2 className="text-xl font-semibold mb-2">Benefits</h2>
      <ul className="list-disc pl-6 mb-4">
        {jobDescription.benefits.map((benefit, index) => (
          <li key={index} className="mb-1">{benefit}</li>
        ))}
      </ul>
    </>
  );
}

/**
 * Creative writing style for job descriptions
 * @param jobTitle The title of the job
 * @param jobDescription The job description data
 * @returns Formatted job description in creative tone
 */
export function creativeWriting(
  jobTitle: string,
  jobDescription: JobDescriptionResponse
): React.ReactNode {
  return (
    <>
      <h1 className="text-3xl font-bold mb-4 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
        Join Our Team as a {jobTitle}!
      </h1>
      
      <div className="mb-6 text-lg">
        <p>{jobDescription.description}</p>
      </div>
      
      <h2 className="text-xl font-semibold mb-3 text-purple-600">What You'll Be Doing</h2>
      <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg mb-6">
        <ul className="space-y-2">
          {jobDescription.responsibilities.map((responsibility, index) => (
            <li key={index} className="flex items-start">
              <span className="text-blue-500 mr-2">✨</span>
              <span>{responsibility}</span>
            </li>
          ))}
        </ul>
      </div>
      
      <h2 className="text-xl font-semibold mb-3 text-purple-600">Who You Are</h2>
      <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg mb-6">
        <ul className="space-y-2">
          {jobDescription.requirements.map((requirement, index) => (
            <li key={index} className="flex items-start">
              <span className="text-blue-500 mr-2">🌟</span>
              <span>{requirement}</span>
            </li>
          ))}
        </ul>
      </div>
      
      <h2 className="text-xl font-semibold mb-3 text-purple-600">Bonus Points If You Have</h2>
      <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg mb-6">
        <ul className="space-y-2">
          {jobDescription.qualifications.map((qualification, index) => (
            <li key={index} className="flex items-start">
              <span className="text-blue-500 mr-2">🚀</span>
              <span>{qualification}</span>
            </li>
          ))}
        </ul>
      </div>
      
      <h2 className="text-xl font-semibold mb-3 text-purple-600">Why You'll Love Working Here</h2>
      <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg mb-4">
        <ul className="space-y-2">
          {jobDescription.benefits.map((benefit, index) => (
            <li key={index} className="flex items-start">
              <span className="text-blue-500 mr-2">💎</span>
              <span>{benefit}</span>
            </li>
          ))}
        </ul>
      </div>
      
      <div className="mt-6 text-center">
        <p className="text-lg font-medium bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
          Ready to take the next step in your career? Apply now!
        </p>
      </div>
    </>
  );
}

/**
 * Casual writing style for job descriptions
 * @param jobTitle The title of the job
 * @param jobDescription The job description data
 * @returns Formatted job description in casual tone
 */
export function casualWriting(
  jobTitle: string,
  jobDescription: JobDescriptionResponse
): React.ReactNode {
  return (
    <>
      <h1 className="text-2xl font-bold mb-4">
        We're Looking for a {jobTitle}
      </h1>
      
      <div className="mb-6">
        <p>{jobDescription.description}</p>
      </div>
      
      <h2 className="text-xl font-semibold mb-2">What you'll do:</h2>
      <ul className="list-disc pl-6 mb-6">
        {jobDescription.responsibilities.map((responsibility, index) => (
          <li key={index} className="mb-1">{responsibility}</li>
        ))}
      </ul>
      
      <h2 className="text-xl font-semibold mb-2">What we're looking for:</h2>
      <ul className="list-disc pl-6 mb-6">
        {jobDescription.requirements.map((requirement, index) => (
          <li key={index} className="mb-1">{requirement}</li>
        ))}
      </ul>
      
      <h2 className="text-xl font-semibold mb-2">It'd be great if you have:</h2>
      <ul className="list-disc pl-6 mb-6">
        {jobDescription.qualifications.map((qualification, index) => (
          <li key={index} className="mb-1">{qualification}</li>
        ))}
      </ul>
      
      <h2 className="text-xl font-semibold mb-2">What's in it for you:</h2>
      <ul className="list-disc pl-6 mb-4">
        {jobDescription.benefits.map((benefit, index) => (
          <li key={index} className="mb-1">{benefit}</li>
        ))}
      </ul>
      
      <div className="mt-6">
        <p className="text-lg">
          Sound like a good fit? We'd love to hear from you!
        </p>
      </div>
    </>
  );
}
