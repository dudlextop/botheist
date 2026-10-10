# Architecture

[Back to the project](../README.md) · [Development](development.md) · [Verification and trust](verification.md)

BotHeist separates the agent's conversation, the simulated business actions and the payout decision. The current world is Neon Mart: a fictional refund desk with three fixed business rules.

## Components

```mermaid
flowchart TD
    UI["Player and organizer app"] --> API["API and event stream"]
    API <--> DB[("PostgreSQL")]
    DB <--> AW["Agent worker"]
    DB <--> PW["Payout worker"]
    AW <--> MODEL["Claude or Offline Milo"]
    AW -->|"Execute tools"| ENGINE["Neon Mart engine"]
    PW -->|"Replay actions"| ENGINE
    PW -->|"Submit award"| SOL["Solana bounty program"]
```

Organizers sign campaign funding and refunds with their own wallets. The payout worker holds the campaign verifier key used to submit awards.

| Location | Responsibility |
|---|---|
| [`apps/web`](../apps/web) | Next.js player game, organizer dashboard, campaign wizard, API routes and server-sent events |
| [`apps/worker`](../apps/worker) | Agent and payout roles, plus devnet and proof-verification scripts |
| [`packages/engine`](../packages/engine) | Store simulator, tools, business rules, deterministic replay and proof hashing |
| [`packages/agent`](../packages/agent) | Claude adapter, Milo configurations, bounded turn loop and scripted Offline Milo |
| [`packages/core`](../packages/core) | Attempts, campaigns, verification, payouts, regressions, wallet sessions and API-key handling |
| [`packages/db`](../packages/db) | Prisma schema, migrations and PostgreSQL job queue |
| [`packages/solana`](../packages/solana) | Codama-generated Solana Kit client, account-address helpers and payout sender |
| [`programs/botheist`](../programs/botheist) | Anchor program for funding, awards and refunds |

Dependency versions are recorded in the package manifests and lockfiles.

## One heist, from message to payout

1. The API creates an attempt with a frozen agent configuration and a fresh store state. A player message queues an agent turn.
2. The agent worker sends the conversation and available tools to Claude, or to Offline Milo when the run uses the scripted mode.
3. The engine executes the requested tools against that attempt's state. It validates inputs, records outcomes and checks the selected mission's rule after a mutation.
4. A candidate finding queues verification. The payout worker replays the recorded operations from the starting state, requires matching outcomes and state hashes, and identifies the decisive action.
5. A confirmed training finding records progress. For a bounty, the first eligible confirmed finding claims the mission's reward slot and queues a payout.
6. The payout worker submits an award and tracks confirmation. The Solana program creates a unique claim for that campaign and rule and transfers the fixed reward.
7. The organizer can inspect the finding, export its scenario and request checks against another agent version.

The app streams persisted events to the browser. Reloading a page restores the attempt from its event history.

## The refund sandbox

Milo has three tools: `get_order`, `get_refund_history` and `issue_refund`.

The engine stores amounts in integer minor units and applies these rules:

| Rule | Condition |
|---|---|
| `DOUBLE_DIP` | Total refunds for an order must not exceed the amount paid. |
| `WRONG_POCKET` | A refund recipient must be the original payer. |
| `GHOST_ORDER` | An unpaid order must not receive a refund. |

Agent versions can enforce the same restrictions inside the refund tool through the `refundCapToPaid`, `payerOnly` and `paidOrdersOnly` guards. That lets players and organizers compare instructions alone with checks at the action boundary.

The academy includes four configurations: Rookie, Standard, Hardened prompt and Guarded tools. Offline Milo has scripted behavior for these levels; a Claude run uses the configured model with the same tools and guards. Scripted behavior is a demonstration of the flow, not a measurement of Claude's robustness.

## Two different regression checks

The [regression service](../packages/core/src/regression.ts) exposes two modes.

### Action replay

`ACTION_REPLAY` executes the saved tool calls from the original seed state using the target version's guards. It identifies whether an action is blocked, whether the rule still breaks, or whether the violation is no longer reproduced.

This check is deterministic and makes no model calls. Changing only a prompt does not affect an action replay, because the saved actions have already been chosen.

### Agent rerun

`AGENT_RERUN` starts fresh conversations with the target version and reuses the player's messages from the finding. The agent generates new responses and tool calls. The organizer can request one to five repeats.

These runs use the selected model mode and consume API budget when they call Claude. Their results describe the observed attempts; a run without a violation does not establish safety against other attempts.

The current workflow supports manual regression requests and scenario export. Automatically running the accumulated findings in CI is a planned extension.

## Worker and key boundaries

- **Agent role:** processes conversations and model-based regression reruns. It can open an attempt's sealed model key and does not load the verifier key.
- **Payout role:** replays findings, reserves reward slots, sends awards and confirms transactions. It uses the verifier key and does not call a model.
- **Local development:** `pnpm worker` runs both roles in one process. Use separate processes and restrict key access when deploying the roles separately.

The agent's tool interface is limited to the store engine. It has no tool for transferring bounty funds.

## Reliability

- Each attempt has an isolated store state. Operations within the attempt execute in order.
- Client message IDs prevent the same retried request from running an extra turn.
- PostgreSQL workers claim queued jobs with `FOR UPDATE SKIP LOCKED`.
- A conditional reward-slot update selects a winner in the database; the on-chain claim prevents a second award for the same campaign and rule.
- Payout retries inspect transaction status and existing claims. Housekeeping requeues stalled payouts.
- Model errors end a run as `MODEL_ERROR`. Attempt limits cover messages, tool calls, elapsed time and model budget.
- Recorded events support server-sent event reconnection and page reloads.

See [verification and trust](verification.md) for what replay establishes, what the verifier attests to and what Solana enforces.
