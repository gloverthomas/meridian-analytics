import { useEffect, useState } from "react";

const MINUTE_MS = 60_000;

/** Current time that re-renders on an interval, so relative labels ("5m") stay fresh. */
export function useNow(intervalMs = MINUTE_MS): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
