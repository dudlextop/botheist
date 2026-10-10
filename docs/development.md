# Development

[Back to the project](../README.md) · [Architecture](architecture.md) · [Verification and trust](verification.md)

## Local practice

Use Node.js 22, pnpm 10 and PostgreSQL 16+. The repository pins pnpm in [`package.json`](../package.json); Node.js 22 is also used in [CI](../.github/workflows/ci.yml).

```bash
git clone https://github.com/dudlextop/botheist.git
cd botheist
pnpm install
cp .env.example .env
createdb botheist
```

Edit the root `.env`:

| Setting | For local practice |
|---|---|
| `DATABASE_URL` | A working connection to your `botheist` PostgreSQL database. Replace `USER` in the example and supply a password if your database requires one. |
| `SESSION_SECRET` | A random secret. You can generate 32 random bytes with the command below and paste the result into this setting. |
| `KEY_SEAL_SECRET` | Remove the empty entry copied from the example to use `SESSION_SECRET`, or set a separate random secret. An empty value does not trigger the fallback. |
| `PAYOUTS_ENABLED` | Set to `"false"` for practice without sending bounty transactions. Finding verification still runs. |
| `ANTHROPIC_API_KEY` | Leave empty to start with Offline Milo, or configure a server key. |

Generate a local session secret:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

The verifier keypair is used for funded campaigns and payouts. Academy practice does not require one.

Prepare the database and start the worker:

```bash
pnpm --filter @botheist/db generate
pnpm --filter @botheist/db migrate:deploy
pnpm worker
```

The worker creates the academy catalog automatically. Keep it running, then use another terminal at the repository root:

```bash
pnpm dev
```

Open [localhost:3000/play](http://localhost:3000/play). Choose a version of Milo and one of the three missions. Guest practice requires no wallet.

The web app, worker and Prisma configuration read the root `.env`. Changes to worker configuration require restarting the worker.

### Run worker roles separately

```bash
pnpm --filter @botheist/worker agent
```

In another terminal:

```bash
pnpm --filter @botheist/worker payout
```

Both roles are needed for the full finding flow, including offline practice. Only the payout role reads the verifier keypair when it needs to interact with the chain.

## Using Claude

The backend for an attempt is selected as follows:

1. A supplied player key uses that player's Anthropic account.
2. Otherwise, a configured `ANTHROPIC_API_KEY` supplies the server key.
3. Without either key, the run uses scripted Offline Milo.

Use the model-key control in the app header to add or remove a player key. Available model choices are defined in [`packages/agent/src/models.ts`](../packages/agent/src/models.ts); the adapter is in [`provider.ts`](../packages/agent/src/provider.ts).

Claude usage is billed to the account whose key is used. The turn loop tracks model usage and enforces attempt limits. The prize pool is separate from the model budget.

### Key handling

The browser stores a brought key in local storage until the player removes it. It sends the key when starting an attempt or requesting a model-based regression check. On the server, the key is encrypted with AES-256-GCM for the queued work, opened by the agent worker and erased from the attempt or regression record after completion.

Set `KEY_SEAL_SECRET` to a separate random encryption secret, or remove that variable entirely to use `SESSION_SECRET`. The empty value in `.env.example` does not trigger the fallback. The browser copy persists independently of server cleanup.

An action replay does not call Claude and does not need a model key. A model-based rerun uses the selected backend; without a key it runs Offline Milo.

### Offline demo bounties

A normal bounty requires a Claude key from the player or server. An organizer can explicitly allow offline play for a demo campaign. The run, finding and proof record the backend that actually served the attempt.

The existing payout evidence comes from an offline smoke test. Follow [the verification guide](verification.md#example-devnet-payout) to inspect it.

## Devnet campaigns

The deployed program address is linked in the [verification guide](verification.md#program-and-accounts). Funding and payout testing use devnet test SOL.

To run a funded campaign:

1. Configure `SOLANA_CLUSTER`, the server and browser RPC URLs, and a verifier keypair for your instance.
2. Set `VERIFIER_PUBKEY` to that keypair's public key and `VERIFIER_KEYPAIR_PATH` to its absolute path.
3. Give the verifier devnet funds for transaction fees and claim-account creation.
4. Set `PAYOUTS_ENABLED="true"` and restart the payout worker.
5. Sign in with an organizer wallet at `/organizer/new`. Configure Milo, the missions, rewards, limits and deadlines.
6. Fund the campaign from the organizer wallet. The app activates it after checking the on-chain terms.

The organizer funds the prize pool and account rent. The program permits withdrawal of the remainder after the payout deadline.

### Environment reference

| Setting | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection |
| `SOLANA_CLUSTER` | Network; defaults to devnet |
| `SOLANA_RPC_URL` | Server RPC endpoint |
| `NEXT_PUBLIC_SOLANA_RPC_URL` | Browser RPC endpoint |
| `SOLANA_TX_VERSION` | Transaction version used by the configured client |
| `VERIFIER_PUBKEY` | Public verifier address committed in campaign terms |
| `VERIFIER_KEYPAIR_PATH` | Verifier signing keypair; needed by the payout role |
| `PAYOUTS_ENABLED` | When false, keep payouts pending without sending them |
| `SESSION_SECRET` | Session signing secret and default key-sealing secret |
| `KEY_SEAL_SECRET` | Separate secret for sealing model keys; omit the variable entirely to use `SESSION_SECRET` |
| `ANTHROPIC_API_KEY` | Optional server Claude key |

See [`.env.example`](../.env.example) and [configuration loading](../packages/core/src/config.ts) for defaults.

### Maintainer scripts

| Command | Purpose and prerequisites |
|---|---|
| `pnpm --filter @botheist/worker seed:devnet` | Creates and funds a campaign using `.keys/organizer.json` and the configured verifier. Set `SEED_OFFLINE=true` to allow a no-key demo bounty. |
| `pnpm --filter @botheist/worker smoke:bounty -- <campaignId> GHOST_ORDER` | Exercises a bounty with a test wallet and follows the payout. Use an offline-enabled demo campaign for the scripted smoke path. |
| `pnpm --filter @botheist/worker verify:proof -- <proof URL>` | Replays a published proof and compares it with the chain. |
| `pnpm --filter @botheist/worker dev-session -- .keys/organizer.json` | Signs in with a local test keypair and prints a session cookie. |
| `scripts/deploy-devnet.sh` | Builds and deploys using the project's deployer and program keypairs. This is a maintainer deployment workflow, not a prerequisite for local practice. |

The smoke script also needs the app and both worker roles running, payouts enabled, an available reward, and `.keys/player.json` (or a keypair path as the third positional argument). Its fixed messages target Offline Milo, so run that path with no server model key configured. The script itself does not force the backend to offline.

Building the program requires the Rust and Solana toolchains. The repository uses Rust 1.89 and Agave 3.1.10 in CI; the deployment script expects Anchor CLI 1.1.1. Consult the lockfiles and the script when reproducing the build.

## Tests and CI

The repository contains tests for the simulator, agent loop, domain services, Solana program, generated client and browser flow. The commands below are the test entry points; they are not a claim that every suite has been run in your environment.

| Area | Coverage |
|---|---|
| [Engine tests](../packages/engine/test/engine.test.ts) | Refund tools, business rules, decisive actions, replay consistency, proof hashing and guards |
| [Agent tests](../packages/agent/test) | Turn limits, model errors, usage tracking, backend routing and offline levels |
| [Core tests](../packages/core/test/core.test.ts) | Verification, reward races, request retries, sessions, regressions and key cleanup |
| [Program tests](../programs/botheist/tests/test_botheist.rs) | Funding, verifier authorization, fixed rewards, duplicate awards, deadlines and refunds |
| [Client tests](../packages/solana/test/program.test.ts) | Generated instructions, addresses, payout retries and program integration |
| [Browser flow](../apps/web/e2e/heist.spec.ts) | A complete heist, reload during an attempt and the proof page |

For the engine and agent suites:

```bash
pnpm --filter @botheist/engine test
pnpm --filter @botheist/agent test
```

Core tests clear their database before each test. Create and migrate a dedicated test database, replacing `USER` with your PostgreSQL user and adding a password if needed:

```bash
createdb botheist_test
export TEST_DATABASE_URL="postgresql://USER@localhost:5432/botheist_test?schema=public"
DATABASE_URL="$TEST_DATABASE_URL" pnpm --filter @botheist/db migrate:deploy
pnpm --filter @botheist/core test
```

Prisma reads `DATABASE_URL`; the core test configuration reads `TEST_DATABASE_URL`. Keep both commands pointed at the same test database. The [CI workflow](../.github/workflows/ci.yml) also shows database setup.

For the program and generated client:

```bash
cargo build-sbf --manifest-path programs/botheist/Cargo.toml
cargo test -p botheist
pnpm --filter @botheist/solana test
```

For the browser flow, start the web app and worker without a server model key so the fixed test messages use Offline Milo. Install Chromium and select that channel explicitly:

```bash
pnpm --filter @botheist/web exec playwright install chromium
E2E_CHANNEL=chromium pnpm --filter @botheist/web e2e
```

`pnpm test` runs the workspace TypeScript suites. The Solana client suite requires the built program; core tests require the test database.

[GitHub Actions](https://github.com/dudlextop/botheist/actions/workflows/ci.yml) runs application tests, package typechecks, the program build and both LiteSVM suites. The browser flow is run separately.
