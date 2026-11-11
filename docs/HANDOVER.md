# ClipForge — Handover

**Updated:** 2026-11-10
**Current commit:** `45b18a3` (code; this note is the docs commit on top)
**Verified artifact:** `C:\Users\Apple\AppData\Local\cf-f28b499\release\0.1.0\win-unpacked\ClipForge.exe`
(`45b18a3` only changes the Linux backend, so the Windows tree is unchanged)
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

**Green and verified:** CI and the Windows installer build for `45b18a3` are green, and the
packaged smoke test passed (export, trim/save/reopen, clip edits, transitions, transcription).

- Latest CI: `42853891145` — success, including the new **`Linux compositor compiles`** job.
- Latest build: `42853891543` — success. `45b18a3` only changes the Linux backend, so the Windows
  tree is unchanged and the last downloaded artifact is still `cf-f28b499`.
- `cf-f28b499`'s `app.asar` carries `f28b499` and `vignetteAmount`; its packaged tree carries the
  mediapipe model and `onnxruntime.dll`.
- The Build was blocked for a while by a sustained GitHub Releases `504`; it cleared, and the
  final run above is green. The earlier UI-only commit `49405b0` compiled and its renderer built
  on a retry, but its installer never completed; `2ea450d` contains it.
- Packaged CLI checks were made against `cf-21f0fc7`: `--help` lists `openscreen batch`; an empty
  manifest exits 2; a missing-project job exits 1 and the child `CliExportRunner` actually starts.
  Not re-run against `cf-2ea450d`.

### Shipped and closed

| Area | State |
|---|---|
| Core hardening H1–H4 | Closed. H1 (GIF cancel) is **reported, not fixed**; H2 has unit coverage; H3 is documented; H4's split e2e runs in the packaged smoke. |
| In-app Help | Top-bar Help menu, seven task topics, six new keys across 15 locales, `HelpMenu.test.tsx`. |
| F3 export tiers | 720p / 1080p / 1440p / 2160p / Source, 24/30/60 fps. 1440p/2160p clamp to the source and never upscale. |
| F5 Thumbnail Studio | **Prompt-only** (one prompt, not three), field placeholders, copy button, publishing copy, 1280×720 composer, PNG/JPEG export. The prompt is **context-aware**: it quotes the transcript's opening, names extracted subjects and stated numbers, and carries the destination platform's aspect ratio and safe areas. The OpenRouter image-generation flow was **removed on 2026-11-10** — the prompt goes to an external tool. Old projects saved with three concepts still parse. |
| Colour presets | Seven starting looks (neutral / warm / cool / cinematic / vivid / faded / mono) on the existing five grade axes, one `ChoiceRow` above the sliders, written in one save (`169f201`). No Rust, no schema change; neutral emits nothing. |
| Vignette | The first curated entry in the effects library: a global fixed-WGSL vignette with one slider, emitted per clip after the colour grade (`f28b499`). No Rust; neutral emits nothing. **Picture not watched.** |
| F9 headless batch | `openscreen batch <manifest.json>` with `--json`, `--fail-fast`, relative paths, exit 0/1/2. Documented in `website/docs/cli.md`. |
| OpenRouter auth | Explicit `Authorization: Bearer` header; missing keys fail before the request; Provider settings reports failed key writes. Default text model is `anthropic/claude-sonnet-4.5`. |
| Editor features | Scene detect/split, `scriptToVideo`, transitions including programme-end fade, export blend overlap, colour grade + presets, vignette, speed ramps, 1280×720 composer. |
| Blend picture + audio | Audio crossfades over the transition's `d` (`4a29754`); the outgoing picture now **advances** through the overlap (`7bb4e9a`): the walk holds both decoder pairs, composes the outgoing clip first with its own scene/camera/cursor, clears the blend snapshot, then composes the incoming. Fail-closed to the old freeze for a shared asset, a missing decoder or an empty tail. Compile-verified (CI + Windows Build); **the dissolve has not been watched**. |
| F8 opacity keys | `clip.opacityKeys` (`{ at, value, easing }`, normalized inside the clip's SOURCE window) plus a clip-rail **Opacity** panel (slider, key capture, remove, clear) and native `SceneClip::opacity_at` (`01fe8a5`; panel state fix `05925f2`). Windows fades the screen, camera, window/device frame and screen shadow; the tilted-screen pass (mode 8) ignores layer alpha, the GIF exporter ignores the track, and annotations/cursor stay opaque. Unit-tested both sides; **picture not watched**. Every key has an easing menu; keys can be moved by position and the playhead can jump to one. |
| F8 volume keys | `clip.volumeKeys` (0..1 multiplier on `gainDb`, `at` over the clip's OUTPUT span) in the clip **Volume** panel (`6b1c309`). The mixer multiplies the stretched PCM (`audio_jobs::apply_volume_keys`); the preview applies the same value in its tick. Unit-tested; **not listened to**. GIF exporter ignores it. Every key has an easing menu; keys can be moved by position and the playhead can jump to one. |
| F4 packaged runtime | The Build asserts the mediapipe model and `onnxruntime.dll` are in the installer tree (`1f1f135`); a miss used to hide the control silently. |
| Topbar / Studio UI | Export no longer slides under the Windows caption buttons: the five menu triggers drop their words below 1500px and Export is right-aligned inside the titlebar-area reserve (`49405b0`). Thumbnail Studio enables with an open project (not a clip) and has a project-menu entry; its **Generate prompts** action now sits in the footer beside Save (styled), so Save is never a disabled button with no visible way to produce its result. |
| F4 primary video (Windows) | `SceneWebcamEffect.target` (`"webcam"` default, `"screen"` for the primary video), editor setting + UI, and the flat screen path draws the same mask/effect (`2ea450d`). macOS ignores `"screen"`; tilted screen and trail are not covered. **Picture not watched.** |
| F4 primary video (Linux) | The Vulkan/wgpu backend picks the layer in `pump_segmentation` and applies cutout/blur on the flat screen draw (`custom` → cutout). Compile-checked by the `linux-compositor-check` job; **picture not watched** (`45b18a3`). |

## 3. Remaining roadmap

1. **F4 — background removal for the primary video.** Windows **flat** path (`2ea450d`) and **Linux**
   (cutout/blur, compile-checked by the new `linux-compositor-check` CI job, `45b18a3`) are done.
   **macOS is out of scope** — the macOS build is not planned (product decision, 2026-11-10). Still
   open: the **tilted screen (mode 8)** and the **trail (mode 18)** shader modes, and the picture was
   never watched. `custom` falls back to cutout on Linux.
2. **Phase-B blend leftovers.** Audio done (`4a29754`); the picture advance is written (`7bb4e9a`).
   Per overlap frame the walk advances the outgoing decoder, composes the outgoing clip with its own
   scene/camera/cursor, calls `clear_blend_source`, then composes the incoming. Fail-closed to the
   freeze for a shared asset (the two halves of a Split), a missing decoder, or a clamped/absent
   tail. The live preview not shortening is deliberate. Compile-verified; **still needs a GPU watch**
   — the one remaining blend check is a dissolve in an export.
3. **F8 — general keyframes.** First two slices **done**: `opacity` (compositor alpha) and `volume`
   (mixer envelope), both in the clip panels and unit-tested. Next: the remaining properties
   (`scale`/`rotation`/`position`/effect parameters), which need new scene fields and layout maths.
   F7 depends on F8. F6 remains a **spike outcome** (do not ship yet; candidates, licences and the
   RTF protocol are in `docs/ROADMAP.md`).
4. **TTS** — **decision recorded**: defer; if it ships, it is BYOK hosted, opt-in, with consent and a
   real cost. Not a bundled platform engine.
5. **H1** — closed as reported; its spec is excluded from the smoke step.

The native items above are blocked on *verification* (a GPU watch for the shader/walk changes), not
on design. Writing them blind would risk breaking the render with no check to catch it.

**Platform scope (2026-11-10):** **Windows** is the shipping platform and the only packaged build;
**Linux** compiles (CI gate) and implements the primary-video effect; **macOS is not planned**.

## 4. Verification and commands

```powershell
Set-Location "C:\Users\Apple\Downloads\Telegram Desktop\UoK\ClipForge"
gh run list --limit 5
npx tsc --noEmit
npx vitest --run <changed paths>
& "C:\Users\Apple\AppData\Local\cf-f28b499\release\0.1.0\win-unpacked\ClipForge.exe"
```

- Push with `git push origin main`; a code push starts CI and the Windows installer build. A
  docs-only push starts CI only.
- The Build's GPU-less Rust step now runs `cargo test -p openscreen-compositor --lib regions::`
  **and** `--lib audio::hold_tests` (the pure concat/crossfade math). Everything else in
  `crates/compositor/tests/` still needs a real device and runs nowhere.
- CI now has a **`Linux compositor compiles`** job: `cargo check -p openscreen-compositor` on
  ubuntu-latest with the shared FFmpeg SDK and libclang. It is the compile gate for Linux-only Rust;
  macOS Rust still has no gate (no macOS build in the repo).
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
