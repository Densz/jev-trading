"use client";
import { useEffect, useState } from "react";
import type { AiSettingsView } from "@/lib/ai/config";
export function useProviderOptions() {
  const [settings, setSettings] = useState<AiSettingsView | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/settings/ai", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const value = await response.json();
        if (!response.ok) throw new Error(value.error ?? "AI settings could not be loaded.");
        setSettings(value);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("AI settings could not be loaded. Refresh to retry.");
      });
    return () => controller.abort();
  }, []);
  return { settings, error };
}
