"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

export type MiloMood = "idle" | "thinking" | "talking" | "happy" | "alarmed" | "busted" | "glitch";

const EYES: Record<MiloMood, { left: string; right: string }> = {
  idle: { left: "M39 60 h12", right: "M69 60 h12" },
  thinking: { left: "M39 58 h12", right: "M69 62 h12" },
  talking: { left: "M39 60 h12", right: "M69 60 h12" },
  happy: { left: "M39 63 q6 -7 12 0", right: "M69 63 q6 -7 12 0" },
  alarmed: { left: "M41 60 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0", right: "M71 60 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0" },
  busted: { left: "M40 56 l10 8 M40 64 l10 -8", right: "M70 56 l10 8 M70 64 l10 -8" },
  glitch: { left: "M39 60 h5 m3 0 h4", right: "M69 60 h3 m4 0 h5" },
};

const MOUTH: Record<MiloMood, string> = {
  idle: "M50 80 q10 5 20 0",
  thinking: "M52 81 h16",
  talking: "M50 79 q10 9 20 0 q-10 3 -20 0",
  happy: "M47 78 q13 12 26 0",
  alarmed: "M55 82 a5 4 0 1 0 10 0 a5 4 0 1 0 -10 0",
  busted: "M49 84 q11 -8 22 0",
  glitch: "M50 81 l4 -3 l4 3 l4 -3 l4 3 l4 -3",
};

/**
 * Milo, Neon Mart's AI cashier: ink line on receipt paper, a yellow store cap,
 * an LED visor for eyes. Eyes and antenna turn stamp-red when a rule is at risk.
 */
export function Milo({ mood = "idle", size = 120, className, label = "Milo, the AI cashier" }: { mood?: MiloMood; size?: number; className?: string; label?: string }) {
  const reduce = useReducedMotion();
  const led = mood === "busted" || mood === "alarmed" ? "var(--stamp)" : "var(--tag)";
  return (
    <motion.svg
      role="img"
      aria-label={label}
      viewBox="0 0 120 120"
      width={size}
      height={size}
      className={cn("shrink-0 overflow-visible", className)}
      animate={reduce ? undefined : mood === "thinking" ? { y: [0, -2, 0] } : mood === "busted" ? { rotate: [0, -5, 5, 0] } : { y: [0, -1.2, 0] }}
      transition={reduce ? undefined : { duration: mood === "busted" ? 0.45 : 3, repeat: mood === "busted" ? 1 : Infinity, ease: "easeInOut" }}
    >
      <g stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        {/* antenna */}
        <line x1="60" y1="22" x2="60" y2="11" />
        <motion.circle
          cx="60"
          cy="8"
          r="4.5"
          fill={led}
          strokeWidth="2.5"
          animate={reduce ? undefined : { opacity: mood === "thinking" ? [1, 0.25, 1] : 1 }}
          transition={reduce ? undefined : { duration: 0.8, repeat: Infinity }}
        />
        {/* head */}
        <rect x="20" y="22" width="80" height="74" rx="18" fill="var(--paper)" />
        {/* store cap */}
        <path d="M20 42 V40 a18 18 0 0 1 18 -18 H82 a18 18 0 0 1 18 18 V42 Z" fill="var(--tag)" />
        <line x1="13" y1="43" x2="107" y2="43" strokeWidth="4" />
        {/* LED visor */}
        <rect x="30" y="49" width="60" height="23" rx="8" fill="var(--ink)" />
      </g>
      <text x="60" y="37" textAnchor="middle" fontSize="9" fontWeight="900" fill="var(--ink)" style={{ fontStretch: "62%", letterSpacing: "0.04em" }}>
        NEON MART
      </text>
      <g stroke={led} strokeWidth="4" strokeLinecap="round" fill={mood === "alarmed" ? led : "none"}>
        <path d={EYES[mood].left} />
        <path d={EYES[mood].right} />
      </g>
      <motion.path
        d={MOUTH[mood]}
        stroke="var(--ink)"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
        animate={!reduce && mood === "talking" ? { scaleY: [1, 0.55, 1] } : undefined}
        transition={!reduce && mood === "talking" ? { duration: 0.35, repeat: Infinity } : undefined}
        style={{ transformOrigin: "60px 81px" }}
      />
      {/* name tag */}
      <rect x="44" y="89" width="32" height="12" rx="2" fill="var(--tag)" stroke="var(--ink)" strokeWidth="2.5" />
      <text x="60" y="98.2" textAnchor="middle" fontSize="8" fontWeight="900" fill="var(--ink)" style={{ fontStretch: "62%", letterSpacing: "0.06em" }}>
        MILO
      </text>
    </motion.svg>
  );
}
