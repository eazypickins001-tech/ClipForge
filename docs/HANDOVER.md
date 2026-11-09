# ClipForge — Handover

**Updated:** 2026-11-09
**Current commit:** `2c6b0c5` (code `21f0fc7`)
**Verified artifact:** `C:\Users\Apple\AppData\Local\cf-21f0fc7\release\0.1.0\win-unpacked\ClipForge.exe`
**Repo:** `C:\Users\Apple\Downloads\Telegram Desktop\UoK\ClipForge` · `github.com/eazypickins001-tech/ClipForge` · branch `main`

This is the only handover note. The earlier dated notes were folded into it and removed; they remain
in git history (`git log --all -- docs/HANDOVER-*.md docs/SESSION_HANDOVER.md`).

---

## 1. What ClipForge is

A local-first screen recorder and video editor forked from OpenScreen. Electron + React +
TypeScript in the renderer/main process, a Rust native compositor for preview and export, and
optional AI through a user-supplied provider key (OpenRouter is the default optional provider).

Locked decisions: fork OpenScreen; no freemium, paywalls, premium tiers or upsell language;
core editing works offline; AI is BYOK; the app is pre-1.x and not production-grade.

## 2. Current state

**Green and verified:** CI and the Windows installer build for `21f0fc7` are green, and the
packaged smoke test passed (export, trim/save/reopen, clip edits, transitions, transcription).

- Latest CI: `42554860456` (docs) and `42553256598` (code) — success.
- Latest build: `42553256552` — success in 12m33s, artifact verified.
- The artifact's `app.asar` contains the batch feature, the OpenRouter bearer header and the
  `anthropic/claude-sonnet-4.5` default.
- Packaged CLI checks against `cf-21f0fc7`: `--help` lists `openscreen batch`; an empty manifest
  exits 2; a missing-project job exits 1 and the child `CliExportRunner` actually starts.

### Shipped and closed

| Area | State |
|---|---|
| Core hardening H1–H4 | Closed. H1 (GIF cancel) is **reported, not fixed**; H2 has unit coverage; H3 is documented; H4's split e2e runs in the packaged smoke. |
| In-app Help | Top-bar Help menu, seven task topics, six new keys across 15 locales, `HelpMenu.test.tsx`. |
| F3 export tiers | 720p / 1080p / 1440p / 2160p / Source, 24/30/60 fps. 1440p/2160p clamp to the source and never upscale. |
| F5 Thumbnail Studio | Three concepts, publishing copy, OpenRouter image generation with real cost, 1280×720 composer, PNG/JPEG export. |
| F9 headless batch | `openscreen batch <manifest.json>` with `--json`, `--fail-fast`, relative paths, exit 0/1/2. Documented in `website/docs/cli.md`. |
| OpenRouter auth | Explicit `Authorization: Bearer` header; missing keys fail before the request; Provider settings reports failed key writes. Default text model is `anthropic/claude-sonnet-4.5`. |
| Editor features | Scene detect/split, `scriptToVideo`, transitions including programme-end fade, export blend overlap, colour grade, speed ramps, 1280×720 composer. |

## 3. Remaining roadmap

1. **F4 — background removal for the primary video.** Today the mediapipe mask is the camera
   layer only. This is native compositor work (Rust across DX11/Metal/wgpu), and the packaged
   runtime check still has to prove the model is found.
2. **Phase-B blend leftovers.** The outgoing frame is still a freeze during the overlap; the audio
   boundary is a 240-sample crossfade, not the transition duration `d`; the live preview/ruler
   deliberately does not shorten.
3. **F6–F8.** Stem separation is a spike (model + licence + real-time factor); F7 subject tracking
   needs F8's general keyframes; F8 is large (schema, UI, export path).
4. **TTS** remains a product decision (engine/hosted), not a code-completable step.
5. **H1** GIF-cancel responsiveness, if it is ever prioritised.

## 4. Verification and commands

```powershell
Set-Location "C:\Users\Apple\Downloads\Telegram Desktop\UoK\ClipForge"
gh run list --limit 5
npx tsc --noEmit
npx vitest --run <changed paths>
& "C:\Users\Apple\AppData\Local\cf-21f0fc7\release\0.1.0\win-unpacked\ClipForge.exe"
```

- Push with `git push origin main`; a code push starts CI and the Windows installer build. A
  docs-only push starts CI only.
- Download an artifact with
  `gh run download <run-id> -n clipforge-windows-x64 -D C:\Users\Apple\AppData\Local\cf-<sha>`.
- Verify markers with `rg -a --fixed-strings <marker> app.asar`.

## 5. Traps that cost time

- **No local Rust/Visual Studio toolchain.** Native builds and the Windows package run in CI only.
  Do not promise a locally built installer.
- **The full local vitest suite is slow (>14 min)** and flakes `LeftPanel.copyMessage` under load.
  Run touched files while working; let CI be the full-suite signal.
- **Packaged smoke flakes.** `transitions.spec.ts` has a documented split flake, and
  `clip-edits.spec.ts` "Extract audio" has been seen to time out once on a click. Rerun the failed
  job; do not "fix" a product bug from one occurrence.
- **`npm run i18n:check` is broken** (`Could not find appx block in electron-builder.json5`).
  Check key parity directly with a parse-and-compare script.
- **`npx tsc -p tsconfig.test.json --noEmit` has pre-existing errors** (audio-track `detached`,
  `useTimeline` transition fixtures). The root `npx tsc --noEmit` is clean.
- **Biome reformats mid-edit** (`biome check --write`); re-read a file before a second edit.
- **Do not commit** `.opencode/` or `.github/{agents,hooks,skills}` — untracked Impeccable
  scaffolding. `.impeccable/config.local.json` is machine-local; `.impeccable/design.json` is tracked.
- **Batch spawn trap:** `child_process.spawn(command, args, options)`, never `spawn(argv, options)`.
  The packaged CLI check is the proof that a batch job actually starts `CliExportRunner`.
- **OpenRouter:** text models need a live slug (the old `anthropic/claude-3.5-sonnet` has zero
  endpoints); image models need credits. A saved config keeps an old slug until it is re-saved.
  If a user still sees a missing-auth error, re-open **Settings → AI → OpenRouter** and save the key
  again; the form now surfaces a failed `safeStorage` write.
- **`userData` is pinned to `%APPDATA%\clipforge`** in `electron/main.ts`; CLI runs isolate their
  Chromium session data and skip the single-instance lock.

## 6. Where the important pieces live

- `website/docs/cli.md` — CLI and batch manifest contract.
- `docs/ROADMAP.md` — phases, F1–F9, CapCut gap analysis, deferred revenue model.
- `PRODUCT.md` / `DESIGN.md` / `.impeccable/design.json` — product truth and design system.
- `technical-documentation/engineering/build-and-packaging.md` — the compositor addon and the
  "export has no JS fallback" note.
- `electron/ai-edition/deep-agent/chat-model.ts` — provider models, auth header, key guard.
- `electron/cli/batchManifest.ts` / `batchCommand.ts` — batch contract and runner.

## 7. Honesty gate

Never claim a build, test, export, recording or integration succeeded unless it was actually run
and observed. Mark unrun checks **NOT RUN**. The packaged smoke and the artifact markers above are
the current evidence; older sessions' detailed logs are in git history.
