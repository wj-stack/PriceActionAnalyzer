
import { en } from './locales/en';
import { zh } from './locales/zh';

export type Locale = 'en' | 'zh';

export const resources = {
  en: { translation: en },
  zh: { translation: zh },
};

export const defaultLocale: Locale = 'en';
