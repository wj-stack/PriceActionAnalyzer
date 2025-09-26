

import type { BinanceKline, Candle } from '../types';

const API_BASE_URL = 'https://api.binance.com/api/v3/klines';
const EXCHANGE_INFO_URL = 'https://api.binance.com/api/v3/exchangeInfo';
const WEBSOCKET_BASE_URL = 'wss://stream.binance.com:9443/ws';

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
 * Fetches historical k-line data within a specified date range, paginating backwards from the end time.
 */
export const fetchKlines = async (symbol: string, interval: string, limit: number = 1000, startTime?: number, endTime?: number): Promise<Candle[]> => {
    let allKlines: BinanceKline[] = [];
    let currentEndTime = endTime || Date.now();
    const limitPerRequest = 1000;

    // Fetch data in chunks backwards from the end time until we hit the start time or the specified limit.
    while (true) {
        const url = new URL(API_BASE_URL);
        url.searchParams.append('symbol', symbol);
        url.searchParams.append('interval', interval);
        url.searchParams.append('limit', String(limitPerRequest));
        url.searchParams.append('endTime', String(currentEndTime));
        
        if (startTime) {
            url.searchParams.append('startTime', String(startTime));
        }

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

            if (klineData.length === 0) {
                break; // No more data in this range.
            }
            
            allKlines = [...klineData, ...allKlines];
            
            const firstCandleTime = klineData[0][0];

            // Stop if we've fetched data from before our desired start time.
            if (startTime && firstCandleTime <= startTime) {
                break;
            }
            
            // Set the end time for the next older chunk.
            currentEndTime = firstCandleTime - 1;

        } catch (error) {
            const curlCommand = `curl "${url.toString()}"`;
            console.error("Public API request failed at network level (klines). Debug with curl:");
            console.error(curlCommand);
            console.error(`Failed to fetch k-line data:`, error, "url", url.toString());
            throw error;
        }
    }
    
    // De-duplicate candles and filter again to ensure we are strictly within bounds.
    const uniqueKlinesMap = new Map<number, BinanceKline>();
    for (const kline of allKlines) {
        if (startTime && kline[0] < startTime) continue;
        if (endTime && kline[0] > endTime) continue;
        uniqueKlinesMap.set(kline[0], kline);
    }
    
    const sortedKlines = Array.from(uniqueKlinesMap.values()).sort((a, b) => a[0] - b[0]);

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
    onMessageCallback: (candle: Candle) => void
): (() => void) => {
    const ws = new WebSocket(`${WEBSOCKET_BASE_URL}/${symbol.toLowerCase()}@kline_${interval}`);

    ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.k) { // 'k' is the key for kline data in the message
            const candle = mapBinanceWsKlineToCandle(message.k);
            onMessageCallback(candle);
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