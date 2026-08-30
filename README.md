# Licence Quest

Licence Quest is a playful, local-first driving practice tracker for the run-up
to a practical licence exam. It tracks the countdown, weekly practice and
manoeuvre goals, saved Google Maps loops, route completions, kilometres, and
pace toward a configurable distance goal.

## Local development

```sh
npm install
npm run dev
```

Run the checks with:

```sh
npm test
npm run build
```

## Data and sync

The app always stores a local copy in `localStorage` and supports readable JSON
export and restore. Optional cross-device sync uses the Cloudflare Worker in
`worker/`. Unlike Steady, the uploaded document is intentionally **not
encrypted**. A randomly generated 256-bit sync code still gates the public
endpoint, while people with access to the Cloudflare KV namespace can read the
stored JSON.

Set `VITE_SYNC_ENDPOINT` at build time to show the sync controls. Without it,
the Content Security Policy sets `connect-src 'none'` and the app does not make
network requests.

See [`worker/README.md`](worker/README.md) for Cloudflare deployment.

## Deployment

The included GitHub Actions workflow runs tests, builds the PWA, and deploys the
`dist` folder to GitHub Pages. Add a repository Actions variable named
`SYNC_ENDPOINT` to include Cloudflare sync in that build.
