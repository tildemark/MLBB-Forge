"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const registerServiceWorker = async () => {
      try {
        await navigator.serviceWorker.register("/sw.js");
        console.log("MLBB Forge service worker registered.");
      } catch (error) {
        console.warn("MLBB Forge service worker registration failed:", error);
      }
    };

    registerServiceWorker();
  }, []);

  return null;
}
