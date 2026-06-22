import { NextResponse } from 'next/server';
import { API_KEYS } from '@/lib/apiKeys';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function POST(request: Request) {
  try {
    const { fileBase64, mimeType } = await request.json();

    if (!fileBase64) {
      return NextResponse.json({ error: 'No file data provided' }, { status: 400 });
    }

    // Try to get a valid API key
    const apiKey = process.env.GEMINI_API_KEY || API_KEYS[1] || API_KEYS[0];
    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API key is not configured' }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
      }
    });

    const filePart = {
      inlineData: {
        data: fileBase64,
        mimeType: mimeType || 'application/pdf',
      },
    };

    const prompt = `
      You are an expert CV parser and recruiter assistant.
      Extract all available information from the attached CV document and return it as a structured JSON object.
      
      Match the following JSON schema strictly:
      {
        "personalInfo": {
          "fullName": "Full name of the candidate",
          "title": "Professional title (e.g. Software Engineer)",
          "email": "Email address",
          "phone": "Phone number",
          "location": "City and Country (e.g. Nairobi, Kenya)",
          "github": "Github URL or username",
          "linkedin": "LinkedIn URL or profile username"
        },
        "personalDetails": {
          "dateOfBirth": "DD/MM/YYYY if available",
          "nationality": "Nationality",
          "maritalStatus": "Marital status",
          "residence": "Current residence",
          "nairobiRes": "Nairobi residence details if specified",
          "kenyaStatus": "Kenya work permit status or willingness to bear permit expenses if mentioned",
          "drivingExperience": "Driving experience details if mentioned (e.g. 9 Years Experience)"
        },
        "summary": "Professional profile summary paragraph",
        "skills": [
          {
            "category": "Skill category name (e.g., Software & Programming)",
            "items": ["skill 1", "skill 2"]
          }
        ],
        "experience": [
          {
            "company": "Company name",
            "location": "Location (e.g. India or Nairobi, Kenya)",
            "role": "Job title/role",
            "startDate": "Start date (e.g. Sept 2023)",
            "endDate": "End date or 'Present'",
            "companyDesc": "Brief company description if mentioned",
            "responsibilities": ["bullet point 1", "bullet point 2"]
          }
        ],
        "internships": [
          {
            "company": "Company name",
            "location": "Location",
            "role": "Internship role",
            "startDate": "Start date",
            "endDate": "End date",
            "companyDesc": "Brief company description if mentioned",
            "responsibilities": ["bullet point 1", "bullet point 2"]
          }
        ],
        "projects": [
          {
            "title": "Project name",
            "description": "Project details",
            "year": "Year of project"
          }
        ],
        "education": [
          {
            "degree": "Degree/Diploma name",
            "institution": "School/University name",
            "year": "Year of completion (e.g. 2019)",
            "details": "Additional details if any"
          }
        ],
        "references": [
          {
            "name": "Reference person name",
            "title": "Title/Role",
            "company": "Company name",
            "address": "Address if available",
            "contact": "Contact details (email, phone, etc.)"
          }
        ],
        "declaration": "Declaration statement if present in CV",
        "verifiedBadge": true
      }

      Return only the JSON object containing the parsed information. If some fields are not present in the document, set them to null or an empty array/object as appropriate. Do not invent details.
    `;

    console.log('[CV Extractor API] Calling Gemini...');
    const result = await model.generateContent([prompt, filePart]);
    const responseText = result.response.text();
    console.log('[CV Extractor API] Parse result length:', responseText.length);

    const parsedJson = JSON.parse(responseText);
    return NextResponse.json(parsedJson);

  } catch (error: any) {
    console.error('[CV Extractor API Error]:', error);
    return NextResponse.json({
      error: 'Failed to extract CV details',
      details: error.message || String(error)
    }, { status: 500 });
  }
}
