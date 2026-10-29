# ClipForge — Session Handover

**Written:** 2026-10-29
**Purpose:** let a fresh conversation resume without re-deriving anything.
**Read alongside:** `docs/ENGINEERING_AUDIT.md`, `docs/ROADMAP.md`.

> **Honesty gate (do not break):** never claim a build, test, recording, export or
> integration succeeded unless it was actually run and observed. Mark anything unrun as
> **NOT RUN**. Locked decisions: fork OpenScreen; repo `eazypickins001-tech/ClipForge`;
> audit-then-pause checkpoint; OpenRouter as the primary optional AI provider.

## 1. Current phase and last completed step

**Phase 1 (usable desktop editor) — kickoff complete; CI green and a Windows installer builds.**

Last completed step: the forked + rebranded ClipForge app is on `main` at `9a6ea54`, and both
GitHub Actions workflows are **green**:

- **CI** (`40830412560`) — success: lint, type-check and the full unit suite pass.
- **Build Windows installer** (`40829905908`) — success (6m30s). The native Windows Graphics
  Capture helper and the Rust D3D11 compositor compile on `windows-latest`; an NSIS installer
  artifact `clipforge-windows-x64` is produced and was downloaded and verified locally.

Verified artifact contents (`gh run download 40829905908 -n clipforge-windows-x64`):

| File | Size |
| --- | --- |
| `ClipForge.Setup.0.1.0-x64.exe` | 162.9 MB (NSIS installer) |
| `ClipForge.exe` | 213.0 MB (unpacked app) |
| `wgc-capture.exe` | 0.6 MB (native capture helper) |
| `cursor-sampler.exe` | 0.3 MB (native cursor sampler) |
| `ffmpeg-shared.exe` | 0.5 MB (LGPL FFmpeg CLI) |
| `THIRD-PARTY-LICENSES.txt` | 0.6 MB (SBOM) |
| `latest.yml`, `.blockmap`, `elevate.exe` | update metadata / helper |

## 2. Commands run and actual results

Environment (see the audit for full detail):

| Command | Result |
| --- | --- |
| `node --version` | v22.17.0 (projects pin 22.22.1) |
| `npm --version` | 11.16.0 (projects pin 10.9.4) |
| `rustc` / `cargo` / `cmake` | **not installed** |
| Visual Studio `vcvarsall.bat` | **not found** |
| `node scripts/build-windows-wgc-helper.mjs` (in `audit/openscreen`) | exit 1 — “Could not find Visual Studio vcvarsall.bat” |
| `node scripts/build-windows-compositor-addon.mjs` | exit 1 — FFMPEG_DIR pin missing (and cargo absent) |
| `npx vitest --run src/lib/exporter/ src/lib/ai-edition/timeline/ src/native/` | **exit 0 — 44 files, 691 tests passed** |
| `npm ci` with `NODE_ENV=production` | exit 0 but **prod-only** (devDeps skipped) |
| `npm ci` with `NODE_ENV=development` | exit 0, devDeps present |
| `npx tsc --noEmit` (ClipForge) | **exit 0** |
| `npx biome check .` (ClipForge) | **exit 0** (0 errors, 35 pre-existing warnings) |
| `git push -u origin main` | exit 0 — `cad0560..3e9aff6` |

**Critical environment gotcha:** `NODE_ENV=production` is set persistently in this shell and
makes npm omit devDependencies. Always `$env:NODE_ENV = "development"` before installing.
`core.autocrlf` must stay `false` locally (a `.gitattributes` `* text=auto eol=lf` rule is now
committed so Windows checkouts stay LF and `biome` matches CI).

## 3. Files created or modified

- **Created:** `docs/ENGINEERING_AUDIT.md`, `docs/ROADMAP.md`, `README.md`,
  `docs/SESSION_HANDOVER.md`, `.github/workflows/ci.yml`, `.github/workflows/build.yml`,
  `.gitignore` (merged).
- **Forked in:** the whole OpenScreen tree (minus `.git`, `node_modules`, build outputs).
- **Edited for rebrand:** `package.json`, `package-lock.json`, `electron-builder.json5`,
  `LICENSE`, `.env.example`, `.gitattributes`, `electron/about.ts`, `electron/windows.ts`,
  `electron/stt/extractAudio.ts`, `electron/ai-edition/agent-tools.ts`,
  `electron/ai-edition/document-service.ts`, `electron/ai-edition/deep-agent/service.ts`,
  `src/components/ai-edition/v4/EditorTopBar.tsx`,
  `src/components/ai-edition/ExportDialog.tsx`, all 15 `src/i18n/locales/*/…json`.
- **Deleted:** `electron/usage-ping.ts` + `.test.ts`, `electron/cli/cliMain.test.ts`,
  OpenScreen’s ~21 workflows and `.github/{scripts,actions,ISSUE_TEMPLATE,FUNDING.yml,CODEOWNERS}`,
  upstream root `README.md` / `ROADMAP.md`.

## 4. Verified / unverified / blocked

**Verified working:** the ClipForge repo is pushed; CI is green (lint + type-check + the full
unit suite); **the Windows native build succeeds in GitHub Actions** and produces a ClipForge
NSIS installer alongside the compiled `wgc-capture.exe` and `cursor-sampler.exe`; the SBOM
(`THIRD-PARTY-LICENSES.txt`) is generated. Locally: `tsc --noEmit` exit 0, `biome check` exit 0,
`node scripts/check-docs.mjs` reports OK.

**Unverified (NOT RUN):** installing and launching the built installer on Windows — and
therefore recording, editing, save/reopen and export on a real machine. Download the artifact
and run it to verify. This machine's hardware is below OpenScreen's stated minimum, so expect
slow capture even once it launches.

**Blocked locally:** native Windows capture helper + compositor. **Resolved by design** by
building in GitHub Actions (`windows-latest`).

**Known deviation:** `.env.example` still carries upstream’s `APP_NAME`/`BUNDLE_ID` and a
specific Apple signing identity (two edit attempts were denied). It contains no secrets.
Revisit if you want it rebranded.

**Not yet rebranded (deliberately):** internal identifiers (`createOpenScreenChatModel`,
`OpenScreenAgentSink`, `OPENSCREEN_FFMPEG_PATH`), the `.openscreen` project extension, and
`openscreen-*` localStorage keys. Renaming these needs coordinated code + migration work and
was out of scope for the rebrand commit. App icons are still OpenScreen’s artwork.

## 5. Open decisions needing your input

1. Rename the project extension `.openscreen` → `.clipforge` (needs format + migration work)?
2. Rename the internal identifiers and env var (breaking-ish, touches tests)?
3. Replace upstream icons/wordmark with ClipForge branding (needs design assets)?
4. Confirm the CI build succeeds, then proceed to Phase 1 acceptance work
   (create/save/reopen/import/preview/timeline/export).

## 6. Exact next command to resume

```powershell
Set-Location "C:\Users\Apple\Downloads\Telegram Desktop\UoK\ClipForge"
gh run list --limit 5                      # CI + Build status
gh run view 40827568839 --log-failed       # native build log if it failed
gh run download 40827568839 -n clipforge-windows-x64   # the installer, if it succeeded
```

## 7. Notes for the next session

- The isolated upstream clones live in `audit/` (gitignored) and hold ~1 GB of
  `node_modules` — delete that folder to reclaim disk when no longer needed.
- Local native builds require installing VS Build Tools 2022 (C++ + Windows SDK), CMake,
  Ninja, LLVM and Rust; the audit lists these as blockers B1–B4.
- Keep FFmpeg LGPL-only (`scripts/fetch-ffmpeg.mjs` enforces it). Never bundle the GPL
  system build at `gyan.dev`.
