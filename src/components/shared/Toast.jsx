import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";

/**
 * Global toast system.
 *
 *   const { toast } = useToast();
 *   toast.success("Saved");
 *   toast.error("Failed", "Please retry");
 *   toast.info("Heads up");
 *   toast.warning("Careful");
 *
 * - Bottom-right
 * - Auto-dismiss after 4 seconds
 * - Max 3 visible at once (older ones drop)
 * - Manual dismiss button
 * - Role=status for success/info/warning, role=alert for error
 */
const ToastContext = createContext(null);
const DURATION_MS = 4000;
const MAX_TOASTS = 3;

const VARIANT = {
  success: { bg: "rgba(16,185,129,0.15)", border: "rgba(16,185,129,0.45)", dot: "#10b981", role: "status", aria: "polite" },
  error:   { bg: "rgba(239,68,68,0.15)",  border: "rgba(239,68,68,0.45)",  dot: "#F45B69", role: "alert",  aria: "assertive" },
  info:    { bg: "rgba(59,130,246,0.15)", border: "rgba(59,130,246,0.45)", dot: "#5B4CF5", role: "status", aria: "polite" },
  warning: { bg: "rgba(245,158,11,0.15)", border: "rgba(245,158,11,0.45)", dot: "#F5A623", role: "status", aria: "polite" },
};

function ToastItem({ t, onDismiss }) {
  const v = VARIANT[t.type] || VARIANT.info;
  return (
    <div
      role={v.role}
      aria-live={v.aria}
      className="pointer-events-auto rounded-xl px-4 py-3 backdrop-blur-md flex items-start gap-3 min-w-[260px] max-w-[360px]"
      style={{
        background: "rgba(10,10,10,0.85)",
        border: `1px solid ${v.border}`,
        boxShadow: "0 20px 50px -18px rgba(0,0,0,0.6)",
        animation: "cambra-toast-in 220ms ease-out",
      }}
    >
      <span
        aria-hidden="true"
        className="mt-1 w-2 h-2 rounded-full shrink-0"
        style={{ background: v.dot, boxShadow: `0 0 12px ${v.dot}` }}
      />
      <div className="flex-1 min-w-0">
        {t.title && <p className="text-sm font-bold text-white truncate">{t.title}</p>}
        {t.description && (
          <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.7)" }}>
            {t.description}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(t.id)}
        aria-label="Dismiss notification"
        className="text-white/50 hover:text-white text-xs font-bold ml-1 shrink-0"
      >
        ✕
      </button>
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) { clearTimeout(timer); timersRef.current.delete(id); }
  }, []);

  const push = useCallback((type, title, description) => {
    const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setToasts((list) => {
      const next = [...list, { id, type, title, description }];
      // Cap to MAX_TOASTS — drop oldest
      return next.length > MAX_TOASTS ? next.slice(next.length - MAX_TOASTS) : next;
    });
    const timer = setTimeout(() => dismiss(id), DURATION_MS);
    timersRef.current.set(id, timer);
    return id;
  }, [dismiss]);

  useEffect(() => {
    // capture for cleanup so we don't read ref.current at unmount time
    const timers = timersRef.current;
    return () => { timers.forEach((tm) => clearTimeout(tm)); timers.clear(); };
  }, []);

  const value = {
    toast: {
      success: (title, description) => push("success", title, description),
      error:   (title, description) => push("error",   title, description),
      info:    (title, description) => push("info",    title, description),
      warning: (title, description) => push("warning", title, description),
    },
    dismiss,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none"
      >
        {toasts.map((t) => <ToastItem key={t.id} t={t} onDismiss={dismiss} />)}
      </div>
      <style>{`
        @keyframes cambra-toast-in {
          from { opacity: 0; transform: translateX(16px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Safe no-op fallback so non-wrapped callers don't crash.
    return {
      toast: { success: () => null, error: () => null, info: () => null, warning: () => null },
      dismiss: () => null,
    };
  }
  return ctx;
}