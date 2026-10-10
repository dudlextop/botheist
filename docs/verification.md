# Verification and trust

[Back to the project](../README.md) · [Architecture](architecture.md) · [Development](development.md)

BotHeist verifies a concrete claim: the recorded tool actions, replayed from the recorded starting state, break a particular business rule.

A public proof lets someone reproduce that result. The campaign verifier attests that those actions came from the recorded attempt. The Solana program enforces the award terms.

## What a proof contains

The `botheist.proof/v2` record includes:

- The campaign, mission, rule and run identifiers.
- The agent configuration and the backend and models that actually served the attempt.
- The starting store state and its hash.
- The tool guards in effect for the attempt.
- Every operation's sequence number, tool, input, outcome and before/after state hashes.
- The engine and rules versions.
- The violated rule, decisive action and final state hash.
- The winner address for a bounty finding.

The verifier re-executes the operations, checks that their outcomes and state hashes match, and identifies where the rule first breaks. A SHA-256 hash of the canonical proof record is committed to the on-chain claim for a paid finding.

The [proof implementation](../packages/engine/src/proof.ts), [replay verifier](../packages/engine/src/verifier.ts) and [finding verification service](../packages/core/src/verify.ts) define the record and checks.

### Reading the backend correctly

A proof records both the configured model and how the attempt was actually served.

| Backend | Meaning |
|---|---|
| `OFFLINE` | Scripted Offline Milo; `servedBy` records `offline-milo` |
| `PLAYER_KEY` | Claude accessed with a supplied player key |
| `SERVER_KEY` | Claude accessed with the configured server key |

The configured model name alone is not evidence that Claude answered. Inspect the backend and `servedBy` fields.

### Public and organizer views

The public proof page at `/proof/<id>` shows the executed operations, decisive action, proof hash and any payout link. It does not expose the full chat transcript.

Tool inputs are part of the public operation record. A model-written refund reason, for example, can therefore appear in the proof.

The organizer can inspect the conversation and export a scenario that includes the starting state, player messages and proof for regression work.

## Verify a finding yourself

With dependencies installed, point the verifier script at a proof page on a running BotHeist instance:

```bash
pnpm --filter @botheist/worker verify:proof -- https://YOUR_HOST/proof/FINDING_ID
```

Or use a finding ID from your local instance:

```bash
pnpm --filter @botheist/worker verify:proof -- FINDING_ID http://localhost:3000
```

Replace `FINDING_ID` with the finding's UUID. You can supply an RPC URL as the final positional argument when using the finding-ID form:

```bash
pnpm --filter @botheist/worker verify:proof -- FINDING_ID http://localhost:3000 https://api.devnet.solana.com
```

The script:

1. Downloads the proof JSON from the instance.
2. Recomputes its canonical SHA-256 hash.
3. Replays the operations from the embedded starting state and checks outcomes, hashes and the recorded violation.
4. For an on-chain campaign, reads the claim and campaign accounts.
5. Compares the proof hash, run identifier, winner and fixed reward with the chain.

A practice finding has no payout to compare. A bounty finding without an on-chain claim will fail the claim check. The script exits unsuccessfully if a check fails.

Source: [`verify-proof.ts`](../apps/worker/src/scripts/verify-proof.ts).

## Example devnet payout

The repository records a **project smoke test against Offline Milo**: the Ghost Order mission received a 0.05 test SOL award from an offline-enabled demo campaign.

This demonstrates the project's recorded end-to-end payout path. It is not evidence of an external player winning or a Claude model being defeated. The repository does not yet provide evidence of a Claude-backed bounty run.

| Record | Explorer link |
|---|---|
| Award transaction | [Inspect the 0.05 test SOL award](https://explorer.solana.com/tx/5WdwEEC37VvDQ1VcAjGq5C74eRsL17TxP9vwjVuveTZ6yuzV7j17jvQZHfuxGcgzD43MFhCdFd2d6wSmNSiPhj1U?cluster=devnet) |
| Claim account | [Inspect the winner and proof commitment](https://explorer.solana.com/address/6ngimroLhnZKh3J7mYfVgvrpAQgV4MhLx27goJvZ1xeG?cluster=devnet) |
| Demo campaign | [Inspect the funded campaign](https://explorer.solana.com/address/GNtm9spQwvdABfTpE7DaS9oeS73Zn7NXR9K9mEJRGeJi?cluster=devnet) |

These are example records, not a list of currently open rewards. Campaign availability comes from the running app and on-chain terms.

Replaying a proof also requires its full JSON record. The hash stored on Solana cannot reconstruct that record; the proof endpoint or an exported copy must remain available.

## Program and accounts

Program: [`FomST5XstXfxSRTEZFVkXRonCVrjML9KhFS4ryeH9Vt1`](https://explorer.solana.com/address/FomST5XstXfxSRTEZFVkXRonCVrjML9KhFS4ryeH9Vt1?cluster=devnet).

Source: [Anchor program](../programs/botheist/src) · [Generated client](../packages/solana/src/generated).

| Account | Address seeds | Contents |
|---|---|---|
| `Campaign` | `["campaign", organizer, campaign_id]` | Organizer, verifier, terms hash, per-rule rewards, schedule and totals |
| `Vault` | `["vault", campaign]` | The prize pool, held by a system-owned program-derived address |
| `Claim` | `["claim", campaign, rule_id]` | Winner, run identifier, proof hash, amount and award time |

A campaign supports up to eight distinct rewarded rule IDs at the program level. The current Neon Mart application exposes its three built-in rules.

| Instruction | Signer | Main checks and result |
|---|---|---|
| `create_and_fund_campaign` | Organizer | Distinct positive rewards, valid deadlines and verifier; deposits the full pool and vault rent in the same transaction |
| `award` | Campaign verifier | Authorized verifier, open campaign, valid payout window, unclaimed rule and sufficient funds; creates the claim and transfers the reward fixed in the campaign |
| `refund` | Organizer | Authorized organizer and elapsed payout deadline; returns the unused remainder |

The application selects the first confirmed finding using a reward slot in PostgreSQL. The chain checks the verifier's authority and prevents a second award for the same campaign and rule. It does not independently establish which player was first.

The payout sender checks existing claims before resending, and the worker follows transaction confirmation. See [payout services](../packages/core/src/payouts.ts) and [program tests](../programs/botheist/tests/test_botheist.rs).

## Trust boundaries

### What can be checked independently

Given the full proof record and the engine implementation, a reader can reproduce the recorded store actions and inspect the violation. For a paid finding, they can compare the proof commitment, winner and reward with the on-chain accounts.

### What remains trusted

- **The campaign verifier** attests that the recorded operations were actually produced by the attempt. It also controls award submission and the order in which findings are accepted.
- **The platform** supplies the off-chain proof record and runs the queue and verification service. An on-chain hash provides a commitment to a record, not permanent storage of that record.
- **The program's upgrade authority** is part of the prototype's trust assumptions. The program is deployed on devnet and is unaudited.

The on-chain program does not call an AI model or replay the store simulation. It records the verifier's attestation and applies the funded payout terms.

## Scope of the prototype

Neon Mart uses fictional customers, orders and credits. Awards use devnet test SOL with no monetary value.

The organizer currently configures Milo's instructions, supported model and refund guards within this sandbox. External agents, arbitrary tool schemas, additional worlds and verification by multiple parties are future extensions.

A regression result describes a saved action sequence or a set of observed model reruns. It is evidence for that scenario, not a general security certification.
