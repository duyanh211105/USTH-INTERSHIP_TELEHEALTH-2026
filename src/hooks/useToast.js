import { useEffect, useState } from 'react';

export default function useToast(timeout = 3500) {
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    const timer = window.setTimeout(() => setToast(null), timeout);
    return () => window.clearTimeout(timer);
  }, [toast, timeout]);

  function showToast(message, type = 'info') {
    setToast({ message, type, id: Date.now() });
  }

  return { toast, showToast };
}
