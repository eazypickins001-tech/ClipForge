# ClipForge — Handover

**Updated:** 2026-11-09 (evening)
**Current commit:** `49405b0` (code; this note is the docs commit on top)
**Verified artifact:** `C:\Users\Apple\AppData\Local\cf-1f1f135\release\0.1.0\win-unpacked\ClipForge.exe`
(**does not** include `49405b0` — that Build is blocked, see §2)
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

**Green and verified:** CI and the Windows installer build for `1f1f135` are green, and the packaged
smoke test passed (export, trim/save/reopen, clip edits, transitions, transcription).

- `49405b0` (the UI fixes below) is **CI-green**, but its Windows Build is **blocked by an upstream
  GitHub Releases outage**: every attempt dies on a `504 Gateway Time-out` inside a download —
  `fetch:ffmpeg`, Electron's `install.js`, then electron-builder's NSIS fetch. The job got as far as
  "Package NSIS installer" on the last retry, so the code itself compiled and the renderer built.
  Rerun with `gh run rerun 42567489963 --failed` once the outage clears.

- Latest CI: `42561207218` — success. Latest build: `42561207113` — success; artifact downloaded
  and verified as `cf-1f1f135`.
- The artifact's `app.asar` carries `1f1f135` and the new `audioSourceEndSec` emit. Its packaged
  tree carries `resources/mediapipe/selfie_segmentation/selfie_segmentation_landscape.onnx` and
  `resources/electron/native/bin/win32-x64/onnxruntime.dll` — now asserted by a Build step, because
  a miss hides the camera-background control silently.
- Packaged CLI checks were made against `cf-21f0fc7`: `--help` lists `openscreen batch`; an empty
  manifest exits 2; a missing-project job exits 1 and the child `CliExportRunner` actually starts.
  Not re-run against `cf-1f1f135`.

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
| Blend audio crossfade | A boundary now dissolves over the transition's `d`, not the legacy 240 samples: the outgoing clip's untrimmed tail is decoded for audio and the plan overlaps + equal-power fades it (`4a29754`). Unit-tested; **not listened to**. |
| F4 packaged runtime | The Build asserts the mediapipe model and `onnxruntime.dll` are in the installer tree (`1f1f135`); a miss used to hide the control silently. |
| Topbar / Studio UI | Export no longer slides under the Windows caption buttons: the five menu triggers drop their words below 1500px and Export is right-aligned inside the titlebar-area reserve (`49405b0`). Thumbnail Studio enables with an open project (not a clip) and has a project-menu entry. Verified locally in the built renderer at 1440/1280/1100/1000/900/800 and by 87 unit tests. |

## 3. Remaining roadmap

1. **F4 — background removal for the primary video.** Step 2 (the model is found in the packaged
   build) is now asserted by the Build. Step 1 remains: the effect is a single scene-global
   `webcamEffect` (`scene.rs::SceneWebcamEffect`) read only by the webcam draw; `SceneClip` has no
   effect field and there is no `target`. On Windows the **flat** screen draw (the mode-0 `else`
   branch in `compositor_windows.rs`) can take the same `t3` + `fx.z` treatment; the **tilted**
   screen (mode 8) and the trail are different shader modes and need new shader work. macOS/Linux
   must be taught to ignore a `target: "screen"` until their passes are mirrored. `pump_segmentation`
   would need both SRV pairs and the scene's target to choose what to capture.
2. **Phase-B blend leftovers.** The **audio** half is done (`4a29754`). The outgoing frame is still
   a freeze during the overlap, and the live preview/ruler deliberately does not shorten. The freeze
   needs a walk restructure — both decoders advancing per output frame, or a pre-rendered outgoing
   tail — not a shader tweak.
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
& "C:\Users\Apple\AppData\Local\cf-1f1f135\release\0.1.0\win-unpacked\ClipForge.exe"
```

- Push with `git push origin main`; a code push starts CI and the Windows installer build. A
  docs-only push starts CI only.
- The Build's GPU-less Rust step now runs `cargo test -p openscreen-compositor --lib regions::`
  **and** `--lib audio::hold_tests` (the pure concat/crossfade math). Everything else in
  `crates/compositor/tests/` still needs a real device and runs nowhere.
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
