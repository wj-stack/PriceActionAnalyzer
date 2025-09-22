
import type { BinanceKline, Candle, AlphaToken } from '../types';

const API_BASE_URL = 'https://api.binance.com/api/v3/klines';
const API_BASE_URL_ALPHA = 'https://www.binance.com/bapi/defi/v1/public/alpha-trade/klines';
const EXCHANGE_INFO_URL = 'https://api.binance.com/api/v3/exchangeInfo';
const TOKEN_LIST_URL = 'https://www.binance.com/bapi/asset/v2/public/asset/asset/get-all-asset';
const ALPHA_TOKEN_LIST_URL = 'https://www.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/cex/alpha/all/token/list';
const ALPHA_EXCHANGE_INFO_URL = 'https://www.binance.com/bapi/defi/v1/public/alpha-trade/get-exchange-info';


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

// --- Type definitions for Token List ---
interface TokenInfo {
    assetCode: string;
    logoUrl: string;
}

interface TokenListResponse {
    data: TokenInfo[];
}

// --- Type definitions for Alpha Token List ---
interface AlphaTokenListResponse {
    code: string;
    message: string;
    data: AlphaToken[];
    success?: boolean;
}

// --- Type definitions for Alpha Exchange Info ---
interface AlphaSymbolInfo {
    symbol: string;
    status: string;
    baseAsset: string;
    quoteAsset: string;
}

interface AlphaExchangeInfoResponse {
    code: string;
    message: string;
    data: {
        symbols: AlphaSymbolInfo[];
    };
    success?: boolean;
}


/**
 * Fetches the list of all available ALPHA tokens from Binance.
 */
export const fetchAlphaTokenList = async (): Promise<AlphaToken[]> => {
    try {
        const response = await fetch(ALPHA_TOKEN_LIST_URL);
        if (!response.ok) {
            throw new Error(`Binance Alpha Token API Error: ${response.status} ${response.statusText}`);
        }
        const data: AlphaTokenListResponse = await response.json();
        if (data.code !== '000000' || !Array.isArray(data.data)) {
            throw new Error(`Binance Alpha Token API Error: ${data.message || 'Invalid data structure'}`);
        }
        return data.data;
    } catch (error) {
        console.error('Failed to fetch alpha token list:', error);
        throw error;
    }
};

/**
 * Fetches token logos from Binance.
 * Returns a map of token asset codes to their logo URLs.
 */
const fetchTokenLogos = async (): Promise<Map<string, string>> => {
    try {
        const response = await fetch(TOKEN_LIST_URL);
        if (!response.ok) {
            // It's a non-critical API, so just warn and continue.
            console.warn(`Binance Token List API Warning: ${response.status} ${response.statusText}`);
            return new Map();
        }
        const data: TokenListResponse = await response.json();
        if (!data || !Array.isArray(data.data)) {
            console.warn('Binance Token List API did not return the expected data structure.');
            return new Map();
        }
        const logoMap = new Map<string, string>();
        for (const token of data.data) {
            if (token.assetCode && token.logoUrl) {
                logoMap.set(token.assetCode, token.logoUrl);
            }
        }
        return logoMap;
    } catch (error) {
        console.error('Failed to fetch token list:', error);
        return new Map(); // Return empty map on error to not break the app
    }
};


/**
 * Fetches a combined list of symbols from Binance Spot and the ALPHA token list.
 * It filters for trading pairs against major stablecoins, finds tradable pairs for ALPHA tokens,
 * and sorts them, pinning major pairs to the top.
 */
export const fetchExchangeInfo = async (): Promise<{
    combinedSymbols: { value: string; label: string; baseAssetLogoUrl?: string; quoteAssetLogoUrl?: string; isAlpha?: boolean; }[],
    alphaTokenDetails: AlphaToken[]
}> => {
    try {
        const [
            spotExchangeInfoResponse, 
            tokenLogos, 
            alphaTokenDetails,
            alphaExchangeInfoResponse
        ] = await Promise.all([
            fetch(EXCHANGE_INFO_URL),
            fetchTokenLogos(),
            fetchAlphaTokenList(),
            fetch(ALPHA_EXCHANGE_INFO_URL)
        ]);

        // Error handling for spot exchange info
        if (!spotExchangeInfoResponse.ok) {
            throw new Error(`Binance API Error: ${spotExchangeInfoResponse.status} ${spotExchangeInfoResponse.statusText}`);
        }
        const spotData: ExchangeInfo = await spotExchangeInfoResponse.json();

        // Error handling for alpha exchange info
        if (!alphaExchangeInfoResponse.ok) {
            throw new Error(`Binance Alpha Exchange Info API Error: ${alphaExchangeInfoResponse.status} ${alphaExchangeInfoResponse.statusText}`);
        }
        const alphaExchangeData: AlphaExchangeInfoResponse = await alphaExchangeInfoResponse.json();
        if (alphaExchangeData.code !== '000000' || !alphaExchangeData.data?.symbols) {
             throw new Error(`Binance Alpha Exchange Info API Error: ${alphaExchangeData.message || 'Invalid data structure'}`);
        }

        // 1. Create a lookup map for Alpha Token details (name, icons)
        const alphaTokenDetailsMap = new Map<string, AlphaToken>();
        for (const token of alphaTokenDetails) {
            // The `symbol` from this list is the base asset, e.g., "ALPHA_105"
            // console.log("symbol:",token.)
            alphaTokenDetailsMap.set(token.alphaId, token);
        }

        const ALLOWED_QUOTE_ASSETS = ['USDT', 'FDUSD', 'USDC', 'TUSD']; 

        // 2. Process standard spot market symbols
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
                    baseAssetLogoUrl: tokenLogos.get(s.baseAsset),
                    quoteAssetLogoUrl: tokenLogos.get(s.quoteAsset),
                    isAlpha: false,
                };
            });

        

        // 3. Process Alpha tokens using the new exchange info
        const alphaSymbols = alphaExchangeData.data.symbols
            .filter(s => 
                s.status === 'TRADING' && 
                ALLOWED_QUOTE_ASSETS.includes(s.quoteAsset)
            )
            .map(s => {
                const details = alphaTokenDetailsMap.get(s.baseAsset);
                console.log("details: ",details,"s: ",s);
                return {
                    value: s.symbol, // e.g., "ALPHA_105USDT"
                    label: `${details?.name || s.baseAsset}/${s.quoteAsset}`, // e.g., "Some Token Name/USDT"
                    quoteAsset: s.quoteAsset,
                    baseAssetLogoUrl: details?.iconUrl,
                    quoteAssetLogoUrl: tokenLogos.get(s.quoteAsset),
                    isAlpha: true,
                };
            });
            
        // 4. Combine, sort, and return the final list
        const combinedSymbols = [...spotSymbols, ...alphaSymbols];

        const pinned = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'];
        const pinnedSymbols: (typeof combinedSymbols[0] | undefined)[] = new Array(pinned.length);
        const otherSymbols: typeof combinedSymbols = [];

        for (const pair of combinedSymbols) {
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

        const finalPinned = pinnedSymbols.filter((p): p is typeof combinedSymbols[0] => Boolean(p));
        const finalResult = [...finalPinned, ...otherSymbols].map(({ quoteAsset, ...rest }) => rest);

        return { combinedSymbols: finalResult, alphaTokenDetails };

    } catch (error) {
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

export const fetchKlines = async (symbol: string, interval: string, limit: number = 1000, startTime?: number, endTime?: number, isAlpha: boolean = false): Promise<Candle[]> => {
    let url = '';
    
    if (isAlpha) {
        url = `${API_BASE_URL_ALPHA}?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    } else {
        url = `${API_BASE_URL}?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    }

    if (startTime) {
        url += `&startTime=${Math.floor(startTime)}`;
    }
    if (endTime) {
        url += `&endTime=${Math.floor(endTime)}`;
    }

    console.log("k line url:",url);

    try {
        const response = await fetch(url);
        if (!response.ok) {
            const apiName = isAlpha ? "Binance Alpha Klines API" : "Binance API";
            throw new Error(`${apiName} Error: ${response.status} ${response.statusText}`);
        }
        
        const responseData = await response.json();

        let klineData: BinanceKline[];

        if (isAlpha) {
            if (responseData.code !== '000000' || !responseData.success) {
                throw new Error(`Binance Alpha Klines API Error: ${responseData.message || 'Invalid data structure'}`);
            }
            klineData = responseData.data;
        } else {
            klineData = responseData;
        }

        if (!Array.isArray(klineData)) {
            const apiName = isAlpha ? "Alpha Klines" : "Klines";
             throw new Error(`Invalid data structure received from ${apiName} API.`);
        }

        return klineData.map(mapBinanceKlineToCandle);

    } catch (error) {
        const apiName = isAlpha ? "alpha k-line" : "k-line";
        console.error(`Failed to fetch ${apiName} data:`, error, "url", url);
        throw error;
    }
};
