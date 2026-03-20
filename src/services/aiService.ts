import { GoogleGenAI } from "@google/genai";
import { HARData, AnalysisResult } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

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
      const type = e.response.content.mimeType.split(';')[0];
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
      model: "gemini-2.5-flash",
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
