import { GoogleGenerativeAI } from '@google/generative-ai'

export type Priority = 'urgent' | 'high' | 'normal' | 'low'

export interface ClassificationResult {
  category: string
  confidence: number
  priority: Priority
  summary: string
}

const CATEGORIES = [
  { name: 'Client Inquiry',       description: 'Questions and requests from clients' },
  { name: 'Invoice/Payment',      description: 'Billing, invoices, payments, and quotes' },
  { name: 'Project Updates',      description: 'Progress reports, deliverables, and timelines' },
  { name: 'HR/Admin',             description: 'HR matters and administrative communications' },
  { name: 'Legal/Compliance',     description: 'Contracts, legal notices, and regulatory matters' },
  { name: 'Internal',             description: 'Internal team communications' },
  { name: 'Newsletter/Marketing', description: 'Newsletters, promotions, and marketing emails' },
  { name: 'Support Request',      description: 'Issues, bug reports, and support tickets' },
  { name: 'Other',                description: "Emails that don't fit other categories" },
]

export async function classifyEmail(
  subject: string,
  body: string,
  senderEmail: string
): Promise<ClassificationResult> {
  const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY
  if (!apiKey) return fallback(subject)

  try {
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

    const categoriesList = CATEGORIES.map((c) => `- ${c.name}: ${c.description}`).join('\n')

    const prompt = `Classify this corporate email. Return JSON only, no markdown fences.

Categories:
${categoriesList}

Email:
From: ${senderEmail}
Subject: ${subject}
Body (first 1200 chars): ${body.slice(0, 1200)}

Return:
{"category":"<name>","confidence":<0.0-1.0>,"priority":"<urgent|high|normal|low>","summary":"<one sentence>"}`

    const result = await model.generateContent(prompt)
    const text = result.response.text().trim().replace(/```json\n?|\n?```/g, '')
    const parsed = JSON.parse(text) as ClassificationResult
    const valid = CATEGORIES.find((c) => c.name === parsed.category)
    return valid ? parsed : { ...parsed, category: 'Other' }
  } catch {
    return fallback(subject)
  }
}

function fallback(subject: string): ClassificationResult {
  return { category: 'Other', confidence: 0.5, priority: 'normal', summary: subject || 'No subject' }
}
