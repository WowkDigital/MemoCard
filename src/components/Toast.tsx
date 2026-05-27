import { useEffect } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

interface ToastProps {
  message: string;
  type: 'success' | 'error';
  onClose: () => void;
}

export function Toast({ message, type, onClose }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="toast">
      {type === 'success' ? (
        <CheckCircle2 size={18} style={{ color: 'var(--color-easy)' }} />
      ) : (
        <AlertCircle size={18} style={{ color: 'var(--color-again)' }} />
      )}
      <span>{message}</span>
    </div>
  );
}
