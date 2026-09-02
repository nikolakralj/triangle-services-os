"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Development and early-production bridge: while an authenticated manager has
 * Triangle open, queued in-app employee work is claimed and executed without
 * requiring the manager to visit the provider's chat product.
 *
 * A durable cloud scheduler is the next runtime layer; the database claim is
 * already safe for both callers, so this component can later disappear.
 */
export function AgentWorkPulse() {
  const router = useRouter();
  const running = useRef(false);

  const pulse = useCallback(async () => {
    if (running.current || document.visibilityState === "hidden") return;
    running.current = true;
    try {
      const response = await fetch("/api/agents/work", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) return;
      const result = (await response.json()) as { status?: string };
      if (result.status === "completed" || result.status === "failed") {
        router.refresh();
        window.dispatchEvent(new CustomEvent("triangle:agent-work-updated"));
      }
    } catch {
      // The visible UI carries the honest queued/failed state. A temporary
      // network failure should not interrupt the manager's work.
    } finally {
      running.current = false;
    }
  }, [router]);

  useEffect(() => {
    void pulse();
    const interval = window.setInterval(() => void pulse(), 90_000);
    const onVisible = () => void pulse();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pulse]);

  return null;
}
