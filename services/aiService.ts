import { GoogleGenAI } from "@google/genai";
import type { Candle, DetectedPattern } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const formatCandleDataForPrompt = (candles: Candle[]): string => {
    // Only take the last 50 candles to keep the prompt concise yet informative
    const recentCandles = candles.slice(-50);
    let dataString = "time,open,high,low,close,volume\n";
    dataString += recentCandles.map(c =>
        `${new Date(c.time * 1000).toISOString()},${c.open.toFixed(4)},${c.high.toFixed(4)},${c.low.toFixed(4)},${c.close.toFixed(4)},${c.volume.toFixed(2)}`
    ).join('\n');
    return dataString;
};

export const getTradingStrategy = async (
    candles: Candle[],
    pattern: DetectedPattern,
    t: (key: string) => string,
    locale: 'en' | 'zh'
): Promise<string> => {
    // Ensure we only use data up to and including the signal candle
    const historicalCandles = candles.slice(0, pattern.index + 1);
    const candleDataString = formatCandleDataForPrompt(historicalCandles);

    const languageInstruction = locale === 'zh'
        ? '你的全部回答都必须使用中文。'
        : 'Your entire response must be in English.';

    const analystRole = locale === 'zh'
        ? '你是一位专门研究纯粹价格行为的专家级交易分析师，方法类似于Al Brooks。'
        : 'You are an expert trading analyst specializing in pure price action, similar to the methods of Al Brooks.';

    const prompt = `
${languageInstruction}

${analystRole}
Your analysis must be based *strictly* on the historical K-line data provided. Do not use any external knowledge or assume any future price movements. Your entire analysis must be derived from the data ending at the last provided candle.

**Context:**
- A "${t(pattern.name)}" pattern was detected.
- Description: "${t(pattern.description)}".
- The signal occurred on the candle at index ${pattern.index}.

**Historical Data (last 50 bars leading up to and including the signal):**
\`\`\`
${candleDataString}
\`\`\`

**Task:**
Based *only* on the data provided, generate a comprehensive trading strategy for this signal. The strategy should be detailed, objective, and cautious. Structure your response in markdown format with the following sections using '###' for headings:

### Market Context Analysis
Briefly describe the price action leading up to the signal (e.g., was it a strong trend, a trading range, a pullback?).

### Signal Strength
Evaluate the quality of the specific "${t(pattern.name)}" signal. Consider its shape, size, and where it formed in the immediate market context.

### Entry Strategy
Propose a specific entry point. For example, "Enter on a buy stop order one tick above the high of the signal bar." Be precise.

### Stop-Loss Placement
Propose a specific and logical stop-loss placement. For example, "Place a stop-loss one tick below the low of the signal bar."

### Profit Targets
Suggest potential profit targets. These should be based on prior support/resistance levels or measured moves visible in the provided data. Suggest at least two potential targets.

### Risk Management
Briefly mention the risk-reward ratio for the initial target and advise on trade management (e.g., moving the stop-loss to break-even).

**Crucial Instruction:** Do not invent any outcomes or predict the future. Your response must be a strategic plan based on the fixed historical data provided.
`;

    try {
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
        });
        return response.text;
    } catch (error) {
        console.error("Error calling Gemini API:", error);
        throw new Error("Failed to get a strategy from the AI.");
    }
};