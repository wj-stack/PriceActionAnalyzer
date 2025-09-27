import React, { useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { KeyIcon } from './icons/KeyIcon';
import { EyeIcon } from './icons/EyeIcon';
import { EyeOffIcon } from './icons/EyeOffIcon';

interface ApiKeyModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (apiKey: string, apiSecret: string) => void;
    onClear: () => void;
    currentApiKey: string;
    currentApiSecret: string;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ isOpen, onClose, onSave, onClear, currentApiKey, currentApiSecret }) => {
    const { t } = useLanguage();
    const [apiKey, setApiKey] = useState(currentApiKey);
    const [apiSecret, setApiSecret] = useState(currentApiSecret);
    const [isSecretVisible, setIsSecretVisible] = useState(false);

    const handleSave = () => {
        onSave(apiKey, apiSecret);
    };

    const handleClear = () => {
        setApiKey('');
        setApiSecret('');
        onClear();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex justify-center items-center backdrop-blur-sm p-4">
            <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                <header className="p-4 border-b border-gray-700 flex justify-between items-center flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <KeyIcon className="w-6 h-6 text-cyan-400" />
                        <h2 className="text-lg font-bold text-gray-100">{t('apiKeyModalTitle')}</h2>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
                </header>
                <main className="p-6 overflow-y-auto space-y-4">
                    <div>
                        <label htmlFor="api-key" className="block text-sm font-medium text-gray-300 mb-1">{t('apiKey')}</label>
                        <input
                            type="text"
                            id="api-key"
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-gray-200 focus:ring-cyan-500 focus:border-cyan-500"
                            placeholder="Enter your API Key"
                        />
                    </div>
                    <div>
                        <label htmlFor="api-secret" className="block text-sm font-medium text-gray-300 mb-1">{t('apiSecret')}</label>
                        <div className="relative">
                            <input
                                type={isSecretVisible ? 'text' : 'password'}
                                id="api-secret"
                                value={apiSecret}
                                onChange={(e) => setApiSecret(e.target.value)}
                                className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-gray-200 focus:ring-cyan-500 focus:border-cyan-500"
                                placeholder="Enter your API Secret"
                            />
                            <button
                                type="button"
                                onClick={() => setIsSecretVisible(!isSecretVisible)}
                                className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-400 hover:text-cyan-400"
                                aria-label={isSecretVisible ? "Hide secret" : "Show secret"}
                            >
                                {isSecretVisible ? <EyeOffIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                            </button>
                        </div>
                    </div>
                     <div className="p-3 bg-blue-900/20 text-blue-200 border border-blue-500/30 rounded-md text-xs">
                        {t('apiKeyDisclaimer')}
                    </div>
                </main>
                <footer className="p-4 bg-gray-900/50 flex justify-end items-center gap-3 border-t border-gray-700 flex-shrink-0">
                    <button onClick={handleClear} className="px-4 py-2 text-sm font-semibold text-red-400 bg-red-500/10 hover:bg-red-500/20 rounded-md transition-colors">
                        {t('clearKeys')}
                    </button>
                    <button onClick={handleSave} className="px-4 py-2 text-sm font-semibold text-white bg-cyan-600 hover:bg-cyan-500 rounded-md transition-colors">
                        {t('saveKeys')}
                    </button>
                </footer>
            </div>
        </div>
    );
};