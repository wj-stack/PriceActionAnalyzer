
import type { BinanceKline, Candle } from '../types';

const API_BASE_URL = 'https://api1.binance.com/api/v3/klines';
const EXCHANGE_INFO_URL = 'https://api1.binance.com/api/v3/exchangeInfo';
const WEBSOCKET_BASE_URL = 'wss://stream.binance.com:443/ws';

// --- Type definitions for Exchange Info ---
interface BinanceSymbol {
    symbol: string;
    status: string;
    baseAsset: string;
    quoteAsset: string;
    isSpotTradingAllowed: boolean;
}

interface ExchangeInfo {
    symbols: BinanceSymbol[];
}

// --- Type definition for WebSocket Kline data ---
interface BinanceWsKline {
  t: number; // Kline start time
  T: number; // Kline close time
  s: string; // Symbol
  i: string; // Interval
  o: string; // Open price
  c: string; // Close price
  h: string; // High price
  l: string; // Low price
  v: string; // Base asset volume
  x: boolean; // Is this kline closed?
}


/**
 * Fetches a combined list of symbols from Binance Spot.
 * It filters for trading pairs against major stablecoins
 * and sorts them, pinning major pairs to the top.
 */
export const fetchExchangeInfo = async (): Promise<{ value: string; label: string; }[]> => {
    try {
        const spotExchangeInfoResponse = await fetch(EXCHANGE_INFO_URL);

        // Error handling for spot exchange info
        if (!spotExchangeInfoResponse.ok) {
            const curlCommand = `curl "${EXCHANGE_INFO_URL}"`;
            console.error("Public API request failed (exchangeInfo). Debug with curl:");
            console.error(curlCommand);
            throw new Error(`Binance API Error: ${spotExchangeInfoResponse.status} ${spotExchangeInfoResponse.statusText}`);
        }
        const spotData: ExchangeInfo = await spotExchangeInfoResponse.json();

        const ALLOWED_QUOTE_ASSETS = ['USDT', 'FDUSD', 'USDC', 'TUSD']; 

        // Process standard spot market symbols
        const spotSymbols = spotData.symbols
            .filter(s => 
                ALLOWED_QUOTE_ASSETS.includes(s.quoteAsset) && 
                s.status === 'TRADING' &&
                s.isSpotTradingAllowed
            )
            .map(s => {
                return {
                    value: s.symbol,
                    label: `${s.baseAsset}/${s.quoteAsset}`,
                    quoteAsset: s.quoteAsset,
                };
            });

        const pinned = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'];
        const pinnedSymbols: (typeof spotSymbols[0] | undefined)[] = new Array(pinned.length);
        const otherSymbols: typeof spotSymbols = [];

        for (const pair of spotSymbols) {
            const index = pinned.indexOf(pair.value);
            if (index > -1) {
                pinnedSymbols[index] = pair;
            } else {
                otherSymbols.push(pair);
            }
        }
        
        otherSymbols.sort((a, b) => {
            if (a.quoteAsset !== b.quoteAsset) {
                const aIndex = ALLOWED_QUOTE_ASSETS.indexOf(a.quoteAsset);
                const bIndex = ALLOWED_QUOTE_ASSETS.indexOf(b.quoteAsset);
                if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
                if (aIndex !== -1) return -1;
                if (bIndex !== -1) return 1;
            }
            return a.label.localeCompare(b.label);
        });

        const finalPinned = pinnedSymbols.filter((p): p is typeof spotSymbols[0] => Boolean(p));
        const finalResult = [...finalPinned, ...otherSymbols].map(({ quoteAsset, ...rest }) => rest);

        return finalResult;

    } catch (error) {
        // Avoid double-logging if we already logged the curl command for a non-ok response
        if (!(error instanceof Error && error.message.startsWith('Binance API Error:'))) {
            const curlCommand = `curl "${EXCHANGE_INFO_URL}"`;
            console.error("Public API request failed at network level (exchangeInfo). Debug with curl:");
            console.error(curlCommand);
        }
        console.error('Failed to fetch combined exchange info:', error);
        throw error;
    }
};

// Helper to map Binance REST API Kline data to our Candle format
const mapBinanceRestKlineToCandle = (kline: BinanceKline): Candle => {
    const open = parseFloat(kline[1]);
    const close = parseFloat(kline[4]);
    return {
        time: Number(kline[0]) / 1000, // convert ms to seconds for charting libraries
        open: open,
        high: parseFloat(kline[2]),
        low: parseFloat(kline[3]),
        close: close,
        volume: parseFloat(kline[5]),
        isBullish: close >= open,
        isClosed: true, // Historical data is always closed
    };
};

// Helper to map Binance WebSocket Kline data to our Candle format
const mapBinanceWsKlineToCandle = (kline: BinanceWsKline): Candle => {
    const open = parseFloat(kline.o);
    const close = parseFloat(kline.c);
    return {
        time: kline.t / 1000, // convert ms to seconds
        open: open,
        high: parseFloat(kline.h),
        low: parseFloat(kline.l),
        close: close,
        volume: parseFloat(kline.v),
        isBullish: close >= open,
        isClosed: kline.x,
    };
};

/**
 * Fetches historical k-line data from Binance.
 * This function is optimized to fetch data in multiple batches if the requested range or limit is large.
 * It operates in two modes:
 * 
 * 1. Date Range Mode: Triggered when `startTime` is provided. It fetches all available k-lines between 
 *    `startTime` and `endTime`. The `limit` parameter is ignored. This is ideal for historical analysis
 *    and backtesting over a specific period. It fetches data chronologically (forward in time).
 * 
 * 2. Limit Mode: Triggered when `startTime` is NOT provided. It fetches the most recent `limit` k-lines.
 *    This is useful for getting the latest market context for real-time analysis. It fetches data
 *    backwards in time for efficiency.
 */
export const fetchKlines = async (symbol: string, interval: string, limit: number = 1000, startTime?: number, endTime?: number): Promise<Candle[]> => {
    let allKlines: BinanceKline[] = [];
    const limitPerRequest = 1000; // Max items per request for Binance API

    // --- Date Range Mode ---
    if (startTime) {
        let currentStartTime = startTime;
        const finalEndTime = endTime || Date.now();

        while (currentStartTime < finalEndTime) {
            const url = new URL(API_BASE_URL);
            url.searchParams.append('symbol', symbol);
            url.searchParams.append('interval', interval);
            url.searchParams.append('limit', String(limitPerRequest));
            url.searchParams.append('startTime', String(currentStartTime));
            
            try {
                const response = await fetch(url.toString());
                if (!response.ok) {
                    const curlCommand = `curl "${url.toString()}"`;
                    console.error("Public API request failed (klines). Debug with curl:");
                    console.error(curlCommand);
                    throw new Error(`Binance API Error: ${response.status} ${response.statusText}`);
                }

                const klineData: BinanceKline[] = await response.json();
                if (!Array.isArray(klineData)) {
                    throw new Error(`Invalid data structure received from Klines API.`);
                }
                
                // Break condition: API has no more data for this period.
                if (klineData.length === 0) {
                    break;
                }

                allKlines = allKlines.concat(klineData);
                
                // Set up the next request to fetch data from after the current chunk.
                // The API returns klines with open time [t, t+interval). So the next start time is the last candle's close time + 1ms.
                const lastCandleCloseTime = klineData[klineData.length - 1][6];
                currentStartTime = lastCandleCloseTime + 1;

                // Break condition: The last batch was not full, so we're at the end of the data.
                if (klineData.length < limitPerRequest) {
                    break;
                }

            } catch (error) {
                const curlCommand = `curl "${url.toString()}"`;
                console.error("Public API request failed at network level (klines). Debug with curl:");
                console.error(curlCommand);
                console.error(`Failed to fetch k-line data:`, error, "url", url.toString());
                throw error;
            }
        }
    } 
    // --- Limit Mode ---
    else {
        let currentEndTime = endTime || Date.now();
        
        while (allKlines.length < limit) {
            const url = new URL(API_BASE_URL);
            url.searchParams.append('symbol', symbol);
            url.searchParams.append('interval', interval);
            
            const remaining = limit - allKlines.length;
            const currentRequestLimit = Math.min(remaining, limitPerRequest);
            url.searchParams.append('limit', String(currentRequestLimit));
            url.searchParams.append('endTime', String(currentEndTime));

            try {
                const response = await fetch(url.toString());
                if (!response.ok) {
                    const curlCommand = `curl "${url.toString()}"`;
                    console.error("Public API request failed (klines). Debug with curl:");
                    console.error(curlCommand);
                    throw new Error(`Binance API Error: ${response.status} ${response.statusText}`);
                }
    
                const klineData: BinanceKline[] = await response.json();
                if (!Array.isArray(klineData)) {
                    throw new Error(`Invalid data structure received from Klines API.`);
                }
                
                // Break condition: API has no more historical data.
                if (klineData.length === 0) {
                    break;
                }

                allKlines = [...klineData, ...allKlines]; // Prepend the older data chunk.

                // Set up the next request to fetch data from before the current chunk.
                const firstCandleTimeInChunk = klineData[0][0];
                currentEndTime = firstCandleTimeInChunk - 1;

            } catch (error) {
                 const curlCommand = `curl "${url.toString()}"`;
                 console.error("Public API request failed at network level (klines). Debug with curl:");
                 console.error(curlCommand);
                 console.error(`Failed to fetch k-line data:`, error, "url", url.toString());
                 throw error;
            }
        }
    }

    // De-duplicate any potential overlapping candles and ensure sorting.
    const uniqueKlinesMap = new Map<number, BinanceKline>();
    for (const kline of allKlines) {
        // In Date Range mode, strictly enforce the time bounds, just in case API returned something outside.
        if (startTime && kline[0] < startTime) continue;
        if (endTime && kline[0] > endTime) continue;
        uniqueKlinesMap.set(kline[0], kline);
    }
    
    let sortedKlines = Array.from(uniqueKlinesMap.values()).sort((a, b) => a[0] - b[0]);

    // In Limit mode, ensure we don't return more than requested, taking the most recent ones.
    if (!startTime && sortedKlines.length > limit) {
        sortedKlines = sortedKlines.slice(-limit);
    }

    return sortedKlines.map(mapBinanceRestKlineToCandle);
};


/**
 * Subscribes to a WebSocket k-line stream for real-time updates.
 * @param symbol The trading symbol (e.g., 'BTCUSDT').
 * @param interval The timeframe interval (e.g., '1h').
 * @param onMessageCallback A function to call with the updated Candle data.
 * @returns A cleanup function to close the WebSocket connection.
 */
export const subscribeToKlineStream = (
    symbol: string,
    interval: string,
    onMessageCallback: (candle: Candle, streamSymbol: string) => void
): (() => void) => {
    const ws = new WebSocket(`${WEBSOCKET_BASE_URL}/${symbol.toLowerCase()}@kline_${interval}`);

    ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.k) { // 'k' is the key for kline data in the message
            const candle = mapBinanceWsKlineToCandle(message.k);
            onMessageCallback(candle, message.s);
        }
    };

    ws.onerror = (error) => {
        console.error('WebSocket Error:', error);
    };

    ws.onclose = () => {
        console.log(`WebSocket disconnected for ${symbol}@kline_${interval}`);
    };
    
    console.log(`WebSocket connected for ${symbol}@kline_${interval}`);

    // Return a cleanup function to be called on component unmount or dependency change
    return () => {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            ws.close();
        }
    };
};
