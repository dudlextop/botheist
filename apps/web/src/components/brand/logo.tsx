import { cn } from "@/lib/utils";

/*
 * The BotHeist mark: a price tag worn as a burglar mask. The eyelet stays a
 * price tag's punched hole; the two slanted eye slits make it a mask and a
 * bot's visor at the same time.
 */
export const MARK_BODY = "M21 16 H56 a5 5 0 0 1 5 5 V43 a5 5 0 0 1 -5 5 H21 L5 32 Z";
export const MARK_EYES =
  "M25.5 28 L38 31.2 C37.4 35.6 33.6 37.4 30 36.6 C27 35.9 25.2 32.6 25.5 28 Z M57 28 L44.5 31.2 C45.1 35.6 48.9 37.4 52.5 36.6 C55.5 35.9 57.3 32.6 57 28 Z";
export const MARK_EYELET = "M12.2 32 a2.4 2.4 0 1 0 4.8 0 a2.4 2.4 0 1 0 -4.8 0 Z";

/** tone "tag": yellow tag, ink outline and eyes. tone "mono": one colour (currentColor), eyes cut out. */
export function LogoMark({ size = 32, tone = "tag", className }: { size?: number; tone?: "tag" | "mono"; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={cn("shrink-0", className)} aria-hidden focusable="false">
      <g transform="rotate(-16 32 32)">
        {tone === "mono" ? (
          <path fillRule="evenodd" fill="currentColor" d={`${MARK_BODY} ${MARK_EYELET} ${MARK_EYES}`} />
        ) : (
          <>
            <path d={MARK_BODY} fill="var(--tag)" stroke="var(--ink)" strokeWidth="3.2" strokeLinejoin="round" />
            <path d={`${MARK_EYES} ${MARK_EYELET}`} fill="var(--ink)" />
          </>
        )}
      </g>
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return <span className={cn("font-wide text-xl leading-none font-extrabold tracking-[-0.045em]", className)}>BotHeist</span>;
}

export function Logo({ className, markSize = 34 }: { className?: string; markSize?: number }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark size={markSize} />
      <Wordmark />
    </span>
  );
}
