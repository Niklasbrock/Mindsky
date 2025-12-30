import { useState, useCallback } from 'react';

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

const TOAST_DURATION = 4000; // 4 seconds

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const toast: Toast = { id, message, type };

    setToasts(prev => [...prev, toast]);

    // Auto-remove after duration
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, TOAST_DURATION);

    return id;
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showError = useCallback((message: string) => {
    return addToast(message, 'error');
  }, [addToast]);

  const showSuccess = useCallback((message: string) => {
    return addToast(message, 'success');
  }, [addToast]);

  const showInfo = useCallback((message: string) => {
    return addToast(message, 'info');
  }, [addToast]);

  return {
    toasts,
    addToast,
    removeToast,
    showError,
    showSuccess,
    showInfo,
  };
}

export type ToastAPI = ReturnType<typeof useToast>;
