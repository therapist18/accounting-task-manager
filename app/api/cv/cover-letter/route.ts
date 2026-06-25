import { NextResponse } from 'next/server';
import { API_KEYS } from '@/lib/apiKeys';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function POST(request: Request) {
  try {
    const { cvData, companyName, jobTitle, hiringManager, additionalNotes, letterType } = await request.json();

    const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY || API_KEYS[1] || API_KEYS[0];
    if (!apiKey) return NextResponse.json({ error: 'API key not configured' }, { status: 500 });

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-3-flash-preview",
      generationConfig: { responseMimeType: "application/json" }
    });

    const typeMap: Record<string, string> = {
      cover: "a professional cover letter",
      motivation: "a motivation letter explaining why you are passionate about this role",
      application: "a formal job application letter",
    };

    const prompt = `You are a professional writer. Generate ${typeMap[letterType] || 'a professional cover letter'}.

Candidate Information:
- Name: ${cvData?.personalInfo?.fullName || "Candidate"}
- Email: ${cvData?.personalInfo?.email || "Not provided"}
- Phone: ${cvData?.personalInfo?.phone || "Not provided"}
- Location: ${cvData?.personalInfo?.location || "Not provided"}
- Summary: ${cvData?.summary || "Not provided"}
- Key Experience: ${JSON.stringify((cvData?.experience || []).slice(0, 3).map((e: any) => ({
  company: e.company,
  role: e.role,
  responsibilities: (e.responsibilities || []).slice(0, 2)
})))}
- Skills: ${JSON.stringify((cvData?.skills || []).slice(0, 3).map((s: any) => s.items))}

Target:
- Company: ${companyName}
- Position: ${jobTitle}
- Hiring Manager: ${hiringManager || "Hiring Manager"}
- Additional Notes: ${additionalNotes || "None"}

Rules:
- Professional tone, 4-5 paragraphs
- Use the candidate's actual experience and skills
- Address to ${hiringManager || "Hiring Manager"}
- Include a call to action for an interview
- Do not fabricate specific metrics not in the provided data
- Return JSON: { "result": "string with the full letter" }`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const parsed = JSON.parse(text);
    return NextResponse.json(parsed);

  } catch (error: any) {
    console.error('[Cover Letter Error]:', error);
    return NextResponse.json({ error: error.message || 'Cover letter generation failed' }, { status: 500 });
  }
}
