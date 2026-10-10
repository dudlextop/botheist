"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { ExternalLink, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";
import { maskKey, saveModelKey, useModelKey } from "@/lib/model-key";
import { cn } from "@/lib/utils";

const KeyDialogContext = createContext<{ open: () => void }>({ open: () => {} });

export function useKeyDialog() {
  return useContext(KeyDialogContext);
}

export function ModelKeyProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const show = useCallback(() => setOpen(true), []);
  return (
    <KeyDialogContext.Provider value={{ open: show }}>
      {children}
      <ModelKeyDialog open={open} onOpenChange={setOpen} />
    </KeyDialogContext.Provider>
  );
}

function ModelKeyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const saved = useModelKey();
  const [value, setValue] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setValue("");
    setError(null);
    onOpenChange(false);
  };

  const check = async () => {
    const key = value.trim();
    if (!key) return;
    setChecking(true);
    setError(null);
    try {
      await api("/api/model-key/check", { method: "POST", json: { apiKey: key } });
      saveModelKey(key);
      toast.success("Claude key saved. New attempts run on Claude.");
      close();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't check the key. Try again.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-condensed text-2xl font-extrabold">Run Milo on Claude</DialogTitle>
          <DialogDescription>
            Without a key, Milo is offline: a scripted stand-in, so you can try every screen for free. With your own Claude API key, every new
            attempt plays against the real model.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-2 rounded-md bg-background p-4 text-sm leading-6">
          <li>The key stays in this browser. It&apos;s sent only when you start an attempt or run a regression check.</li>
          <li>The server encrypts it for that one attempt and erases it when the attempt ends. It&apos;s never logged or shown back.</li>
          <li>Model usage is billed to your Anthropic account. Every attempt has a hard budget (practice: $0.25).</li>
        </ul>

        {saved && (
          <p className="text-sm">
            Saved key: <span className="font-mono font-semibold">{maskKey(saved)}</span>
          </p>
        )}

        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void check();
          }}
        >
          <Label htmlFor="claude-key">{saved ? "Replace with another key" : "Claude API key"}</Label>
          <Input
            id="claude-key"
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="sk-ant-…"
            autoComplete="off"
            spellCheck={false}
            className="h-11 bg-paper font-mono"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "claude-key-error" : "claude-key-help"}
          />
          {error ? (
            <p id="claude-key-error" role="alert" className="text-sm font-semibold text-destructive">
              {error}
            </p>
          ) : (
            <p id="claude-key-help" className="text-xs text-muted-foreground">
              Create one at{" "}
              <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-semibold underline underline-offset-4 hover:no-underline">
                console.anthropic.com <ExternalLink className="size-3" aria-hidden />
              </a>
              . We check it with a free request before saving.
            </p>
          )}
          <DialogFooter className="mt-4 gap-2 sm:justify-between">
            {saved ? (
              <Button
                type="button"
                variant="ghost"
                className="h-11 text-destructive hover:text-destructive"
                onClick={() => {
                  saveModelKey(null);
                  toast.success("Key removed. Milo is back to offline.");
                  close();
                }}
              >
                Remove saved key
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="h-11" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" className="h-11 px-5" disabled={!value.trim() || checking}>
                {checking ? "Checking…" : "Check and save"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Header control: shows which brain new attempts get and opens the key dialog. */
export function BrainChip({ className }: { className?: string }) {
  const key = useModelKey();
  const { open } = useKeyDialog();
  return (
    <button
      type="button"
      onClick={open}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-sm border px-2 text-xs font-semibold transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        key ? "border-ink bg-ink text-white hover:bg-ink/85" : "border-dashed border-ink/40 hover:border-ink",
        className,
      )}
      aria-label={key ? "Milo runs on Claude with your key. Manage key" : "Milo is offline. Add your Claude API key"}
    >
      <KeyRound className="size-3.5" aria-hidden />
      {key ? "Claude on your key" : "Offline Milo"}
    </button>
  );
}
