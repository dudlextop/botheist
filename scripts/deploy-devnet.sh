#!/usr/bin/env bash
# Build and deploy the BotHeist program to Solana devnet with the project's
# deployer test keypair. Uses the Anza 3.1.10 toolchain installed alongside any
# system Solana CLI (see PLAN.md, phase 0).
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/share/solana-anza/solana-release/bin:$PATH"
export NO_DNA=1

DEPLOYER=.keys/deployer.json
URL=${SOLANA_RPC_URL:-https://api.devnet.solana.com}

echo "Deployer: $(solana-keygen pubkey $DEPLOYER)  balance: $(solana balance $(solana-keygen pubkey $DEPLOYER) --url "$URL")"
anchor build
solana program deploy target/deploy/botheist.so \
  --program-id target/deploy/botheist-keypair.json \
  --keypair "$DEPLOYER" \
  --url "$URL" \
  --with-compute-unit-price 10000
solana program show "$(solana-keygen pubkey target/deploy/botheist-keypair.json)" --url "$URL"
