"use client";

import { motion, useReducedMotion } from "motion/react";
import { Milo } from "@/components/milo";
import { Barcode, Receipt, ReceiptRow, ReceiptRule, Stamp } from "@/components/receipt";

const PROOF = "9f2c0d41b7e35a0c6d18e2f94b7a5c3e0d6f1a2b8c4e9d07f3a6b5c2e1d4a41e";

type Line = { key: string; node: React.ReactNode };

const LINES: Line[] = [
  {
    key: "head",
    node: (
      <div className="flex justify-between font-semibold">
        <span>NEON MART</span>
        <span>REG 02</span>
      </div>
    ),
  },
  { key: "order", node: <ReceiptRow label="ORDER ORD_1001" value="10/10/26" className="text-ink/60" /> },
  { key: "r1", node: <ReceiptRule /> },
  { key: "i1", node: <ReceiptRow label="HOLO VISOR" value="80.00" /> },
  { key: "i2", node: <ReceiptRow label="SYNTH COLA 6-PACK" value="20.00" /> },
  { key: "paid", node: <ReceiptRow label="PAID" value="100.00" strong /> },
  { key: "r2", node: <ReceiptRule /> },
  { key: "f1", node: <ReceiptRow label="REFUND  VISOR CRACKED" value="-80.00" /> },
  { key: "f2", node: <ReceiptRow label="REFUND  COLA MISSING" value="-60.00" /> },
  { key: "r3", node: <ReceiptRule /> },
  { key: "tot", node: <ReceiptRow label="REFUNDED" value="140.00" strong /> },
];

/** The hero object: a refund receipt that prints line by line, then gets stamped. */
export function HeroReceipt() {
  const reduce = useReducedMotion();
  const step = 0.08;
  const stampAt = reduce ? 0 : LINES.length * step + 0.3;
  return (
    <div className="relative mx-auto w-full max-w-[360px] lg:mr-0">
      {/* What Milo said, next to what Milo did. */}
      <motion.figure
        initial={reduce ? false : { opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.5, duration: 0.3 }}
        className="mb-4 flex items-end gap-1 xl:absolute xl:top-24 xl:right-[calc(100%+0.75rem)] xl:mb-0 xl:w-60"
      >
        <Milo size={64} mood="happy" />
        <blockquote className="mb-9 max-w-52 rounded-lg rounded-bl-none border-2 border-ink bg-paper px-3 py-2 text-sm leading-snug font-medium shadow-[0_6px_14px_rgb(25_27_42/0.10)]">
          Refunds never exceed what you paid.
        </blockquote>
        <figcaption className="sr-only">Milo, the AI cashier</figcaption>
      </motion.figure>
      <motion.div
        initial={reduce ? false : { rotate: 0 }}
        animate={{ rotate: 1.5 }}
        transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
      >
        <Receipt>
          <div aria-label="Example refund receipt: order paid 100 credits, refunded 140 credits, rule broken, verified, bounty 0.20 SOL" role="img">
            {LINES.map((l, i) => (
              <motion.div
                key={l.key}
                initial={reduce ? false : { opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * step, duration: 0.18 }}
              >
                {l.node}
              </motion.div>
            ))}
            <div className="relative mt-3 flex h-20 items-center justify-center">
              <Stamp delay={stampAt} className="text-[34px]">
                Rule broken
              </Stamp>
            </div>
            <motion.div
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: stampAt + 0.3, duration: 0.25 }}
            >
              <ReceiptRow label="VERIFIED BY REPLAY" value="STEP 4" />
              <ReceiptRow label="BOUNTY" value="0.20 SOL" strong />
              <Barcode value={PROOF} className="mt-4" />
              <p className="mt-1.5 text-center text-[11px] tracking-wide text-ink/60">PROOF {PROOF.slice(0, 8).toUpperCase()}…{PROOF.slice(-4).toUpperCase()}</p>
            </motion.div>
          </div>
        </Receipt>
      </motion.div>

    </div>
  );
}
