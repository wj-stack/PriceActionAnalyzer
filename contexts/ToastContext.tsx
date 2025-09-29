

import React, { createContext, useState, useContext, ReactNode, useCallback } from 'react';

export interface ToastMessage {
  id: number;
  message: string;
  type: 'info' | 'success' | 'error';
}

interface ToastContextType {
  toasts: ToastMessage[];
  // FIX: Change signature to take a single object argument to resolve ambiguity.
  addToast: (payload: { message: string; type?: ToastMessage['type'] }) => void;
  removeToast: (id: number) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((payload: { message: string, type?: ToastMessage['type'] }) => {
    const { message, type = 'info' } = payload;
    const id = Date.now();
    setToasts(prevToasts => [...prevToasts, { id, message, type }]);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts(prevToasts => prevToasts.filter(toast => toast.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};