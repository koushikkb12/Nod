"use client";

import { useEffect } from "react";
import { markJobsSeen } from "@/app/app/actions/jobs";

/**
 * Records the visit after the page has shown this visit's "New" badges, so
 * they're cleared next time rather than straight away.
 */
export function MarkJobsSeen() {
  useEffect(() => {
    const t = setTimeout(() => void markJobsSeen().catch(() => {}), 1500);
    return () => clearTimeout(t);
  }, []);
  return null;
}
