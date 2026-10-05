"use client";
import { useState } from "react";
import { KeyRound, Loader2, Save, Trash2, Zap } from "lucide-react";
import { aiProviders, type AiSettingsView } from "@/lib/ai/config";
import { Button } from "./ui/button";
import { StatusMessage } from "./analysis-actions";

export function AiSettings({ initial }: { initial: AiSettingsView }) {
  const [settings, setSettings] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  async function request(method: string, body: unknown) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/settings/ai", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not update AI settings.");
      if (method !== "POST") setSettings(result);
      setMessage({
        text:
          method === "POST"
            ? result.message
            : method === "DELETE"
              ? "Saved key removed. Environment keys must be removed on the server."
              : "AI settings saved.",
        error: false,
      });
      return true;
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : "Could not update AI settings.",
        error: true,
      });
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="max-w-4xl">
      <p className="eyebrow mb-2">Personal workspace</p>
      <h1 className="page-title">AI settings</h1>
      <p className="mt-3 text-sm leading-7 text-muted-foreground">
        Choose who analyzes your evidence. Keys are encrypted in the database and used only on the
        server. Each provider bills your API account separately.
      </p>
      {!settings.canStoreKeys && (
        <p
          role="status"
          className="mt-5 rounded-lg border border-neutral-signal/25 bg-neutral-signal/5 p-4 text-xs leading-6"
        >
          To save keys, configure APP_PASSWORD (at least 16 characters) and API_KEY_ENCRYPTION_KEY
          (a random 32-byte key encoded as base64) on the server. See the README for setup.
        </p>
      )}
      {settings.demo && (
        <p className="mt-4 text-xs text-muted-foreground">
          Demo mode uses synthetic results. Saved keys are not used and connection tests are
          disabled.
        </p>
      )}
      <section className="panel mt-6 p-5">
        <label htmlFor="default-provider" className="text-sm font-medium">
          Default analysis provider
        </label>
        <p className="my-2 text-xs leading-6 text-muted-foreground">
          Used by scheduled analyses and when no provider is selected for a manual analysis.
        </p>
        <select
          id="default-provider"
          value={settings.defaultProvider}
          disabled={busy || !settings.canStoreKeys}
          onChange={(event) => void request("PATCH", { provider: event.target.value })}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          {settings.providers.map((item) => (
            <option key={item.provider} value={item.provider} disabled={!item.ready}>
              {aiProviders[item.provider].label}
              {item.ready ? "" : " · key required"}
            </option>
          ))}
        </select>
      </section>
      <StatusMessage message={message} />
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {settings.providers.map((item) => (
          <ProviderCard
            key={`${item.provider}:${item.model}:${item.keySuffix}:${item.keySource}`}
            item={item}
            busy={busy}
            canStore={settings.canStoreKeys}
            demo={settings.demo}
            request={request}
          />
        ))}
      </div>
      <p className="mt-5 text-xs leading-6 text-muted-foreground">
        Save before testing. A connection test sends a small request to the saved model and may
        incur a charge. Model availability depends on your API account. Deleting a saved key resets
        its default selection to Jev; revoke the key at the provider to invalidate it completely.
      </p>
    </div>
  );
}
function ProviderCard({
  item,
  busy,
  canStore,
  demo,
  request,
}: {
  item: AiSettingsView["providers"][number];
  busy: boolean;
  canStore: boolean;
  demo: boolean;
  request: (method: string, body: unknown) => Promise<boolean>;
}) {
  const [model, setModel] = useState(item.model);
  const [apiKey, setApiKey] = useState("");
  const { provider } = item;
  return (
    <form
      className="panel p-5"
      onSubmit={async (event) => {
        event.preventDefault();
        if (
          await request("PUT", {
            provider,
            model,
            ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
          })
        )
          setApiKey("");
      }}
    >
      <h2 className="flex items-center gap-2 text-sm font-medium">
        <KeyRound className="size-4 text-primary" />
        {aiProviders[provider].label}
      </h2>
      <p className="my-3 text-xs text-muted-foreground">
        {item.keySource === "database"
          ? `Saved key: ••••${item.keySuffix}`
          : item.keySource === "environment"
            ? "Using server environment key"
            : "No key configured"}
      </p>
      <label htmlFor={`${provider}-model`} className="text-xs">
        Model ID
      </label>
      <input
        id={`${provider}-model`}
        list={`${provider}-models`}
        required
        maxLength={100}
        value={model}
        onChange={(event) => setModel(event.target.value)}
        disabled={busy || !canStore}
        className="mt-1 mb-3 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
      />
      <datalist id={`${provider}-models`}>
        {aiProviders[provider].models.map((value) => (
          <option key={value} value={value} />
        ))}
      </datalist>
      <label htmlFor={`${provider}-key`} className="text-xs">
        {item.configured ? "Replace API key" : "API key"}
      </label>
      <input
        id={`${provider}-key`}
        type="password"
        autoComplete="new-password"
        spellCheck={false}
        maxLength={512}
        required={item.keySource !== "database"}
        value={apiKey}
        onChange={(event) => setApiKey(event.target.value)}
        disabled={busy || !canStore}
        placeholder={
          item.keySource === "database" ? "Leave blank to keep the saved key" : "Paste your API key"
        }
        className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
      />
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="submit" disabled={busy || !canStore}>
          {busy ? <Loader2 className="animate-spin" /> : <Save />}Save
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy || !item.ready || demo || !canStore}
          onClick={() => void request("POST", { provider })}
        >
          <Zap />
          Test
        </Button>
        {item.keySource === "database" && (
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            aria-label={`Delete ${aiProviders[provider].label} key`}
            onClick={() => void request("DELETE", { provider })}
          >
            <Trash2 />
            Delete
          </Button>
        )}
      </div>
    </form>
  );
}
