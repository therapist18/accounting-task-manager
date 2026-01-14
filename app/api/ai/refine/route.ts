import { API_KEYS } from '@/lib/apiKeys';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function POST(request: Request) {
    try {
        console.log('🔥 [API] AI Refine endpoint called');
        
        const { prompt, fieldName } = await request.json();
        console.log('🔥 [API] Received prompt:', prompt);
        console.log('🔥 [API] Field name:', fieldName);
        console.log('🔥 [API] Gemini API Key available:', !!API_KEYS);
        
        if (!prompt) {
            return Response.json({ error: 'Prompt is required' }, { status: 400 });
        }

        const genAI = new GoogleGenerativeAI(API_KEYS[2] || '');
        const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

        console.log(' [API] Calling Gemini model...');

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
            return Response.json({ result });
        } catch (geminiError) {
            console.error('🔥 [API] Gemini API Error:', geminiError);
            console.error('🔥 [API] Full error details:', JSON.stringify(geminiError, null, 2));
            return Response.json({ 
                error: 'Failed to process AI request',
                details: geminiError instanceof Error ? geminiError.message : String(geminiError)
            }, { status: 500 });
        }
    } catch (error: unknown) {
        console.error('[AI Refine API Error]:', error);
        return Response.json({ 
            error: 'Failed to process AI request',
            details: error instanceof Error ? error.message : String(error)
        }, { status: 500 });
    }
}
