import { NextResponse } from 'next/server';
import { API_KEYS } from '@/lib/apiKeys';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { generateWithFallback } from '@/lib/gemini';
import mammoth from 'mammoth';

const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

type EnhancementLevel = "none" | "light" | "professional" | "executive";

const ENHANCEMENT_INSTRUCTIONS: Record<EnhancementLevel, string> = {
  none: "",
  light: `
    Make only minor improvements:
    - Fix grammar, spelling, and punctuation errors
    - Improve sentence flow where awkward
    - DO NOT change any facts, names, dates, numbers, or key details
    - Keep the original voice and style largely intact
  `,
  professional: `
    Rewrite to a professional standard:
    - Rewrite bullet points using strong action verbs (e.g. "Led", "Built", "Delivered", "Optimised")
    - Make the professional summary clear, concise, and impactful
    - Remove informal language, slang, or vague phrases
    - DO NOT change company names, job titles, dates, locations, institutions, or any factual figures
    - Do not invent achievements or add details that weren't in the original
  `,
  executive: `
    Elevate to executive-level language:
    - Frame experience using strategic and leadership language
    - Emphasise business impact, scale, and outcomes
    - Rewrite the summary as a compelling executive profile
    - Use precise, authoritative language throughout
    - DO NOT alter any facts: company names, job titles, dates, locations, institutions, or figures must remain exactly as provided
    - Do not fabricate metrics, achievements, or responsibilities not present in the original
  `,
};

export async function POST(request: Request) {
  try {
    const { fileBase64, mimeType, enhancementLevel = "none" } = await request.json();

    if (!fileBase64) {
      return NextResponse.json({ error: 'No file data provided' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY || API_KEYS[1] || API_KEYS[0];
    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API key is not configured' }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const generationConfig = { responseMimeType: "application/json" };

    // ─── STAGE 1: RAW EXTRACTION ─────────────────────────────────────────────
    const extractionPrompt = `
      You are an expert CV parser. Extract all information from the attached CV exactly as written.
      Do not rephrase, improve, or modify any content — extract raw data only.

      Return a JSON object matching this schema exactly:
      {
        "personalInfo": {
          "fullName": "string",
          "title": "string",
          "email": "string",
          "phone": "string",
          "location": "string (City, Country)",
          "github": "string or null",
          "linkedin": "string or null"
        },
        "personalDetails": {
          "dateOfBirth": "DD/MM/YYYY or null",
          "nationality": "string or null",
          "maritalStatus": "string or null",
          "residence": "string or null",
          "nairobiRes": "string or null",
          "kenyaStatus": "string or null",
          "drivingExperience": "string or null"
        },
        "summary": "string",
        "skills": [{ "category": "string", "items": ["string"] }],
        "experience": [{
          "company": "string",
          "location": "string",
          "role": "string",
          "startDate": "string",
          "endDate": "string",
          "companyDesc": "string or null",
          "responsibilities": ["string"]
        }],
        "internships": [{
          "company": "string",
          "location": "string",
          "role": "string",
          "startDate": "string",
          "endDate": "string",
          "companyDesc": "string or null",
          "responsibilities": ["string"]
        }],
        "projects": [{ "title": "string", "description": "string", "year": "string or null" }],
        "education": [{ "degree": "string", "institution": "string", "year": "string", "details": "string or null" }],
        "references": [{ "name": "string", "title": "string", "company": "string", "address": "string or null", "contact": "string" }],
        "languages": [{ "language": "string", "proficiency": "string" }],
        "declaration": "string or null",
        "verifiedBadge": true
      }

      IMPORTANT for "languages":
      - Extract all languages explicitly mentioned in the CV
      - If NO languages are mentioned anywhere in the document, return: [{ "language": "English", "proficiency": "Professional" }]

      Return only the JSON object. Do not include markdown, code fences, or explanations.
    `;

    // Gemini's inlineData only accepts a limited set of MIME types (PDF, images,
    // plain text, audio/video) — DOCX isn't one of them, so extract its text
    // ourselves and send that as a text part instead of the raw file bytes.
    let cvContentPart: string | { inlineData: { data: string; mimeType: string } };
    if (mimeType === DOCX_MIME_TYPE) {
      const { value: docxText } = await mammoth.extractRawText({ buffer: Buffer.from(fileBase64, 'base64') });
      cvContentPart = docxText;
    } else {
      cvContentPart = { inlineData: { data: fileBase64, mimeType: mimeType || 'application/pdf' } };
    }

    console.log('[CV Extractor] Stage 1: Extracting raw data...');
    const extractionResult = await generateWithFallback(genAI, [
      extractionPrompt,
      cvContentPart
    ], generationConfig);
    const extractedJson = JSON.parse(extractionResult.response.text());
    console.log('[CV Extractor] Stage 1 complete.');

    // ─── STAGE 2: PROFESSIONAL ENHANCEMENT (optional) ────────────────────────
    if (enhancementLevel === "none") {
      return NextResponse.json({ ...extractedJson, _enhancementLevel: "none" });
    }

    const instructions = ENHANCEMENT_INSTRUCTIONS[enhancementLevel as EnhancementLevel];
    const enhancementPrompt = `
      You are a professional CV writer. Enhance the text content of the following CV JSON.

      Enhancement level: ${enhancementLevel.toUpperCase()}
      ${instructions}

      STRICT RULES — never break these:
      1. Return the exact same JSON structure — do not add or remove fields
      2. Do not change: personalInfo, personalDetails, education.institution, education.year, experience.company, experience.location, experience.startDate, experience.endDate, references, languages, verifiedBadge
      3. Only improve: summary, experience.responsibilities, experience.companyDesc, internships.responsibilities, internships.companyDesc, projects.description, skills (items text only, not categories), declaration
      4. Do not fabricate any information

      Input JSON:
      ${JSON.stringify(extractedJson, null, 2)}

      Return only the enhanced JSON object with the same structure.
    `;

    console.log(`[CV Extractor] Stage 2: Enhancing at level "${enhancementLevel}"...`);
    const enhancementResult = await generateWithFallback(genAI, enhancementPrompt, generationConfig);
    const enhancedJson = JSON.parse(enhancementResult.response.text());
    console.log('[CV Extractor] Stage 2 complete.');

    return NextResponse.json({ ...enhancedJson, _enhancementLevel: enhancementLevel });

  } catch (error: any) {
    console.error('[CV Extractor Error]:', error);
    return NextResponse.json({
      error: 'Failed to extract CV details',
      details: error.message || String(error)
    }, { status: 500 });
  }
}
