
import type { BinanceKline, Candle } from '../types';

const API_BASE_URL = 'https://api.binance.com/api/v3/klines';
const EXCHANGE_INFO_URL = 'https://api.binance.com/api/v3/exchangeInfo';


// --- Type definitions for Exchange Info ---
interface BinanceSymbol {
    symbol: string;
    status: string;
    baseAsset: string;
    quoteAsset: string;
}

interface ExchangeInfo {
    symbols: BinanceSymbol[];
}

/**
 * Fetches the list of all available symbols from Binance.
 * It filters for trading USDT pairs and sorts them, pinning major pairs to the top.
 */
export const fetchExchangeInfo = async (): Promise<{ value: string; label: string }[]> => {
    try {
        const response = await fetch(EXCHANGE_INFO_URL);
        if (!response.ok) {
            throw new Error(`Binance API Error: ${response.status} ${response.statusText}`);
        }
        const data: ExchangeInfo = await response.json();

        const usdtPairs = data.symbols
            .filter(s => s.quoteAsset === 'USDT' && s.status === 'TRADING')
            .map(s => ({
                value: s.symbol,
                label: `${s.baseAsset}/${s.quoteAsset}`
            }));

        // Pin major pairs to the top
        const pinned = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'];
        const pinnedSymbols: ({ value: string; label: string; } | undefined)[] = new Array(pinned.length);
        const otherSymbols: { value: string; label: string; }[] = [];

        for (const pair of usdtPairs) {
            const index = pinned.indexOf(pair.value);
            if (index > -1) {
                pinnedSymbols[index] = pair;
            } else {
                otherSymbols.push(pair);
            }
        }
        
        otherSymbols.sort((a, b) => a.label.localeCompare(b.label));

        const finalPinned = pinnedSymbols.filter((p): p is { value: string; label: string; } => Boolean(p));

        return [...finalPinned, ...otherSymbols];

    } catch (error) {
        console.error('Failed to fetch exchange info:', error);
        throw error;
    }
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
            throw new Error(`Binance API Error: ${response.status} ${response.statusText}`);
        }
        const data: BinanceKline[] = await response.json();

        return data.map(kline => {
            const open = parseFloat(kline[1]);
            const close = parseFloat(kline[4]);
            return {
                time: kline[0] / 1000, // convert ms to seconds for charting libraries
                open: open,
                high: parseFloat(kline[2]),
                low: parseFloat(kline[3]),
                close: close,
                volume: parseFloat(kline[5]),
                isBullish: close >= open,
            };
        });
    } catch (error) {
        console.error('Failed to fetch k-line data:', error);
        throw error;
    }
};
