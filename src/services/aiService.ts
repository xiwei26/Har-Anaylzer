import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { HARData, AnalysisResult, Message } from "../types";
import { getSanitizedAIContext, sanitizeUrl } from "../utils/sanitizer";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function* chatWithAI(har: HARData, messages: Message[]): AsyncGenerator<string> {
  const entries = har.log.entries;
  
  // Intelligent prioritized context with sensitive tokens sanitized
  const contextData = getSanitizedAIContext(entries, 50);

  const systemInstruction = `
    You are an expert network and performance analyst. You have access to a prioritized, sanitized summary of network requests from an analyzed HAR file (including critical errors, slowest requests, largest payloads, and representative traffic).
    Use this data to answer user questions about network performance, failed requests, headers, timing bottlenecks, and optimization opportunities.
    
    Network Context (Prioritized & Sanitized Samples):
    ${JSON.stringify(contextData, null, 2)}
    
    Total Session Requests: ${entries.length}
    Total Failed Requests (>=400): ${entries.filter(e => e.response.status >= 400).length}
    
    Be concise, technical, and accurate. Format your response with clear Markdown.
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
  
  // Prepare sanitized diagnostic data
  const summaryData = {
    totalRequests: entries.length,
    failedRequests: entries.filter(e => e.response.status >= 400).length,
    slowRequests: entries
      .filter(e => e.time > 1000)
      .sort((a, b) => b.time - a.time)
      .map(e => ({
        url: sanitizeUrl(e.request.url).substring(0, 120),
        method: e.request.method,
        time: Math.round(e.time),
        status: e.response.status
      }))
      .slice(0, 15),
    errors: entries
      .filter(e => e.response.status >= 400)
      .map(e => ({
        url: sanitizeUrl(e.request.url).substring(0, 120),
        method: e.request.method,
        status: e.response.status,
        statusText: e.response.statusText
      }))
      .slice(0, 15),
    mimeTypeDistribution: entries.reduce((acc: any, e) => {
      const type = (e.response.content.mimeType || 'unknown').split(';')[0];
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {})
  };

  const prompt = `
    Analyze this network traffic summary from a HAR file and identify broken parts, bottlenecks, and provide actionable advice.
    
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
    const totalSize = entries.reduce((acc, e) => acc + (e.response.content.size || 0), 0);
    const totalTime = entries.reduce((acc, e) => acc + e.time, 0);
    
    return {
      summary: {
        totalRequests: entries.length,
        failedRequests: summaryData.failedRequests,
        totalSize: result.summary?.totalSize || totalSize,
        totalTime: result.summary?.totalTime || totalTime,
        avgResponseTime: result.summary?.avgResponseTime || (entries.length ? totalTime / entries.length : 0)
      },
      issues: result.issues || [],
      advice: result.advice || "No specific advice generated."
    };
  } catch (error) {
    console.error("AI Analysis failed:", error);
    throw error;
  }
}
