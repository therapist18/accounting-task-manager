import { API_KEYS } from "@/lib/apiKeys";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

// 2. Track status for rotation
const apiKeyStatus = new Map<string, {
  lastUsed: number;
  failureCount: number;
  cooldownUntil: number;
}>();

API_KEYS.forEach(key => {
  apiKeyStatus.set(key, { lastUsed: 0, failureCount: 0, cooldownUntil: 0 });
});

const getNextAvailableApiKey = (): string => {
  const now = Date.now();
  const availableKeys = API_KEYS.filter(key => apiKeyStatus.get(key)!.cooldownUntil <= now);
  
  if (availableKeys.length === 0) {
    // If all are in cooldown, reset the one with the shortest wait
    return API_KEYS[0]; 
  }
  
  // Basic rotation: pick the one least recently used
  return availableKeys.sort((a, b) => apiKeyStatus.get(a)!.lastUsed - apiKeyStatus.get(b)!.lastUsed)[0];
};

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();
    const apiKey = getNextAvailableApiKey();
    
    // Update status
    apiKeyStatus.get(apiKey)!.lastUsed = Date.now();

    const genAI = new GoogleGenerativeAI(apiKey);
    
    // 3. Generation Config
    const generationConfig = {
      temperature: 0.7, // Lowered slightly for more professional letters
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 2048,
    };

    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash", // Use 1.5-flash or 2.0-flash
      generationConfig,
    });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    return NextResponse.json({ text });

  } catch (error: any) {
    console.error("Gemini API Route Error:", error);
    
    // Handle Rate Limits (429)
    if (error.status === 429) {
      // In a real app, you'd find which key failed and set its cooldownUntil
    }

    return NextResponse.json({ error: "Failed to generate text" }, { status: 500 });
  }
}