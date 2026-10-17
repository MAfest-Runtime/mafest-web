import { useEffect, useState } from "react";

/** Retry-After(429·409 turn_in_progress)를 세다가 0이 되면 다시 시도 버튼을 연다. */
export function useCountdown(seconds: number | null): number {
  const [left, setLeft] = useState(seconds ?? 0);
  useEffect(() => {
    if (!seconds) return;
    const started = Date.now();
    const timer = setInterval(() => {
      const remaining = Math.max(
        0,
        seconds - Math.floor((Date.now() - started) / 1000),
      );
      setLeft(remaining);
      if (remaining === 0) clearInterval(timer);
    }, 250);
    return () => clearInterval(timer);
  }, [seconds]);
  return left;
}
