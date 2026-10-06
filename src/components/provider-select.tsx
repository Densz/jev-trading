"use client";
import { aiProviders, type AiProvider } from "@/lib/ai/config";
import { useProviderOptions } from "./use-provider-options";

export function ProviderSelect({
  value,
  onChange,
  disabled,
}: {
  value: AiProvider | "default";
  onChange: (value: AiProvider | "default") => void;
  disabled?: boolean;
}) {
  const { settings, error } = useProviderOptions();
  return (
    <div className="min-w-0 max-w-full text-xs">
      <label className="flex flex-wrap items-center gap-2">
        Analysis provider
        <select
          value={value}
          onChange={(event) => onChange(event.target.value as AiProvider | "default")}
          disabled={disabled || settings?.demo}
          className="w-64 min-w-0 max-w-full rounded-md border border-border bg-background px-2 py-2 text-xs"
        >
          <option value="default">
            {settings?.demo
              ? "Synthetic demo"
              : settings
                ? `Default · ${aiProviders[settings.defaultProvider].label}`
                : "Workspace default"}
          </option>
          {settings?.providers.map((item) => (
            <option key={item.provider} value={item.provider} disabled={!item.ready}>
              {aiProviders[item.provider].label} · {item.model}
              {item.ready ? "" : " (key required)"}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p role="alert" className="mt-1 text-negative">
          {error}
        </p>
      )}
    </div>
  );
}
