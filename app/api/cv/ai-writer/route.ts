import { NextResponse } from 'next/server';
import { API_KEYS } from '@/lib/apiKeys';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function POST(request: Request) {
  try {
    const { mode, currentSummary, experience, skills, industry, jobDescription, currentSkills } = await request.json();

    const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY || API_KEYS[1] || API_KEYS[0];
    if (!apiKey) return NextResponse.json({ error: 'API key not configured' }, { status: 500 });

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-3-flash-preview",
      generationConfig: { responseMimeType: "application/json" }
    });

    let prompt = "";

    if (mode === "summary") {
      prompt = `You are a professional CV writer. Generate a compelling professional summary.
Current summary: "${currentSummary || 'Not provided'}"
Experience: ${JSON.stringify(experience || [])}
Skills: ${JSON.stringify(skills || [])}
Industry: ${industry || 'General'}
Rules:
- 3-4 sentences max
- Use strong action-oriented language
- Highlight years of experience, key expertise, and value proposition
- Return JSON: { "result": "string" }`;
    } else if (mode === "enhance-experience") {
      prompt = `You are a professional CV writer. Enhance the following work experiences using action verbs and quantifiable achievements.
Job Description for targeting: "${jobDescription || 'Not provided'}"
Current experiences: ${JSON.stringify(experience || [])}
Rules:
- Improve bullet points with action verbs (Delivered, Built, Led, Optimized, Architected)
- Add implied metrics where possible based on context
- Keep company names, titles, and dates exactly the same
- Return JSON: { "result": [{"company": "string", "location": "string", "role": "string", "startDate": "string", "endDate": "string", "companyDesc": "string", "responsibilities": ["string"]}] }`;
    } else if (mode === "suggest-skills") {
      const industryKeywords: Record<string, string[]> = {
        'software': ['Python', 'JavaScript', 'TypeScript', 'React', 'Node.js', 'AWS', 'Docker', 'SQL', 'Git', 'REST APIs', 'CI/CD', 'Agile'],
        'data': ['Python', 'SQL', 'Machine Learning', 'Data Visualization', 'Statistics', 'ETL', 'Tableau', 'Power BI', 'Spark', 'Deep Learning'],
        'accounting': ['QuickBooks', 'SAP', 'Financial Analysis', 'Auditing', 'Tax Preparation', 'Excel', 'ERP', 'GAAP', 'IFRS', 'Reconciliation'],
        'devops': ['Docker', 'Kubernetes', 'AWS', 'CI/CD', 'Terraform', 'Ansible', 'Linux', 'Jenkins', 'Monitoring', 'GitOps'],
        'marketing': ['SEO', 'SEM', 'Content Strategy', 'Social Media', 'Analytics', 'CRM', 'Email Marketing', 'Brand Strategy', 'PPC'],
        'hr': ['Recruiting', 'Onboarding', 'HRIS', 'Performance Management', 'Employee Relations', 'Compliance', 'Benefits Admin'],
      };
      const matchedKeywords = industry ? Object.entries(industryKeywords).filter(([k]) => industry.toLowerCase().includes(k)).flatMap(([_, v]) => v) : [];
      const existingCategories = (currentSkills || []).map((s: any) => s.category.toLowerCase());

      const suggested: { category: string; items: string }[] = [];
      if (matchedKeywords.length > 0) {
        suggested.push({ category: `${industry} Skills`, items: matchedKeywords.slice(0, 8).join(", ") });
      }
      suggested.push({ category: "Soft Skills", items: "Leadership, Communication, Problem Solving, Teamwork, Time Management, Adaptability, Critical Thinking" });

      return NextResponse.json({ result: suggested.filter(s => !existingCategories.some((ec: string) => s.category.toLowerCase().includes(ec))) });
    } else {
      return NextResponse.json({ error: 'Invalid mode' }, { status: 400 });
    }

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const parsed = JSON.parse(text);
    return NextResponse.json(parsed);

  } catch (error: any) {
    console.error('[AI Writer Error]:', error);
    return NextResponse.json({ error: error.message || 'AI Writer failed' }, { status: 500 });
  }
}
