import { useEffect } from 'react';

interface Props {
  message: string;
  variant?: 'success' | 'error';
  onClose: () => void;
}

export function Toast({ message, variant = 'success', onClose }: Props) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);

  const bg =
    variant === 'success'
      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200'
      : 'bg-red-500/20 border-red-500/40 text-red-200';

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg border ${bg} shadow-xl animate-fade-in`}
    >
      {message}
    </div>
  );
}
