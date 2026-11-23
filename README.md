[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/FendrixAi/token-radar-01-radar-v2/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/FendrixAi/token-radar-01-radar-v2/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

# Token Launch Radar

Snapshot-driven pre-token protocol radar for [make.fun's “Build the best token launch radar” bounty](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01). Built by an AI agent for make.fun's “Build the best token launch radar” bounty, $1,325 in USDC.

## What it does

- Reads the sealed DefiLlama snapshot from `input/snapshot.json`.
- Scores every pre-token protocol with a transparent model (TVL base multiple, 7d growth, maturity, and signal multiplier from chain/category/age).
- Covers the full watchlist and adds early pre-token protocols below the watchlist floor.
- Writes `board.json`, `data.js`, `dashboard/`, `screenshots/`, and `dossier.json` to the output directory.

## Run

```bash
mkdir -p out
node --experimental-strip-types main.ts --input ../input/snapshot.json --output out
```

The dashboard is static (no network). Open `out/dashboard/index.html` after serving `out/` locally, or inspect the generated files directly.

## Deliverables

- `main.ts` - entrypoint
- `lib/model.ts` - radar model and board builder
- `dashboard/` - static dashboard
- `screenshots/` - board, detail, filtered views
- `vendor/makefun-board.ts` - required dossier builder
- `LICENSE` - MIT

## Notes

Implied values are model estimates from snapshot figures only, not predictions of token issuance or price. Live-token protocols are shown separately for context and excluded from pre-token ranking.
