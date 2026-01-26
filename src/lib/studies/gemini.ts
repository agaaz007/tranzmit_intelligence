import { SYSTEM_PROMPT } from "./systemPrompt";

export interface Question {
  id: number;
  text: string;
  followUps: string[];
  rationale: string;
  type: string;
  questionType?: string;
  followUpMode?: string;
  inputType?: string;
}

export interface UIUpdate {
  objective?: string;
  audience_tags?: string[];
  exclusions?: string[];
  questions?: Question[];
}

export interface GeminiResponse {
  chat_reply: string;
  ui_update: UIUpdate;
}

export interface Message {
  role: 'ai' | 'user';
  content: string;
}

export const repromptSingleQuestion = async (
  question: Question,
  userInstructions: string,
  objective: string,
  apiKey: string
): Promise<Partial<Question>> => {
  if (!apiKey) {
    throw new Error("API Key is missing");
  }

  const prompt = `You are improving a single discussion guide question for qualitative research.

Research Objective: "${objective}"

Current Question:
- Main: "${question.text}"
- Follow-ups: ${JSON.stringify(question.followUps || [])}
- Rationale: "${question.rationale || ''}"

User's Improvement Request: "${userInstructions}"

Return ONLY valid JSON with the improved question:
{
  "text": "Improved main question (open-ended, conversational)",
  "followUps": ["Probing follow-up 1", "Probing follow-up 2", "Probing follow-up 3"],
  "rationale": "Brief explanation of why this question matters"
}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API Error:", errorText);
      throw new Error(`API request failed: ${response.status}`);
    }

    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error("Empty response from API");
    }

    return JSON.parse(text);
  } catch (error) {
    console.error("Reprompt error:", error);
    throw error;
  }
};

export const callGemini = async (
  userMessage: string,
  currentHistory: Message[] = [],
  apiKey: string
): Promise<GeminiResponse> => {
  if (!apiKey) {
    throw new Error("API Key is missing");
  }

  // Map history to Gemini REST API format
  const contents = currentHistory.map(msg => ({
    role: msg.role === 'ai' ? 'model' : 'user',
    parts: [{ text: msg.content }]
  }));

  // Add the new user message to the contents
  contents.push({
    role: 'user',
    parts: [{ text: userMessage }]
  });

  // Using gemini-2.5-flash-lite as requested
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: SYSTEM_PROMPT }]
        },
        contents: contents,
        generationConfig: {
          responseMimeType: "application/json"
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API Error Details:", errorText);
      throw new Error(`Gemini API request failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const result = await response.json();

    // Extract text from the response structure
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error("Received empty response from Gemini API");
    }

    console.log("Raw Gemini Response:", text);

    try {
      const json = JSON.parse(text);
      return json;
    } catch {
      console.error("JSON Parse Error");
      // Fallback for non-JSON responses
      return {
        chat_reply: text,
        ui_update: {}
      };
    }

  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};
