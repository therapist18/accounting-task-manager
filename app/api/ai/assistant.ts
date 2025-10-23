// pages/api/ai/refineReason.ts
import { NextApiRequest, NextApiResponse } from 'next';
// Example using OpenAI SDK
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { userReason, role, companyName } = req.body;

  if (!userReason) {
    return res.status(400).json({ error: 'No reason provided' });
  }

  const prompt = `
You are a professional letter writer. A company ${companyName} is applying for a Class D Work Permit for a candidate. The candidate’s justification for the application is roughly below:
"${userReason}"

Refine this justification into a polished, formal paragraph suitable for a cover letter. Use a professional tone, mention the candidate’s unique expertise, why it is important for the company, and compliance with Kenyan labour regulations.
  `;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',       // or whichever model you use
    messages: [
      { role: 'system', content: 'You are a professional letter writer.' },
      { role: 'user', content: prompt }
    ],
    max_tokens: 200,
    temperature: 0.7
  });

  const refined = response.choices?.[0]?.message?.content ?? '';

  res.status(200).json({ refined });
}
