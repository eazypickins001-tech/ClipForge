# ClipForge — Roadmap

**Requirements source of record:** `Master Prompt.txt`
**Phase 0 findings:** `docs/ENGINEERING_AUDIT.md`

## Locked decisions

| # | Decision |
|---|----------|
| 1 | **Foundation:** fork **OpenScreen** (MIT) for capture + editing + export; layer ClipForge modules on top |
| 2 | **Repo:** new repo in this folder, fresh history → `github.com/eazypickins001-tech/ClipForge` |
| 3 | **Checkpoint:** Phase 0 audit first, then pause for review |
| 4 | **Optional AI:** **OpenRouter** primary BYOK; core stays fully local/offline without it |

## Product promise

"Capture what you do. Turn it into content. Edit it. Repurpose it. Prepare it for publication."

Local-first desktop workspace: recording → editing → AI-assisted content → short-form repurposing → thumbnails → content library & approvals → optional publishing. No cloud account needed for core record/edit/save/export.

## Phases

Each phase ends with: run tests → fix regressions → record commands/results → update docs → summarise what works / remains / is blocked.

- **Phase 0 — Engineering audit.** *(this pass)* Environment inventory, candidate clones + pinned commits, licence/dependency audit, real build/test attempts, foundation decision. → `docs/ENGINEERING_AUDIT.md`
- **Phase 1 — Usable desktop editor.** Rebrand fork; create/save/reopen/duplicate project; import + preview; basic timeline edit (add/trim/split/move/delete/order); save/reopen; export playable MP4; clear missing-media + error handling. **Prerequisite: resolve toolchain blockers B1–B4.** *Status 2026-11-02: import, trim, save/reopen and playable-MP4 export are **verified on the packaged build** (see Functional verification). **Split is not implemented**, preview and missing-media handling are unverified.*
- **Phase 2 — Capture & recording handoff.** Verify/adapt recording; manual + drag-drop import; configurable watched folder with completion detection + duplicate detection; "Open in Editor"; optional OBS WebSocket connector (only if version/API tests pass, else documented manual path); preserve originals.
- **Phase 3 — Build-in-Public Content Engine.** Content sessions; evidence model (notes, transcript, frames, read-only git, test results); generate editable hooks/scripts/storyboards/captions/platform copy with **per-asset evidence provenance**; no invented claims; local save; AI optional.
- **Phase 4 — Repurposing & captions.** Derivative projects (landscape/vertical/square, highlights, captioned variants); source↔derivative tracking; source never overwritten; ASR (local Whisper default) or subtitle import; user reviews proposed clips.
- **Phase 5 — Thumbnail Studio.** Input context with declared evidence basis; 3 distinct concepts; **prompt-only mode with no API**; direct generation via verified providers (OpenRouter default) with consent/cost disclosure; composition editor; PNG/JPEG export; 16:9 **1280×720** preset; honest quality heuristics (no CTR/virality fabrication).
- **Phase 6 — Content library & publishing connectors.** Asset library by project/session; approval state machine; investigate GHL (+ others) against live docs before implementing; preserve human approval; real publish states; manual export package fallback.
- **Phase 7 — Freemium readiness & release candidate.** Useful free tier; clear premium boundaries; **Ed25519** entitlements with private key outside the app; expiry never blocks local files; Windows installer + portable; notices/SBOM; new user completes core workflow unaided.

## Functional verification

What has actually been run and observed, as of **2026-11-02**. Nothing here is inferred from the
presence of code — that distinction is the point of the honesty gate.

| Item | State | How it was established |
|---|---|---|
| Export a playable MP4 | **Verified** on a GPU machine *and* on a GPU-less CI runner | `tests/e2e/gif-export.spec.ts` against the packaged build; the written file is decoded end to end by FFmpeg with `-map 0:v:0`, so a header-only file cannot pass. On `windows-latest` it takes the software path (`h264_mf`, 22.1 s) |
| Export a GIF | **Verified** on a GPU-less CI runner and on a desktop | same suite; 12.7 s on `windows-latest` |
| Trim → save → close → reopen | **Verified** on a GPU-less CI runner and on a desktop | `tests/e2e/phase1-acceptance.spec.ts`; restarts the app and reads the trim back through the UI. 26.4 s on `windows-latest` |
| E2E running in CI | **Green — `4 passed (1.3m)`** | `.github/workflows/build.yml`, after packaging: MP4 export, GIF export, trim/save/reopen, transcription. Run 1 exposed two real problems (GPU-less Windows could not export at all, and a drag that relied on desktop window size); both are fixed |
| Preview on a GPU-less machine | **Fixed** | `Decoder::open` no longer fails the decode when the D3D11VA device cannot be created; it falls back to system frames. `readFrame failed` has left the CI log |
| Clip split | **Implemented and visible; unit-tested; no e2e** | `splitClip` in `document/timeline.ts` (12 tests), `splitClipAt` store action declared in the write audit, `Ctrl+B` per CapCut's documented shortcut, plus a Slice button in the inspector rail. The halves carry `detached` so `joinContiguous` cannot fold them back. Known limits: `wordRefs` stay with the left half, and a modifier spanning the cut stays anchored to it |
| Missing-media handling | **Not verified** | no test, no observation |
| Extract audio (CapCut's "Extract audio") | **Implemented, unit-tested, reachable from the inspector rail** | `detachAudio` op (6 tests) + `detachAudioAt` store action declared in the write audit. Creates an anchored track carrying `offsetMs`, and a mute over the clip so nothing doubles. **No right-click context menu yet** — that is CapCut's entry point and the next slice |
| Recording aspect ratio | **Not selectable at capture time** | The recorder's only resolution control is webcam quality (`HudDeviceSettings.tsx`). The project ratio exists, but only in the editor (`RightPanes.tsx` / `document/outputFormat`) |
| Whisper transcription on Windows | **Verified end to end** | `tests/e2e/transcription.spec.ts` on `windows-latest` (35.6 s): VAD finds the fixture's 2 speech segments (0.10–2.88, 3.78–7.49), the language auto-detects as `en` (p = 0.9996), and the saved project document carries speech segments whose text matches "quick brown fox" with in-range timings |
| GIF export cancel | **Unreliable** | two symptoms while the CPU-bound encode runs: the Cancel click can exhaust its 30s actionability window; the dialog did not return to an exportable state within 15s when a click did land |

## Core hardening (before new features)

Ordered. Nothing below should start work on the backlog until these are closed.

**Closed — GPU-less Windows could not export MP4.** `run_multi_inner` skipped the D3D11VA pool
only when `gpu.backend == Backend::Cpu`, so a WARP-backed or virtualised machine — a VM, a hosted
runner, an RDP session — classified as hardware, failed at `enc hwdevice init: -1313558101`, and
produced no file. Forcing `OPENSCREEN_COMPOSITOR_BACKEND=cpu` did not help (that switch is
Linux-side). It now probes the pool and falls back to the existing system-memory path, picking
`h264_mf`; verified end to end on `windows-latest` (commit `e23a9f6`).

**Closed — Whisper was not shipped on Windows.** The fork deleted the workflow that built
`whisper-stt-server` and nothing replaced it, so every Windows install logged
`whisper-stt-server binary not found`. The Windows job now builds it, refuses to continue if it
is absent, asserts it inside the packaged tree, and a spec transcribes real speech through it into
the saved project (commits `e955996`, `1955f1c`, `91e19af`).

**Closed — the preview readback.** The same run that shipped Whisper logged
`compositor.readFrame failed: Error: hwdevice_ctx_init: -1313558101`, with no test failing on it.
`Decoder::open` chose hardware-vs-software from `gpu.backend != Backend::Cpu` — the export bug's
twin, one layer over, and the comment three lines above it already said WARP has no video decoder.
It now probes `attach_d3d11va` and falls back to the software `CpuFrames` axis. On `windows-latest`
the fallback is taken twice (screen and webcam decoders) and `readFrame failed` no longer appears
in the log at all (commit `25daa96`). The two other `attach_d3d11va` callers are C0/`decode_frame_n`
benches that are deliberately D3D11VA-only and keep their hard failure.

| # | Item | Why it comes first |
|---|---|---|
| H1 | Make GIF export cancel dependable, or report honestly that it is not | Master Prompt §8.4 requires a working cancel; today it is the one flaky spec |
| H2 | Verify missing-media handling | The last unobserved Phase 1 criterion |
| H3 | Document the compositor-addon constraint where developers will hit it | Export has **no JS fallback**: a dev checkout cannot export at all, and the failure reads as a product bug |
| H4 | Split: give it a discoverable control and an e2e | It works on K, but nothing on screen says so, and nothing asserts the keypress end to end |

## Feature backlog

Ordered by value ÷ cost. Each is a slice that can be finished and verified on its own — no item
depends on a later one, except where stated.

### F1 — Auto-captions on Windows (local Whisper) · done

The helper is written end to end (`electron/stt/*` — `whisperServer`, `extractAudio`,
`modelManager`, `chunking`, `ctcAlign`; native `electron/native/whisper-stt/`); the binary was the
missing piece, and it now ships and transcribes — see Core hardening.

1. ~~Add a whisper build step to the Windows job, before packaging.~~ Done.
2. ~~Make the build **fail** if `whisper-stt-server` is absent from `electron/native/bin/win32-*`.~~ Done — this guard is what stops it rotting a second time.
3. ~~Extend the `win.extraResources` filter if the binary lands outside `win32-*`.~~ Not needed: `win32-*/*` already covers the staged path, and the packaged tree is asserted separately.
4. ~~Ship the ggml model on first use via `modelManager`, not inside the installer.~~ Confirmed working — the helper fetches and loads `ggml-small-q8_0` (263.87 MB) on the runner.
5. ~~Assert caption output, not just the helper.~~ Done — `tests/e2e/transcription.spec.ts` transcribes the synthetic-speech fixture and checks the words and the timings in the saved project.
6. Follow-up, not a blocker: rebuild the Windows helper with the Vulkan backend once the SDK is a declared prerequisite and the `vulkan-1.dll` runtime dependency has been measured. Also worth knowing: the model is fetched per fresh userData, so each spec that imports media downloads ~264 MB.

### F2 — Detach a clip's audio into an editable track

The data model already separates audio (`audioTracks` at `schema/index.ts:776`, `createAudioTrack`
at `:1511`, per-track gain/fades) and can mute spans (`muteRanges`, `:305`). There is no detach
*operation* — audio can be added, not extracted.

1. Add a document op `detachAudio(clipId)`: mute the clip's own audio, create an audio track over the same asset and source span.
2. Route it through the existing serialised write queue so one user action stays one save.
3. UI: "Detach audio" in the clip inspector, undoable.
4. Test: the detached track survives save/reopen; the source clip is muted; export level is unchanged.

### F3 — Resolution presets up to 4K

1. Inventory what the export dialog offers today (720p/1080p plus an upscale path) and how the encoder is negotiated.
2. Add 1440p/2160p, gated on source resolution — never upscale by default.
3. Verify on the packaged build: export each preset, decode-check, assert dimensions.

### F4 — Background removal for any clip, not just webcam

The mediapipe segmentation model already ships (`public/mediapipe`, out of the asar on purpose so the
compositor can read it) and the compositor draws it.

1. Confirm the present scope really is the camera layer only.
2. Allow the mask to target the primary video.
3. Verify the model is found at runtime in the packaged build — a miss disables the feature silently.

### F5 — Thumbnail Studio, prompt-only first (Phase 5)

No code exists. Start with the half that needs no credentials or spend.

1. Inputs: title, brief, audience, platform, transcript, selected frames, brand kit, exclusions.
2. Three distinct concepts, each with hook/composition/focal point/palette/thumbnail text/prompt/rationale — and each **declaring its evidence basis** (title alone vs transcript vs frames).
3. Copy, save and edit concepts. No image generation in this step.
4. Then direct generation via OpenRouter, with consent and cost disclosure, timeouts and rate limits.
5. Editor: text/font/alignment/outline, logo, crop, 1280×720 preset, PNG + JPEG export.
6. Composition stored as versioned data; image binaries never inside project JSON.
7. **Publishing copy, beside the thumbnail prompt** (added by request): generate a **video description**
   — platform-ready title, description body, tags/hashtags — from the same evidence basis as the concepts,
   prompt-only first with no API, so a creator can get from footage to publishable metadata without leaving
   ClipForge. This is the Thumbnail Studio half of "everything done inside ClipForge"; the Content Studio's
   per-platform copy (Phase 3) is the other. Keep both honest: copy is derived from the declared evidence,
   never invented.

### F6 — AI stem separation (vocal isolation) · spike, not a feature

CapCut-Pro-class. ONNX Runtime already ships (`fetch:onnxruntime`, `onnxruntime.dll`), so there is a
road, but decide before promising: pick a model and its licence, measure real-time factor on a modest
CPU, then choose between muting a stem and full re-mixing.

### F7 — Auto-reframe (subject tracking)

Ratio presets exist (16:9, 9:16, 1:1, 4:3, 3:4, 21:9 — the Edit clip dialog) but nothing tracks a
subject. Needs detection plus a keyframed crop, so it depends on F8.

### F8 — Keyframes / animation curves

Nothing found in the codebase. Large: new schema, new UI, new export path. Do not start before
F1–F5 have landed.

### F9 — Headless / batch render and agent surface

Concept from OpenCut. ClipForge already has an MCP server (`electron/mcp/`) with project, media and
transcribe tools, so the surface partly exists; the missing piece is a headless render entry point.

## Reference projects (concept reuse only)

| Project | Licence | Fit |
|---|---|---|
| `OpenCut-app/OpenCut` (+ the `eazypickins001-tech` fork) | MIT | Browser/desktop; mid-rewrite onto a Rust core and, per its own README, not accepting outside contributions. **This is the OpenCut lineage Master Prompt §3.3 flagged — audit licensing and integration before adopting any code.** |
| `msgbyte/cutia` | MIT | 890★, 149 forks, but its README says **"fork from opencut"** — the same lineage. Next.js + Bun + Postgres/Redis + Better-Auth, which contradicts our local-first constraint. |

Both render in the browser; ClipForge renders through the native Rust D3D11 compositor. So expect
**low code reuse, high concept reuse**: OpenCut's headless/batch render and Editor API, cutia's
layered text/sticker UX.

## Explicit non-goals

Voice cloning, avatars, text-to-video, cloud storage quotas, and any account system. Each is model-
or server-heavy, and each weakens the local-first promise that is the reason this product exists.

## Premium-feature reference (CapCut Pro)

Sourced from third-party 2026 summaries, **not** vendor documentation — treat as approximate. The
paid tier clusters around: 4K export, background removal, vocal isolation, speaker-aware auto
captions, auto reframe, camera tracking, voice cloning and avatars, text-to-video, keyframes and
graphs, colour tools, premium assets, AI credits and cloud storage.

Our standing differences: fully local, no watermark, no subscription for the core workflow, and AI
optional and BYOK.

## Compliance invariants (never break)

- FFmpeg: **LGPL builds only**, via the inherited `assertLgpl()` gate + SHA-256 pins. Never bundle the GPL system FFmpeg.
- OBS: connect to a separately installed OBS; **never bundle GPL OBS components**.
- Secrets: OS `safeStorage` only; never in renderer, source control, or plaintext config.
- **Remove or invert OpenScreen's opt-out PostHog telemetry** before any release.
- Preserve MIT copyright notices from every reused project.
- Never commit recordings, screenshots, keys or signing material.

## Working method

Small testable modules. Automated tests (`vitest`) + Playwright E2E + a repeatable Windows smoke test (record/import → edit → save → reopen → export). Synthetic media only. **Never claim a build/test/export/integration succeeded unless verified.** When context approaches ~90%, flush state to `docs/SESSION_HANDOVER.md` (see `ENGINEERING_AUDIT.md` §13 protocol).
