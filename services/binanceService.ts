
import type { BinanceKline, Candle } from '../types';

const API_BASE_URL = 'https://api.binance.com/api/v3/klines';
const EXCHANGE_INFO_URL = 'https://api.binance.com/api/v3/exchangeInfo';


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

// Helper to map Binance Kline data to our Candle format
const mapBinanceKlineToCandle = (kline: BinanceKline): Candle => {
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
    };
};

export const fetchKlines = async (symbol: string, interval: string, limit: number = 1000, startTime?: number, endTime?: number): Promise<Candle[]> => {
    let url = `${API_BASE_URL}?symbol=${symbol}&interval=${interval}&limit=${limit}`;

    if (startTime) {
        url += `&startTime=${Math.floor(startTime)}`;
    }
    if (endTime) {
        url += `&endTime=${Math.floor(endTime)}`;
    }


    try {
        const response = await fetch(url);
        if (!response.ok) {
            const curlCommand = `curl "${url}"`;
            console.error("Public API request failed (klines). Debug with curl:");
            console.error(curlCommand);
            throw new Error(`Binance API Error: ${response.status} ${response.statusText}`);
        }
        
        const klineData: BinanceKline[] = await response.json();

        if (!Array.isArray(klineData)) {
             throw new Error(`Invalid data structure received from Klines API.`);
        }

        return klineData.map(mapBinanceKlineToCandle);

    } catch (error) {
        // Avoid double-logging if we already logged the curl command for a non-ok response
        if (!(error instanceof Error && error.message.startsWith('Binance API Error:'))) {
            const curlCommand = `curl "${url}"`;
            console.error("Public API request failed at network level (klines). Debug with curl:");
            console.error(curlCommand);
        }
        console.error(`Failed to fetch k-line data:`, error, "url", url);
        throw error;
    }
};
