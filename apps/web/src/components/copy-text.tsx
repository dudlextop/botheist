"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/** A monospace value with a copy button. Copies the full raw value. */
export function CopyText({ value, display, className, label = "value" }: { value: string; display?: string; className?: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setDone(true);
        toast.success(`Copied ${label}`);
        setTimeout(() => setDone(false), 1200);
      }}
      title={value}
      aria-label={`Copy ${label}: ${value}`}
      className={cn(
        "inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-md px-1.5 font-mono text-xs break-all text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        className,
      )}
    >
      <span className="truncate">{display ?? value}</span>
      {done ? <Check className="size-3 shrink-0 text-success" aria-hidden /> : <Copy className="size-3 shrink-0" aria-hidden />}
    </button>
  );
}
