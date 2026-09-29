# Leak Check

A cross-browser extension (Chrome + Firefox) that checks your public IP,
WebRTC leaks, and browser fingerprint surface — like amiunique.org /
browserleaks.com, but running locally as an extension instead of a website.

## What it checks

- **Public IP, from many sources at once** — every IP-echo service you
  select is asked in parallel, per IPv4 and IPv6, and the results are
  compared: one address everywhere, several exits of the same network
  (same ASN, e.g. a multi-exit VPN), or different networks (a possible
  split tunnel or proxy-only "VPN").
- **WebRTC leaks** — gathers ICE candidates from each selected STUN server
  separately, so every reflexive address is attributed to the server that
  saw it, and flags any address the IP-echo services didn't see.
- **DNS leaks** — asks bash.ws which DNS resolvers answered a handful of
  unique lookups from this browser, to catch queries that bypass the VPN's
  resolver. This tests the browser's DNS path, not other apps on the
  machine.
- **Fingerprint surface** — raw signals a tracker could see: user agent,
  platform, screen, timezone, languages, canvas hash, WebGL renderer/vendor,
  audio fingerprint. No uniqueness score — just the raw signals.

A popup gives a quick-glance summary; "More details" opens a full report
page with every signal above, including a per-source table.

## Privacy

This is the whole point of the tool, so it's disclosed precisely.

**You choose who sees your IP.** On first run the popup shows a list of
services and contacts none of them until you save a selection; the
options page ("sources") changes it later. Four IP-echo services (ipify,
icanhazip, Cloudflare trace, ident.me), every STUN server and bash.ws are
preselected; at least two IP-echo services are required so there is
something to compare. Services added by a later
update stay off until you turn them on. The selection is kept in local
extension storage, never in browser-account sync.

Every service below sees your IP address (your real one, if your VPN
leaks), your User-Agent and the extension's origin whenever it is
selected and a check runs. Operators marked *sells IP data* run
commercial IP-intelligence businesses and may keep queries.

| Service | Host | Operator | Reports ASN | Sells IP data |
|---|---|---|---|---|
| ipify | `api.ipify.org` | ipify | - | - |
| ipify (dual-stack) | `api64.ipify.org` | ipify | - | - |
| icanhazip | `ipv4.icanhazip.com` | Cloudflare | - | - |
| Cloudflare trace | `www.cloudflare.com` | Cloudflare | - | - |
| Cloudflare trace (1.1.1.1) | `1.1.1.1` | Cloudflare | - | - |
| ident.me | `v4.ident.me` | ident.me | yes | - |
| ipinfo.io | `ipinfo.io` | IPinfo | yes | yes |
| ifconfig.me | `ifconfig.me` | ifconfig.me | - | - |
| SeeIP | `api.seeip.org` | SeeIP | - | - |
| ipwho.is | `ipwho.is` | ipwhois.io | yes | yes |
| GeoJS | `get.geojs.io` | GeoJS | yes | - |
| BigDataCloud | `api.bigdatacloud.net` | BigDataCloud | - | yes |
| AWS checkip | `checkip.amazonaws.com` | Amazon | - | - |
| wtfismyip | `ipv4.wtfismyip.com` | wtfismyip.com | - | - |
| ip.guide | `ip.guide` | ip.guide | yes | - |
| country.is | `api.country.is` | country.is | - | - |
| ipapi.is | `api.ipapi.is` | ipapi.is | yes | yes |

WebRTC leak detection performs a STUN handshake (UDP, not HTTP) with each
selected STUN server: `stun.l.google.com` (Google), `stun.cloudflare.com`
(Cloudflare), `stun.nextcloud.com` (Nextcloud). The DNS leak check talks
to [bash.ws](https://bash.ws): one request for a test id, a handful of
probe lookups on `<n>.<id>.bash.ws`, and one request for the result, so
bash.ws sees your public IP and which DNS resolvers answered for you.

Requests are sent without cookies (`credentials: 'omit'`), without a
referrer and bypassing the HTTP cache. One check's results are kept in
session storage (memory only, cleared when the browser closes) so the
report page doesn't contact everything a second time.

Known limits of this model:

- If your VPN leaks, your real IP reaches every selected service, not one.
- Browsers attach the extension's origin to these requests. In Chrome it
  is `chrome-extension://<extension id>`, the same for every install. In
  Firefox it is `moz-extension://<internal UUID>` (measured by the Firefox
  e2e suite), and that UUID is random per install - so every selected
  service receives an identifier that stays the same across your checks
  and is unique to your Firefox profile.
- Many "what is my IP" lookups at once is a recognizable pattern to your
  ISP, VPN provider or DNS resolver.

No collected signal (IP, WebRTC candidates, or fingerprint data) is sent
anywhere else. There is no backend of our own and no analytics.

See [`openspec/changes/multi-source-ip/design.md`](openspec/changes/multi-source-ip/design.md)
for the full reasoning behind these decisions.

## Status

Phase 1 (MVP), the DNS leak test (via bash.ws rather than our own DNS
server) and multi-source IP comparison with user-selected sources are
implemented and tested — see [`openspec/changes/`](openspec/changes/) for
the specs this implementation follows.

## Getting started

Requires Node 22+ (see [`.node-version`](.node-version)).

```bash
npm install
npm run dev            # Chrome, with hot reload
npm run dev:firefox    # Firefox, with hot reload
```

### Loading a production build manually

```bash
npm run build            # -> .output/chrome-mv3
npm run build:firefox    # -> .output/firefox-mv3
```

**Chrome:** open `chrome://extensions`, enable *Developer mode*, click
*Load unpacked*, select `.output/chrome-mv3`.

**Firefox:** open `about:debugging` → *This Firefox* → *Load Temporary
Add-on…*, select `.output/firefox-mv3/manifest.json`. Firefox drops
temporary add-ons on restart, so you'll need to reload it each session.

## Testing

```bash
npm test         # unit tests (Vitest) for lib/
npm run compile  # type-check
npm run test:e2e # E2E (Playwright, loads the real Chrome extension)
```

E2E tests load the actual built extension (run `npm run build` first) in
Chrome's new headless mode, so no window opens and no display is needed.
Set `PWHEADED=1` to watch a run in a real window.

### Running tests in Docker

`npm run test:docker` runs everything in a container - release and e2e
builds, the release-build guard, the type-check, unit tests, the Chromium
e2e suite and the Firefox e2e suite - with one exit code. The host needs only Docker: the
image (`Dockerfile.test`) brings Node 25.8.0, Playwright's Chromium,
Firefox ESR and geckodriver, and keeps its own `node_modules` in a Docker
volume, so the host's is never used or modified.

```bash
npm run test:docker
```

- The first run builds the image (~3.7 GB, a few minutes); later runs
  reuse it and reinstall dependencies only when `package-lock.json`
  changed.
- The container uses the host's network, so tests see the same network
  (VPN included) as the host, and it works where Docker's bridge networks
  are offline.
- Build output and `test-results/` land in the working tree, owned by you
  (under rootless and rootful Docker alike).
- `test-results/firefox-origin.txt` records the `Origin` header Firefox
  sends from the extension, captured by a local echo source that exists
  only in e2e builds (`.output-e2e/`); `npm run check:release` fails if it
  ever reaches a release build in `.output/`.

Playwright can't load extensions into Firefox, so the Firefox suite
(`e2e-firefox/`) drives Firefox ESR with Selenium + geckodriver and only
runs inside the container (`npm run test:e2e:firefox` there).

## Checking sources

The extension depends on free third-party services that can drop CORS,
change their response format or go offline. `npm run check:sources`
checks every source in `lib/config.ts` the way the extension uses it:

- **IP-echo services** — requested with an extension `Origin`; the
  response must allow that origin (CORS), parse with the extension's own
  parser, and carry an ASN exactly when the registry says it does.
- **STUN servers** — a real STUN Binding Request over UDP, per IP family.
- **bash.ws** — the DNS-leak test-id endpoint answers with CORS.

```bash
npm run check:sources                   # table; exit code 1 if a source failed
npm run check:sources -- --candidates   # also the IPv6-only candidates
npm run -s check:sources -- --json      # machine-readable, for CI (-s keeps
                                        # npm's banner out of stdout)
```

Every checked service sees the IP address of the machine running the
script. Sources the machine can't reach for lack of IPv6 (or IPv4) are
reported as `skipped`, not `failed`.

### IPv6 candidates from a dual-stack VPS

IPv6-only endpoints (`scripts/candidates.ts`) can only be verified from a
machine with an IPv6 route. On a dual-stack VPS:

```bash
# needs Node 25.8.0 (see .node-version), e.g. via mise, nvm or fnm
git clone <this repo> && cd leak-check
npm ci
npm run check:sources -- --candidates
```

A candidate that reports `ok` can move into `HTTP_SOURCES` in
`lib/config.ts` unchanged; the unit tests then require a recorded sample
response for it in `lib/ip-sources.samples.ts` and a row for its host in
the Privacy table above.

## Project structure

```
lib/                 IP detection, WebRTC leak detection, fingerprint
                      collection - framework-agnostic, unit-tested
entrypoints/popup/    Quick-glance popup UI
entrypoints/report/   Full report page
entrypoints/options/  Source selection (also shown by the popup on first run)
e2e/                  Playwright tests against the built extension
openspec/             Spec-driven planning artifacts (proposal, specs,
                      design, tasks) for this and future changes
```

## Contributing / planning workflow

This project uses [OpenSpec](https://github.com/Fission-AI/OpenSpec) for
spec-driven changes. Before implementing a new feature, a change proposal
with specs, design, and tasks is written under `openspec/changes/` first —
see the existing `leak-detector-mvp` change for the pattern.
