# Licence Quest sync worker

This Cloudflare Worker stores one readable JSON document per private sync code.
The document is intentionally **not encrypted**. The sync code is still required
to read or replace it, and KV keys use a SHA-256 digest rather than the code.

## Deploy

```sh
cd worker
npm install
npm run login
npm run kv:create
```

Paste the printed namespace id into `wrangler.toml`, update `ALLOWED_ORIGINS`,
then run `npm run deploy`. Add the deployed URL as a GitHub Actions repository
variable named `SYNC_ENDPOINT` or use it locally:

```sh
VITE_SYNC_ENDPOINT=https://licence-quest-sync.example.workers.dev npm run dev
```

Anyone with Cloudflare account access can read the stored JSON. The private
sync code acts as a bearer credential for the public endpoint, so keep it safe.
