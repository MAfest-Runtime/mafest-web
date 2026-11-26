import { useEffect, useState } from "react";

/** 429 Retry-After 를 세다가 0이 되면 새 요청 버튼을 연다. */
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

/** 실행이 정한 재전송 가능 시각을 표시한다. 화면을 다시 그려도 대기를 처음부터 세지 않는다. */
export function useDeadlineCountdown(retryAt: number | null): number {
  const [, redraw] = useState(0);
  useEffect(() => {
    if (retryAt === null || Date.now() >= retryAt) return;
    const timer = setInterval(() => {
      redraw((tick) => tick + 1);
      if (Date.now() >= retryAt) clearInterval(timer);
    }, 250);
    return () => clearInterval(timer);
  }, [retryAt]);

  return retryAt === null
    ? 0
    : Math.max(0, Math.ceil((retryAt - Date.now()) / 1_000));
}
