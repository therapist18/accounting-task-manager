import { GoogleGenerativeAI } from "@google/generative-ai";

// Models to try in order; on failure we fall through to the next one.
export const GEMINI_MODELS_TO_TRY = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash'];

export async function generateWithFallback(
  genAI: GoogleGenerativeAI,
  request: any,
  generationConfig?: Record<string, any>
) {
  let lastError: unknown;
  for (const modelName of GEMINI_MODELS_TO_TRY) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName, generationConfig });
      return await model.generateContent(request);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}
