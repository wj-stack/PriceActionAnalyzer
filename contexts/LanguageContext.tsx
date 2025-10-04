
import React, { createContext, useState, useCallback, useContext } from 'react';
import { resources, defaultLocale, Locale } from '../i18n';

interface LanguageContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  // FIX: Updated function signature to accept an options object for string interpolation.
  t: (key: string, options?: { [key: string]: string | number }) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocale] = useState<Locale>(defaultLocale);

  // FIX: Implemented string interpolation to replace placeholders like {{key}}.
  const t = useCallback((key: string, options?: { [key: string]: string | number }): string => {
    const translations = resources[locale].translation as { [key: string]: string };
    let translation = translations[key] || key;
    
    if (options) {
      Object.keys(options).forEach(optionKey => {
        const regex = new RegExp(`{{${optionKey}}}`, 'g');
        translation = translation.replace(regex, String(options[optionKey]));
      });
    }

    return translation;
  }, [locale]);

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};