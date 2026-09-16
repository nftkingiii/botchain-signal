# Signal

Signal is a network operations instrument for BOT Chain Testnet. It collects timestamped reads from the configured RPC endpoint, charts only samples this browser has actually observed, and exposes the provenance of each sample. It is not a generic uptime claim, token-price page, or independent RPC quorum monitor.

The public web app is under [`web/`](web/). Testnet contract deployment evidence and explorer links are preserved in [BOTCHAIN_TESTNET.md](BOTCHAIN_TESTNET.md).

## What it reads

- `eth_chainId` (must match 968 / `0x3c8`)
- `eth_getBlockByNumber("latest")` (number, hash, timestamp, age, response time)
- `eth_getCode` for the deployed SignalAnchor address
- `SignalAnchor.PRODUCT()` and `TARGET_CHAIN_ID()` in the contract view

One RPC endpoint is configured by default; its response is an observation, not an independent health guarantee. No external oracle, indexer, or distributed sample service is integrated. Samples are retained locally in the browser, scoped to chain and contract. Failed probes appear as failures; they are never charted as successful data.

## Run locally

Requires Node.js 22–24 and npm 11.6.2.

```sh
cd web
npm ci
npm run test
npm run lint
npm run typecheck
npm run build
npm run start
```

The Next server binds to `0.0.0.0` and uses `PORT` when provided. Health and revision endpoints are `/api/healthz` and `/api/revision`.

## Environment

Copy `web/.env.example` only when you need to override the defaults. No secret is required. `BOT_RPC_URL` is server-side; `NEXT_PUBLIC_EXPLORER_URL` and `NEXT_PUBLIC_SIGNAL_ANCHOR` are public configuration values. Do not put credentials in these variables.

## Anchor boundary

The only write is the deployed `SignalAnchor.anchorObservation(bytes32,string,string)`. Signal hashes the displayed incident/source and sampled block context into an observation ID, simulates the exact call, checks the wallet chain, and waits for a successful receipt after the user explicitly chooses to continue and approves in their wallet. This anchor proves that the submitted fields were included; it does not prove their truth or that an underlying business action occurred. Public network reads do not require a wallet.

## Railway

Railway uses the checked-in [`railway.json`](railway.json): `npm --prefix web ci && npm --prefix web run build`, then `npm --prefix web run start`. Set the health check path to `/api/healthz` (already configured). Mainnet is not configured or implied.

## Contracts

```sh
forge fmt --check
forge build
forge test
```
