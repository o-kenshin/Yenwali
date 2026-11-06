"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 「コピーしました」などを数秒だけ出す小さな通知
 */
export function useToast(): { message: string | null; show: (message: string) => void } {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const show = useCallback((next: string) => {
    window.clearTimeout(timer.current);
    setMessage(next);
    timer.current = window.setTimeout(() => setMessage(null), 2200);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return { message, show };
}

export function Toast({ message }: { message: string | null }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4"
    >
      {message && (
        <div className="rounded-full bg-ink px-4 py-2 text-sm font-bold text-bg shadow-lg">{message}</div>
      )}
    </div>
  );
}
