import type { Toast } from '../hooks/useToast';

interface ToastContainerProps {
  toasts: Toast[];
  onRemove: (id: string) => void;
}

export function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 animate-slide-in-right ${
            toast.type === 'error'
              ? 'bg-red-500 text-white'
              : toast.type === 'success'
              ? 'bg-green-500 text-white'
              : 'bg-slate-700 text-white'
          }`}
        >
          {toast.type === 'error' && (
            <span className="text-lg">⚠</span>
          )}
          {toast.type === 'success' && (
            <span className="text-lg">✓</span>
          )}
          <span className="text-sm font-medium">{toast.message}</span>
          <button
            onClick={() => onRemove(toast.id)}
            className="ml-2 opacity-70 hover:opacity-100 transition-opacity"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
