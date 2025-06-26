// Gemini AI Document Extraction Service
// This would integrate with Google's Gemini API for document data extraction

export interface ExtractedData {
    [key: string]: string | number | Date
  }
  
  export interface ExtractionResult {
    success: boolean
    data?: ExtractedData
    error?: string
    confidence?: number
  }
  
  export class GeminiExtractionService {
    private apiKey: string
    private baseUrl = "https://generativelanguage.googleapis.com/v1beta"
  
    constructor(apiKey: string) {
      this.apiKey = apiKey
    }
  
    async extractDocumentData(file: File, documentType: string, expectedFields: string[]): Promise<ExtractionResult> {
      try {
        // Convert file to base64
        const base64Data = await this.fileToBase64(file)
  
        // Prepare the prompt based on document type
        const prompt = this.generateExtractionPrompt(documentType, expectedFields)
  
        // Call Gemini API
        const response = await fetch(`${this.baseUrl}/models/gemini-pro-vision:generateContent`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: prompt },
                  {
                    inline_data: {
                      mime_type: file.type,
                      data: base64Data,
                    },
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.1,
              topK: 32,
              topP: 1,
              maxOutputTokens: 1024,
            },
          }),
        })
  
        if (!response.ok) {
          throw new Error(`Gemini API error: ${response.statusText}`)
        }
  
        const result = await response.json()
        const extractedText = result.candidates[0]?.content?.parts[0]?.text
  
        if (!extractedText) {
          throw new Error("No text extracted from document")
        }
  
        // Parse the structured response
        const parsedData = this.parseExtractedData(extractedText)
  
        return {
          success: true,
          data: parsedData,
          confidence: 0.95, // This would come from the API response
        }
      } catch (error) {
        console.error("Document extraction failed:", error)
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error occurred",
        }
      }
    }
  
    private async fileToBase64(file: File): Promise<string> {
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.readAsDataURL(file)
        reader.onload = () => {
          const base64 = reader.result as string
          // Remove the data URL prefix
          resolve(base64.split(",")[1])
        }
        reader.onerror = reject
      })
    }
  
    private generateExtractionPrompt(documentType: string, expectedFields: string[]): string {
      const fieldsList = expectedFields.join(", ")
  
      return `
        You are a document data extraction specialist. Please analyze this ${documentType} document and extract the following information in JSON format:
        
        Expected fields: ${fieldsList}
        
        Instructions:
        1. Extract only the requested fields
        2. Return the data in valid JSON format
        3. Use null for missing or unclear fields
        4. For dates, use YYYY-MM-DD format
        5. Ensure all text is properly escaped
        
        Example response format:
        {
          "full_name": "John Doe",
          "passport_number": "P123456789",
          "date_of_birth": "1990-01-01",
          "nationality": "US",
          "issue_date": "2020-01-01",
          "expiry_date": "2030-01-01"
        }
        
        Please analyze the document and provide the extracted data:
      `
    }
  
    private parseExtractedData(extractedText: string): ExtractedData {
      try {
        // Try to find JSON in the response
        const jsonMatch = extractedText.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0])
        }
  
        // Fallback: parse key-value pairs
        const data: ExtractedData = {}
        const lines = extractedText.split("\n")
  
        for (const line of lines) {
          const colonIndex = line.indexOf(":")
          if (colonIndex > 0) {
            const key = line.substring(0, colonIndex).trim().toLowerCase().replace(/\s+/g, "_")
            const value = line
              .substring(colonIndex + 1)
              .trim()
              .replace(/['"]/g, "")
            if (value && value !== "null" && value !== "N/A") {
              data[key] = value
            }
          }
        }
  
        return data
      } catch (error) {
        console.error("Failed to parse extracted data:", error)
        return {}
      }
    }
  }
  
  // Mock implementation for development
  export class MockGeminiExtractionService {
    async extractDocumentData(file: File, documentType: string, expectedFields: string[]): Promise<ExtractionResult> {
      // Simulate API delay
      await new Promise((resolve) => setTimeout(resolve, 2000))
  
      // Return mock data based on document type
      const mockData = this.generateMockData(documentType, expectedFields)
  
      return {
        success: true,
        data: mockData,
        confidence: 0.92,
      }
    }
  
    private generateMockData(documentType: string, expectedFields: string[]): ExtractedData {
      const mockDataSets: { [key: string]: ExtractedData } = {
        passport: {
          full_name: "John Michael Doe",
          passport_number: "P987654321",
          date_of_birth: "1985-03-15",
          nationality: "US",
          issue_date: "2019-06-01",
          expiry_date: "2029-06-01",
          place_of_birth: "New York, USA",
        },
        academic_certificate: {
          full_name: "John Michael Doe",
          degree: "Bachelor of Science",
          institution: "University of Technology",
          graduation_date: "2007-05-20",
          gpa: "3.8",
        },
        employment_letter: {
          full_name: "John Michael Doe",
          employer: "Tech Solutions Inc.",
          position: "Senior Software Engineer",
          start_date: "2023-01-15",
          salary: "75000",
          employment_type: "Full-time",
        },
      }
  
      const baseData = mockDataSets[documentType.toLowerCase().replace(/\s+/g, "_")] || {}
  
      // Filter to only return expected fields
      const filteredData: ExtractedData = {}
      expectedFields.forEach((field) => {
        if (baseData[field]) {
          filteredData[field] = baseData[field]
        }
      })
  
      return filteredData
    }
  }
  