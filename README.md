# Leak Check

A cross-browser extension (Chrome + Firefox) that checks your public IP,
WebRTC leaks, and browser fingerprint surface — like amiunique.org /
browserleaks.com, but running locally as an extension instead of a website.

## What it checks

- **Public IP** — IPv4 and IPv6 looked up independently, since a VPN can
  close off one protocol while still leaking the other.
- **WebRTC leaks** — gathers ICE candidates against several independent
  public STUN servers to surface local/public addresses that bypass a VPN
  tunnel.
- **Fingerprint surface** — raw signals a tracker could see: user agent,
  platform, screen, timezone, languages, canvas hash, WebGL renderer/vendor,
  audio fingerprint. No uniqueness score — just the raw signals.

A popup gives a quick-glance summary; "More details" opens a full report
page with every signal above.

## Privacy

This is the whole point of the tool, so it's disclosed precisely:

- The only **application-level** network request is a `fetch()` to an
  IP-echo service (`api.ipify.org` / `api6.ipify.org`), used solely to
  learn your public IP.
- WebRTC leak detection additionally performs a STUN handshake with one or
  more public STUN servers (Google, Cloudflare, Open Relay Project) — not
  an HTTP request, but a real network touchpoint, so it's called out here
  and in the product UI.
- No collected signal (IP, WebRTC candidates, or fingerprint data) is ever
  sent anywhere else. There is no backend and no analytics in this phase.

See [`openspec/changes/leak-detector-mvp/design.md`](openspec/changes/leak-detector-mvp/design.md)
for the full reasoning behind these decisions.

## Status

Phase 1 (MVP, this repo's current state) is implemented and tested — see
[`PLAN.md`](PLAN.md) for the phased roadmap (Phase 2: DNS leak test,
Phase 3: store publishing) and
[`openspec/changes/leak-detector-mvp/`](openspec/changes/leak-detector-mvp/)
for the spec this implementation follows.

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

E2E tests load the actual built extension in a real (headed) Chrome
window, so they need a display — run under `xvfb-run` in a headless CI
environment.

## Project structure

```
lib/                 IP detection, WebRTC leak detection, fingerprint
                      collection - framework-agnostic, unit-tested
entrypoints/popup/    Quick-glance popup UI
entrypoints/report/   Full report page
e2e/                  Playwright tests against the built extension
openspec/             Spec-driven planning artifacts (proposal, specs,
                      design, tasks) for this and future changes
PLAN.md               Project roadmap and open questions
```

## Contributing / planning workflow

This project uses [OpenSpec](https://github.com/Fission-AI/OpenSpec) for
spec-driven changes. Before implementing a new feature, a change proposal
with specs, design, and tasks is written under `openspec/changes/` first —
see the existing `leak-detector-mvp` change for the pattern.
