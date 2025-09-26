
import React, { useEffect } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { AlertIcon } from '../icons/AlertIcon';
import { CloseIcon } from '../icons/CloseIcon';

const Toast: React.FC<{ message: string; onDismiss: () => void }> = ({ message, onDismiss }) => {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 5000); // Auto-dismiss after 5 seconds
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className="bg-gray-800 border border-cyan-500/50 rounded-lg shadow-2xl p-4 flex items-start gap-3 animate-fade-in-right w-full">
      <AlertIcon className="w-6 h-6 text-cyan-400 mt-0.5 flex-shrink-0" />
      <p className="text-gray-200 text-sm flex-grow">{message}</p>
      <button onClick={onDismiss} className="text-gray-500 hover:text-white flex-shrink-0">
        <CloseIcon className="w-5 h-5" />
      </button>
    </div>
  );
};


export const ToastContainer: React.FC = () => {
    const { toasts, removeToast } = useToast();

    return (
        <div className="fixed top-20 right-4 z-[100] space-y-3 w-full max-w-sm">
            {toasts.map(toast => (
                <Toast
                    key={toast.id}
                    message={toast.message}
                    onDismiss={() => removeToast(toast.id)}
                />
            ))}
        </div>
    );
};