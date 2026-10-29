# ClipForge — Session Handover

**Written:** 2026-10-29
**Purpose:** let a fresh conversation resume without re-deriving anything.
**Read alongside:** `docs/ENGINEERING_AUDIT.md`, `docs/ROADMAP.md`.

> **Honesty gate (do not break):** never claim a build, test, recording, export or
> integration succeeded unless it was actually run and observed. Mark anything unrun as
> **NOT RUN**. Locked decisions: fork OpenScreen; repo `eazypickins001-tech/ClipForge`;
> audit-then-pause checkpoint; OpenRouter as the primary optional AI provider.

## 1. Current phase and last completed step

**Phase 1 (usable desktop editor) — kickoff complete; waiting on CI.**

Last completed step: the forked + rebranded ClipForge app was **committed and pushed** to
`github.com/eazypickins001-tech/ClipForge` (`main` = `3e9aff6`). Two GitHub Actions runs
were triggered and are in progress:

- **CI** — run id `40827568634`
- **Build Windows installer** — run id `40827568839`

`tsc --noEmit` and `biome check` were both verified locally as **exit 0** before the push.

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

**Verified working:** repo pushed; `tsc` and `biome` clean locally; OpenScreen’s JS test
layer runs (691 tests); NanoThumbnail `npm run build` succeeds; dependencies install.

**Unverified (NOT RUN):** any Windows native build, app launch, recording, editing,
save/reopen, export, or packaging — because this machine lacks MSVC/CMake/Ninja/Rust.
The two CI runs above are the first attempt to build the installer.

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
