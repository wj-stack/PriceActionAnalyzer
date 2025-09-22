
import React, { useState, useMemo, useCallback } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { AlphaToken } from '../types';
import { DatabaseIcon } from './icons/DatabaseIcon';
import { ClipboardIcon } from './icons/ClipboardIcon';

interface TokenListModalProps {
    isOpen: boolean;
    onClose: () => void;
    tokens: AlphaToken[];
    isLoading: boolean;
    symbols: { value: string; label: string }[];
    onTokenSelect: (symbol: string) => void;
}

interface TokenRowProps {
    token: AlphaToken;
    tradablePair: string | null;
    onSelect: (symbol: string) => void;
}


const TokenRow: React.FC<TokenRowProps> = ({ token, tradablePair, onSelect }) => {
    const [copied, setCopied] = useState(false);
    const isTradable = tradablePair !== null;

    const handleCopyClick = (e: React.MouseEvent, text: string) => {
        e.stopPropagation();
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    const handleRowClick = () => {
        if (isTradable && tradablePair) {
            onSelect(tradablePair);
        }
    };

    return (
        <tr 
            className={`border-b border-gray-700 ${isTradable ? 'hover:bg-gray-700/50 cursor-pointer' : 'opacity-50'}`}
            onClick={handleRowClick}
            title={isTradable ? `Click to view ${tradablePair} chart` : 'No tradable pair found'}
        >
            <td className="p-3 text-sm text-gray-300 flex items-center gap-3">
                <img src={token.chainIconUrl} alt={token.chainId} className="w-6 h-6 rounded-full bg-gray-600" />
                <div className="flex flex-col">
                    <span className="font-semibold text-gray-100">{token.symbol}</span>
                    <span className="text-xs text-gray-400">{token.name}</span>
                </div>
            </td>
            <td className="p-3 text-sm text-gray-400">{token.chainId}</td>
            <td className="p-3 text-sm text-gray-400 font-mono">
                {token.contractAddress && (
                    <div className="flex items-center gap-2">
                        <span className="truncate max-w-[150px] sm:max-w-[250px]">{token.contractAddress}</span>
                        <button onClick={(e) => handleCopyClick(e, token.contractAddress)} className="text-gray-500 hover:text-cyan-400 transition-colors flex-shrink-0" aria-label="Copy address">
                            {copied ? (
                               <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                            ) : (
                               <ClipboardIcon className="w-4 h-4" />
                            )}
                        </button>
                    </div>
                )}
            </td>
        </tr>
    );
};

export const TokenListModal: React.FC<TokenListModalProps> = ({ isOpen, onClose, tokens, isLoading, symbols, onTokenSelect }) => {
    const { t } = useLanguage();
    const [searchTerm, setSearchTerm] = useState('');

    const tradableSymbolsSet = useMemo(() => new Set(symbols.map(s => s.value)), [symbols]);
    
    const findTradablePair = useCallback((tokenSymbol: string): string | null => {
        if (!tokenSymbol) return null;
        const cleanSymbol = tokenSymbol.split('.')[0].toUpperCase();
        const preferredQuoteAssets = ['USDT', 'FDUSD', 'USDC', 'TUSD', 'BTC', 'ETH'];
        for (const quote of preferredQuoteAssets) {
            const pair = `${cleanSymbol}${quote}`;
            if (tradableSymbolsSet.has(pair)) {
                return pair;
            }
        }
        return null;
    }, [tradableSymbolsSet]);

    const filteredTokens = useMemo(() => {
        if (!searchTerm) return tokens;
        const lowercasedFilter = searchTerm.toLowerCase();
        return tokens.filter(token =>
            token.symbol.toLowerCase().includes(lowercasedFilter) ||
            token.name.toLowerCase().includes(lowercasedFilter)
        );
    }, [tokens, searchTerm]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex justify-center items-center backdrop-blur-sm p-4" onClick={onClose}>
            <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                <header className="p-4 border-b border-gray-700 flex justify-between items-center flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <DatabaseIcon className="w-6 h-6 text-cyan-400" />
                        <h2 className="text-lg font-bold text-gray-100">{t('tokenListTitle')}</h2>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none" aria-label="Close">&times;</button>
                </header>

                <div className="p-4 border-b border-gray-700 flex-shrink-0">
                    <input
                        type="text"
                        placeholder={t('searchTokens')}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 focus:ring-cyan-500 focus:border-cyan-500 text-gray-200"
                    />
                </div>

                <main className="overflow-y-auto">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center h-full">
                           <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500 mb-4"></div>
                           <p className="text-gray-400">{t('loadingTokens')}</p>
                       </div>
                    ) : filteredTokens.length > 0 ? (
                        <table className="w-full text-left table-fixed">
                            <thead className="sticky top-0 bg-gray-800/80 backdrop-blur-sm">
                                <tr className="border-b border-gray-700">
                                    <th className="p-3 text-xs font-semibold text-gray-400 uppercase tracking-wider w-2/5">{t('tokenName')}</th>
                                    <th className="p-3 text-xs font-semibold text-gray-400 uppercase tracking-wider w-1/5">{t('tokenChain')}</th>
                                    <th className="p-3 text-xs font-semibold text-gray-400 uppercase tracking-wider w-2/5">{t('tokenContract')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredTokens.map(token => {
                                    const tradablePair = findTradablePair(token.symbol);
                                    return <TokenRow key={token.alphaId} token={token} tradablePair={tradablePair} onSelect={onTokenSelect} />
                                })}
                            </tbody>
                        </table>
                    ) : (
                        <div className="flex items-center justify-center h-full text-gray-500">
                            <p>{t('noTokensFound')}</p>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
};
