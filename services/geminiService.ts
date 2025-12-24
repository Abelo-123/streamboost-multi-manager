
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export const analyzeStream = async (streamTitle: string, streamDescription: string) => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
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
    model: "gemini-1.5-flash",
    contents: `Suggest a strategy for a moderator to boost engagement in a live stream about "${streamTopic}". 
    Provide 3 bullet points.`,
  });
  return response.text;
};

export const generateUniqueComments = async (streamTitle: string, count: number): Promise<string[]> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: `
        Generate exactly ${count} unique, short, and natural-sounding comments for a YouTube live stream titled: "${streamTitle}".
        The comments should be different from each other (some using emojis, some pure text, some being questions).
        Provide the output as a simple list, one comment per line, No numbering.
      `,
    });

    return response.text.split('\n').filter(line => line.trim().length > 0).slice(0, count);
  } catch (error) {
    console.error("Gemini Variations Error:", error);
    return Array(count).fill("Great stream! 🔥");
  }
};
