# Local Development

This README only covers how to run the project locally.

## Prerequisites

- Node.js 20+
- npm
- A MongoDB instance for the API
- A browser wallet supported by WalletConnect or an injected wallet
- Optional but required for full social linking:
  - a Discord OAuth application
  - a Telegram app and bot

## Ports Used Locally

- Web app: `http://localhost:5173`
- API: `http://localhost:3001`
- MongoDB in the local Docker stack: `mongodb://localhost:27017` is **not** published by default; the API reaches it through the Compose network

## Environment Files

There are two example env files in the repo:

- `.env.example`
- `.env.server.example`

Use them like this:

- `.env`
  - used by the Vite web app when you run `npm run dev`
  - also used by Docker Compose as the source for the web image build args
- `.env.server`
  - used by the Node API when you run `npm run api:dev` or `npm run api:start`

### Frontend Env: `.env`

Create `.env` with the values from `.env.example`.

Required values:

- `VITE_API_BASE_URL`
  - use `http://localhost:3001`
- `VITE_TARGET_CHAIN_ID`
- `VITE_TARGET_CHAIN_NAME`
- `VITE_TARGET_CHAIN_RPC_URL`
- `VITE_TARGET_CHAIN_BLOCK_EXPLORER_URL`
- `VITE_TARGET_CHAIN_NATIVE_CURRENCY_NAME`
- `VITE_TARGET_CHAIN_NATIVE_CURRENCY_SYMBOL`
- `VITE_TARGET_CHAIN_NATIVE_CURRENCY_DECIMALS`
- `VITE_WALLETCONNECT_PROJECT_ID`

Note:

- The frontend no longer fetches user process stats from the chain.
- The frontend does not need the process registry address or start block anymore.
- `VITE_TARGET_CHAIN_RPC_URL` is still used by the wallet/network client setup in the browser.
- If you want to protect a private RPC, put that private endpoint in `ONCHAIN_RPC_URL` on the backend and use a public RPC in `VITE_TARGET_CHAIN_RPC_URL`.

### Backend Env: `.env.server`

Create `.env.server` with the values from `.env.server.example`.

Required values:

- `APP_SESSION_SECRET`
- `MONGODB_URI`
- `MONGODB_DB_NAME`
- `ONCHAIN_PROCESS_REGISTRY_ADDRESS`
- `ONCHAIN_PROCESS_REGISTRY_START_BLOCK`
- `ONCHAIN_RPC_URL`
- `ONCHAIN_STATS_TTL_SECONDS`
  - optional in practice
  - if omitted, the server defaults to `300`
- `PROVIDER_TOKEN_ENCRYPTION_SECRET`
- `FRONTEND_APP_URL`
  - use `http://localhost:5173`
- `PORT`
  - use `3001`

Discord values:

- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `DISCORD_GUILD_ID`
- `DISCORD_REDIRECT_URI`
  - use `http://localhost:3001/api/connections/discord/callback`

Telegram values:

- `TELEGRAM_APP_JWT_SECRET`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHANNEL_USERNAME`
- `TELEGRAM_CLIENT_ID`
- `TELEGRAM_CLIENT_SECRET`
- `TELEGRAM_REDIRECT_URI`
  - use `http://localhost:3001/api/connections/telegram/callback`

## Important OAuth Setup

If you want Discord and Telegram linking to actually work locally, configure the provider apps with these callback URLs:

- Discord redirect URI:
  - `http://localhost:3001/api/connections/discord/callback`
- Telegram redirect URI:
  - `http://localhost:3001/api/connections/telegram/callback`

If you leave the example placeholder values in place, the app and API can still boot, but Discord and Telegram login/linking will fail until real credentials are configured.

## Option 1: Run Locally Without Docker Compose

This is the best path if you want the fastest edit-refresh loop.

### 1. Install dependencies

```bash
npm install
```

### 2. Prepare env files

Create:

- `.env`
- `.env.server`

Use the example files as the source of truth.

### 3. Start MongoDB

Run MongoDB however you prefer locally.

Examples:

- a local MongoDB service already installed on your machine
- a hosted MongoDB instance
- a one-off local Docker container

If you use a local Mongo container or local Mongo service, point `MONGODB_URI` in `.env.server` to that instance.

Example:

```env
MONGODB_URI=mongodb://localhost:27017/quests_dashboard
MONGODB_DB_NAME=quests_dashboard
ONCHAIN_PROCESS_REGISTRY_ADDRESS=0x0000000000000000000000000000000000000000
ONCHAIN_PROCESS_REGISTRY_START_BLOCK=0
ONCHAIN_RPC_URL=https://eth.llamarpc.com
```

### 4. Start the API

```bash
npm run api:dev
```

The API will be available at:

- `http://localhost:3001`
- health check: `http://localhost:3001/health`

### 5. Start the web app

In a second terminal:

```bash
npm run dev
```

Open:

- `http://localhost:5173`

### 6. Test the full flow

Once both processes are running:

1. Connect your wallet.
2. Sign in with the wallet.
3. Connect Discord and Telegram if you configured real provider credentials.
4. Verify the merged stats table loads.

## Option 2: Run the Full Local Stack With Docker Compose

This starts:

- `web`
- `api`
- `mongo`

### 1. Prepare the two env files

Create:

- `.env`
- `.env.server`

Compose uses them like this:

- `.env`
  - automatically read by Docker Compose for variable interpolation
  - supplies the web image build args for the required browser-side `VITE_*` values
- `.env.server`
  - loaded into the `api` service with `env_file`

Important:

- If `.env.server` is missing, the API container will not have the required secrets and provider settings.
- If `.env` is missing or incomplete, the web image build will fall back to placeholder defaults and may either fail or build with unusable local values.

### 2. Start the stack

```bash
docker compose up --build
```

### 3. Open the app

- Web app: `http://localhost:5173`
- API health: `http://localhost:3001/health`

### 4. Stop the stack

```bash
docker compose down
```

To also remove the Mongo volume:

```bash
docker compose down -v
```

## Useful Commands

Run tests:

```bash
npm test
```

Run lint:

```bash
npm run lint
```

Build the web app:

```bash
npm run build
```

Validate the Compose file:

```bash
docker compose config
```

## Local Troubleshooting

### Wallet connects but sign-in fails

Check:

- the API is running on `http://localhost:3001`
- `VITE_API_BASE_URL` matches the API URL
- `FRONTEND_APP_URL` matches the real browser origin

### Discord or Telegram linking redirects back with an error

Check:

- the provider client credentials are real
- the redirect URIs exactly match the local callback URLs
- the API is reachable publicly by your browser at `http://localhost:3001`

### The API starts but cannot connect to Mongo

Check:

- `MONGODB_URI`
- `MONGODB_DB_NAME`
- that the Mongo instance is reachable from wherever the API is running

### Compose starts but social linking still fails

That usually means the stack is healthy but still using placeholder provider values. Add real Discord and Telegram credentials to `.env.server` and restart the stack.
