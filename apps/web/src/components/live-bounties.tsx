"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Price } from "@/components/receipt";
import { api } from "@/lib/api";
import { timeLeft } from "@/lib/format";
import type { Challenge } from "@/lib/types";

/** A hanging price tag for one funded campaign. */
export function BountyTag({ c, href = "/play" }: { c: Challenge; href?: string }) {
  const pool = c.missions.reduce((s, m) => s + BigInt(m.rewardLamports), 0n);
  const open = c.missions.filter((m) => m.state === "available").length;
  return (
    <Link
      href={href}
      className="group block origin-left rounded-md transition-transform duration-200 ease-snap hover:-rotate-1 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <div className="tag-shape relative bg-tag py-5 pr-6 pl-12 text-tag-foreground">
        <span className="absolute top-1/2 left-[22px] size-3.5 -translate-y-1/2 rounded-full bg-background ring-2 ring-ink" aria-hidden />
        <div className="flex items-start justify-between gap-4">
          <Price lamports={pool} className="text-4xl" />
          <span className="mt-1 text-sm font-semibold whitespace-nowrap">{timeLeft(c.submissionsCloseAt)} left</span>
        </div>
        <p className="mt-3 text-lg leading-snug font-bold group-hover:underline group-hover:underline-offset-4">{c.title}</p>
        <p className="mt-1 text-sm">
          {open} of {c.missions.length} rules unbroken, against {c.agent.modelLabel}
        </p>
      </div>
    </Link>
  );
}

export function LiveBounties() {
  const [items, setItems] = useState<Challenge[] | null>(null);
  useEffect(() => {
    api<Challenge[]>("/api/challenges")
      .then((c) => setItems(c.filter((x) => x.kind === "PRIZE" && x.status === "ACTIVE")))
      .catch(() => setItems([]));
  }, []);

  return (
    <section className="mx-auto max-w-7xl px-4 py-20 md:px-6" aria-labelledby="bounties">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 id="bounties" className="font-condensed text-4xl font-extrabold tracking-tight">
          Live bounties
        </h2>
        <Link href="/play" className="text-sm font-semibold underline underline-offset-4 hover:no-underline">
          See every mission
        </Link>
      </div>
      {items === null ? (
        <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="tag-shape h-40 animate-pulse bg-muted" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="mt-8 max-w-xl rounded-lg border border-dashed border-ink/30 p-6">
          <p className="font-bold">No funded bounties right now</p>
          <p className="mt-1 text-sm text-muted-foreground">Practice against the Milo academy while organizers fund the next campaign.</p>
          <Link href="/play" className="mt-3 inline-block text-sm font-semibold underline underline-offset-4 hover:no-underline">
            Go to practice
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {items.map((c) => (
            <BountyTag key={c.id} c={c} />
          ))}
        </div>
      )}
    </section>
  );
}
