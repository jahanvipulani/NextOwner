import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

type Kind = 'success' | 'error' | 'info';
interface Item {
  id: number;
  message: string;
  kind: Kind;
}
interface ToastCtx {
  push: (message: string, kind?: Kind) => void;
}

const Ctx = createContext<ToastCtx>({
  push: () => undefined,
});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);

  const push = useCallback((message: string, kind: Kind = 'success') => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, message, kind }]);
    window.setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== id)), 4000);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div
        className="fixed bottom-4 right-4 flex flex-col gap-2"
        style={{ zIndex: 100, maxWidth: 'min(420px, 90vw)' }}
        aria-live="polite"
      >
        {items.map((i) => (
          <div
            key={i.id}
            role="status"
            className="rounded px-4 py-2 text-sm"
            style={{
              background: i.kind === 'error' ? 'var(--pink)' : 'var(--charcoal)',
              color: i.kind === 'error' ? 'var(--pink-ink)' : 'var(--on-charcoal)',
            }}
          >
            {i.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastCtx {
  return useContext(Ctx);
}
