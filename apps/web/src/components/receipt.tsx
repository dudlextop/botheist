"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/*
 * Receipt paper is BotHeist's evidence surface: everything Milo actually
 * executed is printed on it. Chat bubbles are what he says; receipts are
 * what he did.
 */
export function Receipt({
  children,
  className,
  paperClassName,
  edges = "both",
}: {
  children: React.ReactNode;
  className?: string;
  paperClassName?: string;
  edges?: "both" | "bottom";
}) {
  return (
    <div className={cn("paper-shadow", className)}>
      <div
        className={cn(
          "bg-paper px-5 font-mono text-[13px] leading-5 text-ink",
          edges === "both" ? "receipt-edges py-7" : "receipt-edge-bottom pt-5 pb-7",
          paperClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function ReceiptRule({ className }: { className?: string }) {
  return <div className={cn("my-3 border-t border-dashed border-ink/35", className)} aria-hidden />;
}

export function ReceiptRow({
  label,
  value,
  className,
  strong,
}: {
  label: React.ReactNode;
  value?: React.ReactNode;
  className?: string;
  strong?: boolean;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4", strong && "font-semibold", className)}>
      <span className="min-w-0">{label}</span>
      {value !== undefined && <span className="shrink-0 text-right tabular-nums">{value}</span>}
    </div>
  );
}

/** Deterministic barcode drawn from a hex string (a proof hash). Decorative: the hash itself is shown as text nearby. */
export function Barcode({ value, className, height = 44 }: { value: string; className?: string; height?: number }) {
  const digits = value.replace(/[^0-9a-f]/gi, "").toLowerCase() || "0";
  const bars: Array<{ x: number; w: number }> = [];
  let x = 0;
  const push = (w: number, gap: number) => {
    bars.push({ x, w });
    x += w + gap;
  };
  push(2, 1);
  push(1, 1);
  for (const ch of digits) {
    const n = parseInt(ch, 16);
    push(1 + (n % 3), 1 + ((n >> 2) % 2));
  }
  push(1, 1);
  push(2, 0);
  return (
    <svg viewBox={`0 0 ${x} ${height}`} preserveAspectRatio="none" className={cn("block h-11 w-full", className)} aria-hidden focusable="false">
      {bars.map((b, i) => (
        <rect key={i} x={b.x} y={0} width={b.w} height={height} fill="var(--ink)" />
      ))}
    </svg>
  );
}

/** The red rubber stamp. Slams in once when `show` turns true. */
export function Stamp({ children, className, delay = 0, ink }: { children: React.ReactNode; className?: string; delay?: number; ink?: boolean }) {
  const reduce = useReducedMotion();
  return (
    <motion.span
      className={cn("stamp inline-block text-2xl", className)}
      style={ink ? { color: "var(--ink)" } : undefined}
      initial={reduce ? { rotate: -8 } : { opacity: 0, scale: 2.4, rotate: -16 }}
      animate={{ opacity: 0.94, scale: 1, rotate: -8 }}
      transition={reduce ? { duration: 0 } : { delay, duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
    >
      {children}
    </motion.span>
  );
}

const LAMPORTS = 1_000_000_000n;

/** Price-tag numerals: big whole part, small raised decimals, unit after. */
export function Price({
  lamports,
  points,
  className,
  unitClassName,
}: {
  lamports?: string | number | bigint;
  points?: number;
  className?: string;
  unitClassName?: string;
}) {
  if (points !== undefined) {
    return (
      <span className={cn("inline-flex items-baseline gap-1 font-wide font-extrabold tabular-nums", className)}>
        {points.toLocaleString("en-US")}
        <span className={cn("text-[0.45em] font-bold tracking-normal", unitClassName)}>pts</span>
      </span>
    );
  }
  const v = BigInt(lamports ?? 0);
  const whole = (v / LAMPORTS).toString();
  let frac = (v % LAMPORTS).toString().padStart(9, "0").replace(/0+$/, "");
  if (frac.length < 2) frac = frac.padEnd(2, "0");
  frac = frac.slice(0, 4);
  return (
    <span className={cn("inline-flex items-start font-wide font-extrabold tabular-nums", className)} aria-label={`${whole}.${frac} SOL`}>
      <span aria-hidden>{whole}</span>
      <span aria-hidden className="mt-[0.12em] text-[0.5em] leading-none">.{frac}</span>
      <span aria-hidden className={cn("mt-auto ml-1 mb-[0.12em] text-[0.38em] leading-none font-bold tracking-normal", unitClassName)}>
        SOL
      </span>
    </span>
  );
}
