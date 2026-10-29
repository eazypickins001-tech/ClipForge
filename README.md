# ClipForge

**Capture what you do. Turn it into content. Edit it. Repurpose it. Prepare it for publication.**

ClipForge is a **local-first desktop workspace** that takes a creator from raw screen
recording to edited, repurposed and publication-ready content — without needing a cloud
account for core recording, editing, saving or export.

Core recording, project management and basic editing/export work entirely offline.

## Status

| Phase | State |
| --- | --- |
| **0 — Engineering audit** | ✅ Complete — see [`docs/ENGINEERING_AUDIT.md`](docs/ENGINEERING_AUDIT.md) |
| **1 — Usable desktop editor** | 🚧 In progress (fork rebranded; native build running in CI) |
| 2 — Capture & recording handoff | Planned |
| 3 — Build-in-Public Content Engine | Planned |
| 4 — Repurposing & captions | Planned |
| 5 — Thumbnail Studio | Planned |
| 6 — Content library & publishing connectors | Planned |
| 7 — Freemium readiness & release candidate | Planned |

The full roadmap and locked decisions are in [`docs/ROADMAP.md`](docs/ROADMAP.md).
Anything not verified on a real machine is labelled as such — see the audit's honesty note.

## Foundation

ClipForge is built on **[OpenScreen](https://github.com/getopenscreen/openscreen)** (MIT),
which provides the battle-tested capture pipeline, timeline editor, GPU compositor,
on-device captioning and FFmpeg export. ClipForge adds the Content Studio, Thumbnail
Studio, Content Library & Approvals, publishing connectors and freemium licensing on top.

Upstream is used under the MIT Licence; all required notices are preserved
(see [`LICENSE`](LICENSE) and [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md)).

## Planned product areas

- **Home / Recent Projects**
- **Capture** — full-screen, window and region recording; microphone and system audio; webcam overlay
- **Video Editor** — multi-track timeline, trim/split/move, titles, captions, undo/redo
- **Content Studio** — evidence-aware build-in-public content generation
- **Thumbnail Studio** — concept generation (prompt-only or direct image generation)
- **Content Library** — assets organised by project and session, with approval states
- **Approval & Publishing Queue** — human approval before anything leaves the machine
- **Settings, privacy and integrations**

## Requirements

- **Windows 10 1903+ / Windows 11** (macOS and Linux are inherited from upstream but not the
  primary target)
- **Node.js 22.22.1** and **npm 10.9.4** (see `package.json` `engines` / `packageManager`).
  An older npm (e.g. 11.x) or a `NODE_ENV=production` environment will break installs —
  devDependencies are required.
- For local native builds only: **Rust**, **CMake**, **Ninja**, **LLVM** and **Visual Studio
  Build Tools 2022 (C++ + Windows SDK)**.

## Development

```bash
npm ci          # requires the exact Node/npm in package.json; ensure NODE_ENV is NOT "production"
npm run dev     # Vite dev server + Electron
```

## Testing

```bash
npm test                 # unit/integration tests (vitest)
npm run lint             # biome
npx tsc --noEmit         # type-check
npm run test:e2e         # Playwright (where configured)
```

Use synthetic or non-sensitive media for tests. Never commit recordings or screenshots.

## Building the Windows installer (CI-first)

The native Windows components cannot be built without the MSVC/Rust toolchain, so the
installer is produced by GitHub Actions on `windows-latest`:

- [`​.github/workflows/build.yml`](.github/workflows/build.yml) — native helper + compositor,
  FFmpeg vendoring, renderer build, NSIS packaging, artifact upload.
- [`​.github/workflows/ci.yml`](.github/workflows/ci.yml) — lint, type-check and unit tests.

Locally, if the toolchain is present:

```bash
npm run build:win
```

## Compliance invariants

- **FFmpeg:** only the **LGPL** build vendored by `scripts/fetch-ffmpeg.mjs` (SHA-256 pinned,
  licence-verified). Never bundle a GPL/nonfree FFmpeg. See `docs/LICENSING.md` (to be written).
- **OBS:** connect to a separately installed OBS; never bundle GPL OBS components.
- **Secrets:** OS `safeStorage` only — never in the renderer, source control or plaintext config.
- **Telemetry:** none. The upstream anonymous usage ping has been removed.
- **Media:** user recordings, screenshots and exports are never committed.

## Documentation

| Document | Purpose |
| --- | --- |
| [`docs/ENGINEERING_AUDIT.md`](docs/ENGINEERING_AUDIT.md) | Phase 0 audit: environment, candidates, licences, measured build/test results, decision |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Phases, locked decisions and compliance invariants |
| `technical-documentation/` | Upstream architecture notes (inherited) |

## Licence

MIT — see [`LICENSE`](LICENSE). ClipForge incorporates MIT-licensed code from OpenScreen;
its copyright notice is retained.
