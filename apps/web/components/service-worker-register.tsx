"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) {
      return;
    }

    void navigator.serviceWorker
      .getRegistration()
      .then((existing) => existing ?? navigator.serviceWorker.register("/sw.js", { scope: "/" }))
      .catch(() => {
        // Keep startup resilient when service worker registration is unavailable.
      });
  }, []);

  return null;
}
