import { GoogleGenAI, Type } from "@google/genai";
import type { Candle, DetectedPattern, MarketType, RiskAppetite, AIDecision, MultiTimeframeData } from '../types';
import { TIMEFRAMES } from "../constants";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const formatCandleDataForPrompt = (candles: Candle[], count: number = 50): string => {
    const recentCandles = candles.slice(-count);
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

    const systemInstruction = `${languageInstruction} ${analystRole} Your analysis must be based *strictly* on the historical K-line data provided. Do not use any external knowledge or assume any future price movements. Your entire analysis must be derived from the data ending at the last provided candle.`;

    const userPrompt = `
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
            // FIX: Updated model to gemini-2.5-flash per guidelines.
            model: 'gemini-2.5-flash',
            contents: userPrompt,
            config: {
                systemInstruction: systemInstruction,
            },
        });
        return response.text;
    } catch (error) {
        console.error("Error calling Gemini API for strategy:", error);
        throw new Error("Failed to get a strategy from the AI.");
    }
};

const formatMultiTimeframeDataForPrompt = (multiTimeframeData: MultiTimeframeData[]): string => {
    let promptString = "";
    // Sort timeframes from highest to lowest for top-down analysis
    const sortedData = [...multiTimeframeData].sort((a, b) => {
        const aIndex = TIMEFRAMES.findIndex(tf => tf.value === a.timeframe);
        const bIndex = TIMEFRAMES.findIndex(tf => tf.value === b.timeframe);
        return bIndex - aIndex;
    });

    for (const data of sortedData) {
        promptString += `--- ${data.timeframe} Timeframe ${data.isPrimary ? '(Primary Chart)' : ''} ---\n`;
        // Get the last 5 detected signals, newest first
        const recentPatterns = data.patterns.slice(-5).reverse();
        
        if (recentPatterns.length > 0) {
            promptString += `**Recent Signals Detected:**\n`;
            promptString += recentPatterns.map(p => `- ${p.name} (${p.direction}) on ${new Date(p.candle.time * 1000).toISOString()}`).join('\n');
            promptString += `\n\n`;
        } else {
            promptString += `**Recent Signals Detected:** None\n\n`;
        }

        const candleCount = data.isPrimary ? 100 : 50;
        promptString += `**K-line Data (last ${candleCount} bars):**\n`;
        promptString += formatCandleDataForPrompt(data.candles, candleCount);
        promptString += `\n\n`;
    }
    return promptString;
};


export const getTradingDecision = async (
    multiTimeframeData: MultiTimeframeData[],
    symbol: string,
    marketType: MarketType,
    riskAppetite: RiskAppetite,
    positionSize: number,
    leverage: number,
    locale: 'en' | 'zh'
): Promise<AIDecision> => {
    
    const primaryTimeframe = multiTimeframeData.find(d => d.isPrimary)?.timeframe || 'N/A';
    const multiTimeframeDataString = formatMultiTimeframeDataForPrompt(multiTimeframeData);

    const languageInstruction = locale === 'zh'
        ? '你的全部回答都必须使用中文。JSON 字段名除外。'
        : 'Your entire response must be in English, except for JSON field names.';
    
    const systemInstruction = `
${languageInstruction}
You are a professional, data-driven crypto trading advisor. Your analysis is based solely on the provided K-line data from multiple timeframes and user-defined parameters.
You must adopt a cautious and risk-aware tone.
Your methodology is to perform a top-down analysis: first, establish the broader market context and trend from the highest timeframe provided. Then, use the lower timeframes to identify specific entry points, confirmations, and fine-tune your trade plan. Your reasoning must clearly state how the different timeframes influence your final decision.
You will always respond in a strict JSON format matching the provided schema. Do not include markdown formatting like \`\`\`json.
`;

    const prompt = `
**Task:**
Perform a top-down, multi-timeframe analysis based on the data below to provide a complete trading plan. Start by analyzing the highest timeframe to determine the overall market trend and key levels. Then, use the lower timeframes to refine your analysis and identify a precise trade setup. Your final decision must be a synthesis of all available information.

**Market Context:**
- Symbol: ${symbol}
- Primary Timeframe: ${primaryTimeframe}
${multiTimeframeDataString}

**User Parameters:**
- Market Type: ${marketType}
- Risk Appetite: ${riskAppetite}
- Position Size: ${positionSize} USDT
- Leverage: ${leverage}x (Note: 1x for SPOT)

**Instructions:**
- If making a 'LONG' or 'SHORT' call, provide specific, actionable price levels.
- If the timeframes are conflicting or the setup is unclear, the correct decision is 'WAIT'. Explain what conditions would need to change for you to consider a trade.
- Your reasoning must explicitly reference how the different timeframes contribute to your conclusion (e.g., "The daily chart shows a strong uptrend, and the 4-hour chart has just printed a bullish hammer at a key support level, suggesting a good long entry.").
- The confidence score must reflect the alignment (or lack thereof) between the different timeframes.
`;

    const schema = {
        type: Type.OBJECT,
        properties: {
            decision: { type: Type.STRING, enum: ['LONG', 'SHORT', 'WAIT'], description: 'The final trading decision.' },
            reasoning: {
                type: Type.STRING,
                description: locale === 'zh'
                    ? '导致该决策的当前市场结构和价格行为的简明分析。'
                    : 'Concise analysis of the current market structure and price action leading to the decision.'
            },
            entryPrice: { type: Type.STRING, description: 'Suggested entry price. Can be "Market", "Above [price]", "Below [price]", or a specific value. "N/A" for WAIT.' },
            stopLoss: { type: Type.NUMBER, description: 'Specific price for the stop-loss order. 0 for WAIT.' },
            takeProfitLevels: {
                type: Type.ARRAY,
                items: { type: Type.NUMBER },
                description: 'An array of at least two take-profit price levels. Empty array for WAIT.'
            },
            confidenceScore: { type: Type.INTEGER, description: 'A score from 1 (low) to 10 (high) indicating the strength of the trading setup.' },
            riskWarning: {
                type: Type.STRING,
                description: locale === 'zh'
                    ? '关于此特定交易想法风险的简短具体警告。'
                    : 'A brief, specific warning about the risks of this particular trade idea.'
            },
        },
        required: ['decision', 'reasoning', 'entryPrice', 'stopLoss', 'takeProfitLevels', 'confidenceScore', 'riskWarning']
    };

    try {
        const response = await ai.models.generateContent({
            // FIX: Updated model to gemini-2.5-flash per guidelines.
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                systemInstruction,
                responseMimeType: 'application/json',
                responseSchema: schema
            }
        });

        const jsonText = response.text.trim();
        return JSON.parse(jsonText) as AIDecision;
    } catch (error) {
        console.error("Error calling Gemini API for decision:", error);
        throw new Error("Failed to get a decision from the AI.");
    }
};