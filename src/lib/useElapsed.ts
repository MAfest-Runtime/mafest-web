import { useEffect, useState } from "react";

/** 경과 초를 1초마다 다시 그린다. 로딩 안내와 해석 미리보기가 함께 쓴다. */
export function useElapsed(startedAt: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return Math.max(0, Math.floor((now - startedAt) / 1000));
}
