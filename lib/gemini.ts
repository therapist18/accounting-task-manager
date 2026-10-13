import { GoogleGenerativeAI } from "@google/generative-ai";
import { DEFAULT_GEMINI_MODEL, getActiveGeminiModel } from "./gemini-config";

// Static fallback models to try in order; on failure we fall through to the next one.
// The primary model is the shared setting the scanner app uses (sys_config:gemini_model),
// resolved at call time by getGeminiModelsToTry().
export const GEMINI_MODELS_TO_TRY = ['gemini-3.1-flash-lite', 'gemini-2.5-flash'];

/** Primary model from the shared Supabase setting, followed by known-good fallbacks. */
export async function getGeminiModelsToTry(): Promise<string[]> {
  const primary = await getActiveGeminiModel().catch(() => DEFAULT_GEMINI_MODEL);
  return Array.from(new Set([primary, ...GEMINI_MODELS_TO_TRY]));
}

export async function generateWithFallback(
  genAI: GoogleGenerativeAI,
  request: any,
  generationConfig?: Record<string, any>
) {
  let lastError: unknown;
  const modelsToTry = await getGeminiModelsToTry();
  for (const modelName of modelsToTry) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName, generationConfig });
      return await model.generateContent(request);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}
