import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { HARData, AnalysisResult, Message } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function* chatWithAI(har: HARData, messages: Message[]): AsyncGenerator<string> {
  const entries = har.log.entries;
  
  // Prepare a condensed version of the HAR for the AI context
  const contextData = entries.map(e => ({
    url: e.request.url.substring(0, 150),
    method: e.request.method,
    status: e.response.status,
    time: Math.round(e.time),
    size: e.response.content.size,
    type: (e.response.content.mimeType || 'unknown').split(';')[0]
  })).slice(0, 50); // Limit to first 50 entries to avoid token limits

  const systemInstruction = `
    You are an expert network analyst. You have access to a summary of network requests from a HAR file.
    Use this data to answer user questions about the network traffic, performance, errors, or specific requests.
    
    Network Context (First 50 requests):
    ${JSON.stringify(contextData, null, 2)}
    
    Be concise and technical. Use Markdown for formatting.
  `;

  const contents = messages.map(m => ({
    role: m.role,
    parts: [{ text: m.content }]
  }));

  try {
    const stream = await ai.models.generateContentStream({
      model: "gemini-3-flash-preview",
      contents,
      config: {
        systemInstruction
      }
    });

    for await (const chunk of stream) {
      const c = chunk as GenerateContentResponse;
      if (c.text) {
        yield c.text;
      }
    }
  } catch (error) {
    console.error("AI Chat failed:", error);
    yield "I'm sorry, I encountered an error while processing your request.";
  }
}

export async function analyzeHARWithAI(har: HARData): Promise<AnalysisResult> {
  const entries = har.log.entries;
  
  // Prepare a condensed version of the HAR for the AI
  const summaryData = {
    totalRequests: entries.length,
    failedRequests: entries.filter(e => e.response.status >= 400).length,
    slowRequests: entries.filter(e => e.time > 1000).map(e => ({
      url: e.request.url.substring(0, 100),
      time: e.time,
      status: e.response.status
    })).slice(0, 10),
    errors: entries.filter(e => e.response.status >= 400).map(e => ({
      url: e.request.url.substring(0, 100),
      status: e.response.status,
      statusText: e.response.statusText
    })).slice(0, 10),
    mimeTypeDistribution: entries.reduce((acc: any, e) => {
      const type = (e.response.content.mimeType || 'unknown').split(';')[0];
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {})
  };

  const prompt = `
    Analyze this network traffic summary from a HAR file and identify broken parts, bottlenecks, and provide advice.
    
    Summary:
    ${JSON.stringify(summaryData, null, 2)}
    
    Return a JSON object with the following structure:
    {
      "summary": {
        "totalRequests": number,
        "failedRequests": number,
        "totalSize": number (in bytes),
        "totalTime": number (in ms),
        "avgResponseTime": number (in ms)
      },
      "issues": [
        { "type": "error" | "warning" | "info", "title": string, "description": string, "affectedUrl": string }
      ],
      "advice": "Markdown formatted advice string"
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    const result = JSON.parse(response.text || "{}");
    
    // Supplement with calculated data if AI missed some fields
    const totalSize = entries.reduce((acc, e) => acc + e.response.content.size, 0);
    const totalTime = entries.reduce((acc, e) => acc + e.time, 0);
    
    return {
      summary: {
        totalRequests: entries.length,
        failedRequests: summaryData.failedRequests,
        totalSize: result.summary?.totalSize || totalSize,
        totalTime: result.summary?.totalTime || totalTime,
        avgResponseTime: result.summary?.avgResponseTime || (totalTime / entries.length)
      },
      issues: result.issues || [],
      advice: result.advice || "No specific advice generated."
    };
  } catch (error) {
    console.error("AI Analysis failed:", error);
    throw error;
  }
}
