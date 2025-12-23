"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const isLocalhost =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";

    // Only register in production, but keep it easy to test locally if you want.
    if (process.env.NODE_ENV !== "production" && !isLocalhost) return;

    navigator.serviceWorker
      .register("/sw.js")
      .catch(() => {
        // silently ignore — SW is a nice-to-have
      });
  }, []);

  return null;
}
