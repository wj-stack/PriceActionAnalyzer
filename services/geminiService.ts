
import { GoogleGenAI } from "@google/genai";
import { MultiTimeframeDataPoint } from '../types';

export interface AnalysisContext {
  symbol: string;
  timeframes: MultiTimeframeDataPoint[];
}

export const getTradingAnalysis = async (context: AnalysisContext): Promise<string> => {
  if (!process.env.API_KEY) {
    console.error("API_KEY environment variable not set.");
    return "Error: API key is not configured. Please contact support.";
  }
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const contextString = context.timeframes.map(tf => 
    `- **${tf.name}**: Trend is **${tf.trend}**, RSI is **${tf.rsi}**.`
  ).join('\n');

  const prompt = `You are an expert price action trading analyst. Your goal is to provide a multi-timeframe analysis for the symbol ${context.symbol}.

**Your Core Strategy:**
1.  **High-Timeframe Context (4h, 1d):** Use these to establish the dominant market trend and bias. An uptrend on a higher timeframe (HTF) means you should primarily look for long entries on a lower timeframe (LTF).
2.  **Low-Timeframe Confirmation (Current Chart):** Use the current chart timeframe to find specific entry points that align with the HTF bias.
3.  **Confluence is Key:** The best trades occur when an LTF signal happens at a key HTF level of support or resistance.

**Current Market Data:**
${contextString}

**Your Task:**
Based *only* on the Trend and RSI data provided, generate a concise trading analysis.
1.  **Summarize the Multi-Timeframe Outlook:** Is there a clear alignment across timeframes (e.g., all bullish)? Or is the market conflicting (e.g., HTF bullish, LTF bearish)?
2.  **Propose a Primary Bias:** Should a trader be looking for **Longs**, **Shorts**, or remain **Neutral** and wait for more clarity?
3.  **Outline a Potential Action Plan:** Based on your bias, what should a trader look for next? Be specific. (e.g., "Wait for a pullback on the ${context.timeframes[0].name} chart and look for bullish confirmation patterns as long as the 4h trend remains bullish.").

Structure your response with these exact headings in markdown bold: **Outlook**, **Bias**, and **Action Plan**. Keep it brief and actionable. Do not invent data that was not provided.`;
  
  console.log("[GeminiService] Sending prompt to AI:", prompt);

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    console.log("[GeminiService] Received raw response from AI:", response.text);
    return response.text;
  } catch (error) {
    console.error("[GeminiService] Gemini API call failed:", error);
    throw new Error("Failed to get analysis from AI service.");
  }
};
