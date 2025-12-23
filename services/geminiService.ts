
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export const analyzeStream = async (streamTitle: string, streamDescription: string) => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `
        Analyze this YouTube live stream and provide a concise summary (2 sentences max) 
        and 3 suggested engaging comments for the audience.
        Title: ${streamTitle}
        Description: ${streamDescription}
      `,
    });

    return response.text;
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Could not analyze stream at this time.";
  }
};

export const generateEngagementStrategy = async (streamTopic: string) => {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Suggest a strategy for a moderator to boost engagement in a live stream about "${streamTopic}". 
    Provide 3 bullet points.`,
  });
  return response.text;
};
