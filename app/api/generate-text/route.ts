import { NextResponse } from 'next/server';
import { API_KEYS } from '@/lib/apiKeys';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function POST(request: Request) {
  try {
    console.log('🔥 [API] Generate Text endpoint called');
    
    const { modelType, prompt } = await request.json();
    
    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    console.log('🔥 [API] Model type:', modelType);
    console.log('🔥 [API] Gemini API Key available:', !!API_KEYS);
    console.log('🔥 [API] Using API key:', API_KEYS[1]?.substring(0, 20) + '...');

    const genAI = new GoogleGenerativeAI(API_KEYS[1] || '');
    const model = genAI.getGenerativeModel({ 
      model: modelType === "gemini-3-flash-preview" ? "gemini-3-flash-preview" : "gemini-1.5-flash" 
    });

    console.log('🔥 [API] Calling Gemini model...');

    try {
      const response = await model.generateContent({
        contents: [
          { 
            role: "user", 
            parts: [
              { text: "You are a professional legal secretary specializing in Kenyan Immigration and Corporate law. Your tone is formal, persuasive, and concise." },
              { text: prompt }
            ]
          }
        ],
        generationConfig: {
          maxOutputTokens: 2000,
          temperature: 0.7,
        }
      });

      const result = response.response.text();
      console.log('🔥 [API] Gemini response length:', result?.length || 0);
      
      if (!result) {
        throw new Error('No response from AI');
      }

      console.log('🔥 [API] Returning result:', result.substring(0, 100) + '...');
      return NextResponse.json({ text: result });
      
    } catch (geminiError) {
      console.error('🔥 [API] Gemini API Error:', geminiError);
      console.error('🔥 [API] Full error details:', JSON.stringify(geminiError, null, 2));
      return NextResponse.json({ 
        error: 'Failed to process AI request',
        details: geminiError instanceof Error ? geminiError.message : String(geminiError)
      }, { status: 500 });
    }
    
  } catch (error) {
    console.error('[Generate Text API Error]:', error);
    return NextResponse.json(
      { 
        error: 'Failed to generate text',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
