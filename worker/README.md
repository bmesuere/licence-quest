# Licence Quest sync worker

This Cloudflare Worker stores one readable JSON document behind one private sync
code. The document is intentionally **not encrypted**. The Worker accepts only
the pre-authorised code, stores only one fixed KV record, and limits valid writes
to ten per minute per Cloudflare location. Random codes cannot create KV keys.

## Deploy

```sh
cd worker
npm install
npm run login
npm run kv:create
```

Paste the printed namespace id into `wrangler.toml`, update `ALLOWED_ORIGINS`,
then create the one sync code that all of your devices will share:

```sh
SYNC_CODE="$(openssl rand -hex 32)"
printf '%s' "$SYNC_CODE" | shasum -a 256
```

Keep `SYNC_CODE` somewhere safe. Copy only the 64-character hash printed by the
second command, run `npm run secret:put`, and paste that hash at Wrangler's
prompt. The original sync code is what you enter in the Licence Quest app.

Deploy with `npm run deploy`. Add the deployed URL as a GitHub Actions repository
variable named `SYNC_ENDPOINT` or use it locally:

```sh
VITE_SYNC_ENDPOINT=https://licence-quest-sync.example.workers.dev npm run dev
```

Anyone with Cloudflare account access can read the stored JSON. The private sync
code acts as a bearer credential for the public endpoint, so keep it safe. Never
commit the code or its hash. Local `.dev.vars*` and `.env*` files are ignored.

## Why the namespace cannot be filled with random keys

The Worker hashes every presented code and compares it with `SYNC_CODE_HASH`
before touching KV. A valid request always reads or writes `doc:primary`; the
request cannot choose another key. The one-megabyte payload ceiling and write
rate limiter provide additional protection, but the allowlist is the primary
control.
