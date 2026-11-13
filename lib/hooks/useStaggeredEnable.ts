"use client";

import { useEffect, useState } from "react";

/**
 * Lets a page start its requests one after another instead of all in the same
 * moment. Returns how many of `count` steps are open: 1 straight away, then one
 * more every `stepMs`. Use `step > index` as the `enabled` flag of query number
 * `index`. A page that fires 30 requests at once can trip the proxy's rate
 * limit; spreading them over a few seconds does not.
 */
export function useStaggerStep(count: number, stepMs: number): number {
  const [step, setStep] = useState(1);

  useEffect(() => {
    if (step >= count) return;
    const timer = setTimeout(() => setStep((s) => s + 1), stepMs);
    return () => clearTimeout(timer);
  }, [step, count, stepMs]);

  return step;
}

/** True once `delayMs` has passed after the component mounted. */
export function useAfterDelay(delayMs: number): boolean {
  const [ready, setReady] = useState(delayMs <= 0);

  useEffect(() => {
    if (ready) return;
    const timer = setTimeout(() => setReady(true), delayMs);
    return () => clearTimeout(timer);
  }, [ready, delayMs]);

  return ready;
}
