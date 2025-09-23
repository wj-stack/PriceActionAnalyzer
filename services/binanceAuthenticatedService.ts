
import type { AccountInfo, Order } from '../types';

const API_BASE_URL = 'https://api1.binance.com';

// Helper to convert a string to an ArrayBuffer
const str2ab = (str: string): ArrayBuffer => {
    const buf = new ArrayBuffer(str.length);
    const bufView = new Uint8Array(buf);
    for (let i = 0, strLen = str.length; i < strLen; i++) {
        bufView[i] = str.charCodeAt(i);
    }
    return buf;
};

// Helper function to create a signature using Web Crypto API
const createSignature = async (queryString: string, apiSecret: string): Promise<string> => {
    const key = await window.crypto.subtle.importKey(
        'raw',
        str2ab(apiSecret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const signature = await window.crypto.subtle.sign('HMAC', key, str2ab(queryString));
    return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
};

// Generic fetch function for signed endpoints
const fetchSignedApi = async (endpoint: string, params: Record<string, string>, apiKey: string, apiSecret: string) => {
    const timestamp = Date.now();
    const queryString = new URLSearchParams({ ...params, timestamp: timestamp.toString() }).toString();
    const signature = await createSignature(queryString, apiSecret);
    const url = `${API_BASE_URL}${endpoint}?${queryString}&signature=${signature}`;
    const headers = { 'X-MBX-APIKEY': apiKey };

    try {
        const response = await fetch(url, { headers });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ msg: 'Could not parse error JSON' }));
            const curlCommand = `curl -H "X-MBX-APIKEY: ${apiKey}" "${url}"`;
            console.error("Authenticated API request failed. Debug with curl:");
            console.error(curlCommand);
            throw new Error(`Binance API Error: ${errorData.msg || response.statusText}`);
        }
        return response.json();
    } catch (error) {
        const curlCommand = `curl -H "X-MBX-APIKEY: ${apiKey}" "${url}"`;
        console.error("Authenticated API request failed at network level. Debug with curl:");
        console.error(curlCommand);
        console.error("Original Error:", error);
        throw error;
    }
};

export const getAccountInfo = async (apiKey: string, apiSecret: string): Promise<AccountInfo> => {
    return fetchSignedApi('/api/v3/account', {}, apiKey, apiSecret);
};

export const getOpenOrders = async (apiKey: string, apiSecret: string, symbol: string): Promise<Order[]> => {
    return fetchSignedApi('/api/v3/openOrders', { symbol }, apiKey, apiSecret);
};

export const getAllOrders = async (apiKey: string, apiSecret: string, symbol: string): Promise<Order[]> => {
    return fetchSignedApi('/api/v3/allOrders', { symbol, limit: '100' }, apiKey, apiSecret);
};
