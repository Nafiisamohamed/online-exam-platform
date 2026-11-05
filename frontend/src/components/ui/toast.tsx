"use client";

/**
 * Short confirmation messages ("Account created.") in the corner of the
 * screen. They disappear after a few seconds and are announced to screen
 * readers. Use toast() for successes; errors stay inline next to the form.
 */
import { CheckCircle2, X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n/i18n";

interface ToastItem {
  id: number;
  text: string;
}

const ToastContext = createContext<((text: string) => void) | null>(null);
let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [items, setItems] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), []);
  const show = useCallback(
    (text: string) => {
      const id = nextId++;
      setItems((list) => [...list.slice(-2), { id, text }]);
      setTimeout(() => dismiss(id), 4500);
    },
    [dismiss],
  );
  const value = useMemo(() => show, [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:items-end">
        {items.map((item) => (
          <div key={item.id} role="status" className="pointer-events-auto flex w-full max-w-sm animate-pop-in items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-sm text-foreground shadow-overlay">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden />
            <span className="flex-1">{item.text}</span>
            <button type="button" onClick={() => dismiss(item.id)} className="rounded p-0.5 text-subtle hover:text-foreground" aria-label={t("common.close")}>
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
