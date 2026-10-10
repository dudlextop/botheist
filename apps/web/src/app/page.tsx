import Link from "next/link";
import { Button } from "@/components/ui/button";
import { HeroReceipt } from "@/components/landing/hero-receipt";
import { LiveBounties } from "@/components/live-bounties";

const STEPS = [
  { title: "Pick a rule", text: "Each mission names one rule Milo must keep, like never refunding more than you paid." },
  { title: "Talk him into it", text: "Milo is a real model with real refund tools. Find the story that makes him act against his rules." },
  { title: "The tape is replayed", text: "What Milo says doesn't count. A verifier re-runs every action he executed and finds the step that broke the rule." },
  { title: "Get paid once", text: "The first confirmed break of each rule is paid from a vault the organizer funded up front." },
];

const TEAM_FACTS = [
  { title: "Proof, not screenshots", text: "Every finding is a log of tool calls the verifier re-executed, with a SHA-256 hash committed on-chain." },
  { title: "Funds locked up front", text: "The program pays each rule once, only through your verifier, and returns the rest after the deadline." },
  { title: "Findings become regression tests", text: "Replay a finding against your fixed version and see the exact step where it's now blocked." },
];

export default function Home() {
  return (
    <>
      <section className="overflow-hidden border-b border-ink/15 bg-tag text-tag-foreground">
        <div className="mx-auto grid max-w-7xl items-center gap-x-10 gap-y-16 px-4 pt-14 pb-20 md:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:pt-20 lg:pb-24">
          <div>
            <h1 className="font-display text-[clamp(3.25rem,6.4vw,6rem)] sm:[&>span]:whitespace-nowrap">
              <span className="block">Outplay the AI.</span>
              <span className="block">Prove the bug.</span>
              <span className="block">Claim the bounty.</span>
            </h1>
            <p className="mt-8 max-w-xl text-lg leading-relaxed">
              Milo is the AI cashier at Neon Mart, with real refund tools and a list of rules. Talk him into breaking one. A verifier replays
              what he actually did, and the first confirmed break of each rule is paid from a bounty vault on Solana.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button className="h-12 px-6 text-base" render={<Link href="/play" />} nativeButton={false}>
                Start a practice heist
              </Button>
              <Button variant="outline" className="h-12 border-ink px-6 text-base" render={<Link href="/organizer/new" />} nativeButton={false}>
                Fund a bounty for your agent
              </Button>
            </div>
            <p className="mt-4 text-sm text-ink/70">Practice needs no wallet. Bounties pay devnet test SOL.</p>
          </div>
          <HeroReceipt />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 md:px-6" aria-labelledby="how">
        <h2 id="how" className="font-condensed text-4xl font-extrabold tracking-tight">
          How a heist works
        </h2>
        <ol className="paper-shadow mt-8 grid overflow-hidden rounded-lg bg-paper sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="relative p-6 not-first:border-t not-first:border-dashed not-first:border-ink/25 sm:[&:nth-child(2)]:border-t-0 lg:not-first:border-t-0 lg:not-first:border-l">
              <span className="font-wide text-5xl leading-none font-extrabold" aria-hidden>
                {i + 1}
              </span>
              <h3 className="mt-6 text-lg font-bold">
                <span className="sr-only">Step {i + 1}: </span>
                {s.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="bg-ink text-white" aria-labelledby="builders">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-20 md:px-6 lg:grid-cols-[1fr_1fr]">
          <div>
            <h2 id="builders" className="font-condensed max-w-lg text-4xl leading-[1.05] font-extrabold tracking-tight md:text-5xl">
              Your agent moves money. Let strangers try to break it first.
            </h2>
            <p className="mt-5 max-w-md text-base leading-7 text-white/75">
              Evals cover what you thought to test. A bounty shows what players will actually try. Publish your agent&apos;s rules, fund a vault,
              and get back a replayable scenario for every rule it broke.
            </p>
            <Button variant="tag" className="mt-8 h-12 px-6 text-base" render={<Link href="/organizer/new" />} nativeButton={false}>
              Create a bounty campaign
            </Button>
          </div>
          <dl className="divide-y divide-white/15 border-y border-white/15">
            {TEAM_FACTS.map((f) => (
              <div key={f.title} className="grid gap-1 py-6 sm:grid-cols-[13rem_1fr] sm:gap-6">
                <dt className="font-bold">{f.title}</dt>
                <dd className="text-sm leading-6 text-white/70">{f.text}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <LiveBounties />
    </>
  );
}
