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

**Status at 2026-11-09:** code `21f0fc7`, design `9bb4235`; CI and the Windows installer build are
green, and the artifact is verified (`cf-21f0fc7`). Phases 0, 1 (in substance) and 5 are done; 2 and 4 are partial;
3 and 6 are not started. Core hardening H1–H4 is closed (H1 reported, H2 unit-verified,
H3 documented, H4 covered by the packaged smoke); F3 and F9 are closed. The remaining work is the
Phase-B blend leftovers and the decision-gated/large items (TTS, F4, F6–F8). **Business model: not
freemium — see the section below.**

- **Phase 0 — Engineering audit.** **Done.** Environment inventory, candidate clones + pinned commits, licence/dependency audit, real build/test attempts, foundation decision. → `docs/ENGINEERING_AUDIT.md`
- **Phase 1 — Usable desktop editor.** Rebrand fork; create/save/reopen/duplicate project; import + preview; basic timeline edit (add/trim/split/move/delete/order); save/reopen; export playable MP4; clear missing-media + error handling. **Done in substance:** record/import, split, trim/save/reopen, MP4/GIF export and preview are implemented and exercised by the packaged smoke step. Missing-media handling is unit-verified (H2), split has a dedicated e2e (H4), and GIF cancel is explicitly reported as unreliable (H1).
- **Phase 2 — Capture & recording handoff.** **Partial:** recording and manual import exist, with “open in editor”. Configurable watched folder with completion/duplicate detection, and the optional OBS WebSocket connector, are not implemented; the manual import path is the supported one.
- **Phase 3 — Build-in-Public Content Engine.** **Not started.** Content sessions, the evidence model (notes, transcript, frames, read-only git, test results), and generated hooks/scripts/storyboards/platform copy with per-asset provenance. The Thumbnail Studio’s publishing copy is a small, completed slice of “everything inside ClipForge”, not the Content Studio.
- **Phase 4 — Repurposing & captions.** **Partial:** local Whisper captions, 15-language subtitle translation, filler/silence cuts, ratio reframe and script-to-video exist. Derivative projects (landscape/vertical/square variants, highlights, captioned variants) and source↔derivative tracking are not implemented.
- **Phase 5 — Thumbnail Studio.** **Done (2026-11-08).** Input context with a declared evidence basis; three distinct concepts; prompt-only mode with no API; direct generation via OpenRouter with consent and the actual cost; a 1280×720 composer (headline/outline/alignment/colours, logo, background zoom); PNG/JPEG export; versioned composition data with no image bytes in the project; publishing title/body/tags. Remaining limits: no video-frame background picker, and a reopened project asks for the logo file again.
- **Phase 6 — Content library & publishing connectors.** **Not started.** Asset library by project/session, approval state machine, publish connectors, and the manual export-package fallback.
- **Phase 7 — Release readiness (revenue model deferred).** **Not freemium and no paywalls.** Finish the build and ship a free core; decide the revenue model later. Installer + portable, notices/SBOM, and a new user completing the core workflow unaided. No account system.

## Functional verification

What has actually been run and observed, as of **2026-11-08**. Nothing here is inferred from the
presence of code — that distinction is the point of the honesty gate. The post-Phase-1 feature set
(transitions, speed ramps, colour grade, keyframes, scene detection, script-to-video, Thumbnail
Studio, programme-end fades) is unit/CI-tested and present in the verified `bbce83d` build; the
rendered picture has not been watched for every one of them — see the 2026-11-07/08 handovers.

| Item | State | How it was established |
|---|---|---|
| Export a playable MP4 | **Verified** on a GPU machine *and* on a GPU-less CI runner | `tests/e2e/gif-export.spec.ts` against the packaged build; the written file is decoded end to end by FFmpeg with `-map 0:v:0`, so a header-only file cannot pass. On `windows-latest` it takes the software path (`h264_mf`, 22.1 s) |
| Export a GIF | **Verified** on a GPU-less CI runner and on a desktop | same suite; 12.7 s on `windows-latest` |
| Trim → save → close → reopen | **Verified** on a GPU-less CI runner and on a desktop | `tests/e2e/phase1-acceptance.spec.ts`; restarts the app and reads the trim back through the UI. 26.4 s on `windows-latest` |
| E2E running in CI | **Green — `4 passed (1.3m)`** | `.github/workflows/build.yml`, after packaging: MP4 export, GIF export, trim/save/reopen, transcription. Run 1 exposed two real problems (GPU-less Windows could not export at all, and a drag that relied on desktop window size); both are fixed |
| Preview on a GPU-less machine | **Fixed** | `Decoder::open` no longer fails the decode when the D3D11VA device cannot be created; it falls back to system frames. `readFrame failed` has left the CI log |
| Clip split | **Implemented and visible; unit-tested; no dedicated e2e** | `splitClip`/`splitClipAtTimes` in `document/timeline.ts`, `splitClipAt` in the write audit, `Ctrl+B`, a Slice button in the inspector rail and a Split row in the Clip menu. The transitions e2e uses split to build its two clips, but no test presses the split control itself. Halves carry `detached`; `wordRefs` stay on the left and a modifier spanning the cut stays anchored to it |
| Missing-media handling | **Not verified** | no test, no observation |
| Extract audio (CapCut's "Extract audio") | **Implemented, unit-tested, reachable from the inspector rail and the Clip menu** | `detachAudio` op + `detachAudioAt` store action declared in the write audit. Creates an anchored track carrying `offsetMs`, and a mute over the clip so nothing doubles. Still no right-click context menu |
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

| # | Item | Status / why it comes first |
|---|---|---|
| H1 | Make GIF export cancel dependable, or report honestly that it is not | **Closed (reported, not fixed).** The cancel path is native and covered in unit tests; the packaged cancel spec is excluded from the smoke step, with both observed symptoms documented in `tests/e2e/gif-export.spec.ts`. A renderer-responsiveness fix is future work. |
| H2 | Verify missing-media handling | **Closed (unit-verified).** `NativeCompositorOverlay.test.tsx` feeds both an ENOENT view error (missing-file headline + relink) and a non-ENOENT compositor error (GPU headline, no relink). |
| H3 | Document the compositor-addon constraint where developers will hit it | **Closed.** “Export has no JS fallback” is documented in `technical-documentation/engineering/build-and-packaging.md`, including the failure strings and the whole-directory copy rule. |
| H4 | Split: give it a discoverable control and an e2e | **Closed.** Split is in the inspector rail, the Clip menu and on Ctrl+B; `tests/e2e/clip-edits.spec.ts` presses the Split control and asserts two clips on disk and in the UI, and runs in the packaged smoke step. |

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

### F2 — Detach a clip's audio into an editable track · done

`detachAudio` is implemented: the clip is muted and an anchored audio track carries the same source
span and an `offsetMs`, in one serialised write. Reachable from the inspector rail and the Clip
menu; the detached track survives save/reopen and the export level is unchanged. Still no
right-click context menu.

### F3 — Resolution presets up to 4K · done (2026-11-09)

The export dialog offers **720p / 1080p / 1440p / 2160p / Source** and **24 / 30 / 60 fps**. The
1440p and 2160p tiers are capped at the source's own short side, so a 1080p source asked for 2160p
exports 1080p — no silent upscale. 720p/1080p keep their explicit behaviour (they may upscale a
smaller source, which the dialog warns about), and Source still resolves to the smallest clip's own
resolution. 60 fps is offered regardless of the source rate; a 30 fps source is frame-duplicated
rather than refused. HDR is not implemented.

### F4 — Background removal for any clip, not just webcam · partial

The mediapipe segmentation model ships (`public/mediapipe`, out of the asar so the compositor can
read it) and the compositor draws it. Today the mask is the **camera layer only**.

1. Allow the mask to target the primary video.
2. Verify the model is found at runtime in the packaged build - a miss disables the feature silently.

### F5 — Thumbnail Studio · done (2026-11-08)

Shipped end to end:

1. Inputs (title, brief, audience, platform, brand kit, exclusions) with the transcript when present.
2. Three distinct concepts (curiosity / benefit / contrast) with hook, composition, focal point,
   palette, thumbnail text, prompt and rationale - each declaring its evidence basis.
3. Copy, save and edit; the composition is stored as versioned data, never image bytes.
4. Direct generation via OpenRouter with consent, the **actual** reported cost, a timeout and one
   in-flight request per window.
5. 1280x720 composer: text/font size/alignment/outline/colours, logo, background zoom, PNG and JPEG
   export.
6. Publishing copy beside the prompt: platform-ready title, description body and tags/hashtags,
   derived from the same evidence basis.

Remaining limits: the composer's background is the generated image or a solid colour (no video-frame
picker), and a reopened project asks for the logo file again because its bytes are not stored.

### F6 — AI stem separation (vocal isolation) · spike, not a feature

CapCut-Pro-class. ONNX Runtime already ships (`fetch:onnxruntime`, `onnxruntime.dll`), so there is a
road, but decide before promising: pick a model and its licence, measure real-time factor on a modest
CPU, then choose between muting a stem and full re-mixing.

### F7 — Auto-reframe (subject tracking) · partial

Ratio presets exist (16:9, 9:16, 1:1, 4:3, 3:4, 21:9) and the agent's `autoReframe` crops the
timeline for a target shape, centred on what the project already frames. **Nothing tracks a moving
subject**: no face/object detection, no keyframed crop following it. That needs F8's general
keyframes.

### F8 — Keyframes / animation curves · partial

Zoom focus and **scale** keys exist (`zoomRanges[].keyframes`, the inspector's Add keyframe row), so
a zoom can move and push in over time. What is missing is the **general** property keyframe system:
position/scale/rotation/opacity/volume/effect parameters and editable easing graphs. Large: new
schema surface, new UI, new export path. Do not start before F5 is closed (it is) and F3/F4 are
decided.

### F9 — Headless / batch render and agent surface · done (2026-11-09)

ClipForge has an MCP server (`electron/mcp/`) with project, media, transcribe, `renderFrames` and
export tools, and a CLI export runner. `openscreen batch <manifest.json>` now renders a list of
projects headlessly, one job at a time, through the same export path: paths resolve relative to
the manifest, `--fail-fast` stops on the first failure, `--json` emits `batch-start` /
`job-start` / `job-done` / `done`, and the exit code distinguishes success (0), failed jobs (1)
and an invalid manifest or argument (2). The contract is documented in `website/docs/cli.md`.

## Reference projects (concept reuse only)

| Project | Licence | Fit |
|---|---|---|
| `OpenCut-app/OpenCut` (+ the `eazypickins001-tech` fork) | MIT | Browser/desktop; mid-rewrite onto a Rust core and, per its own README, not accepting outside contributions. **This is the OpenCut lineage Master Prompt §3.3 flagged — audit licensing and integration before adopting any code.** |
| `msgbyte/cutia` | MIT | 890★, 149 forks, but its README says **"fork from opencut"** — the same lineage. Next.js + Bun + Postgres/Redis + Better-Auth, which contradicts our local-first constraint. |

Both render in the browser; ClipForge renders through the native Rust D3D11 compositor. So expect
**low code reuse, high concept reuse**: OpenCut's headless/batch render and Editor API, cutia's
layered text/sticker UX.

## Explicit non-goals

Voice cloning, avatars, **generative text-to-video** (hosted models - not our script-to-video
composition), cloud storage quotas, team collaboration/review links, a premium asset marketplace,
and any account system. Each is model- or server-heavy, and each weakens the local-first promise
that is the reason this product exists.

## Business model — deferred, not freemium

The core is **free and fully usable without an account, paywall, premium tier or upsell**. That is a
hard product rule, not a pricing placeholder. **The revenue model is deliberately undecided until the
build is complete**; decide it later without gating a core craft feature. AI costs are the user's own
provider bill (BYOK/OpenRouter), never a ClipForge credit system.

## CapCut parity — gap analysis (2026-11-08)

CapCut Pro in 2026 (third-party summaries; prices/credits vary by region): about **$19.99/mo or
$179.99/yr in the US, 1,200 AI credits/month, 1 TB cloud, 4K/60fps + watermark-free export**, all
premium templates/effects/fonts/music, and advanced AI (auto captions, camera tracking, AI avatars,
motion tracking, Seedance generative video). Teams adds a brand kit; Ultra adds credits and
exclusive AI. Read plainly: **the premium tier is mostly an asset + cloud + AI-credit bundle**, not
hidden editing algorithms.

### Where we match or lead

- **Core craft:** multi-track editing, crop/trim/split/resize, transitions (dips, dissolve, wipe,
  slide, programme-end fade), speed ramps/curves, colour grade basics, zoom keyframes/scale.
- **Local AI:** on-device Whisper auto captions with styles and 15-language translation, filler/
  silence removal, scene detection -> split, ratio reframe, script-to-video via the agent.
- **Thumbnail Studio:** prompt-only concepts, OpenRouter image generation with actual cost, 1280x720
  composer/export, publishing title/body/tags.
- **Differences worth protecting:** fully local core, no watermark, no subscription/paywall, AI
  optional and BYOK, an agent/MCP surface that edits the real document, and screen-recording craft
  (cursor themes, click effects, auto-zoom, screen+webcam) that CapCut treats as secondary.

### Where CapCut is ahead

| Gap | Our state | Track |
|---|---|---|
| 4K/60fps + HDR export tier | 720p/1080p/1440p/2160p/Source and 24/30/60fps; no HDR | HDR is future craft |
| Premium assets: templates, effects, transitions, fonts, music/SFX, stickers, graphic suite | None | Business decision (non-goal) |
| General keyframes and graphs across properties | Zoom focus/scale only | Craft (F8) |
| Colour wheel, LUTs, filters, presets | Sliders only | Craft |
| Browsable effects library/picker | Shader lane is agent-authored only | Craft |
| Body/beauty effects; background removal on primary video | Webcam segmentation only | Craft (F4), large |
| Camera/motion tracking, subject-tracking auto-reframe | Ratio reframe + cursor-follow zooms | Craft/AI (F7) |
| Auto beat / music-to-cut sync | None | Craft |
| Stem separation / vocal isolation | None | Spike (F6) |
| Reverse, stabilisation, denoise | None | Craft |
| TTS, voice cloning, AI dubbing, avatars/presenter | None | Decision/hosted |
| Generative video (Seedance-class) | None | Hosted; non-goal for now |
| Cloud storage, cross-device/web/mobile, Teams/brand kit, collaboration/review links | None | Non-goals |
| Mature GIF-cancel robustness | Reported unreliable | Future hardening (H1 closed as reported) |

### Parity order (build, don't buy)

1. **Craft, cheap:** general keyframes/graphs (F8); an effects picker/library;
   LUTs/colour presets; primary-video background removal (F4);
   auto-beat; reverse/stabilise/denoise.
2. **Local/BYOK AI:** TTS; subject-tracking auto-reframe (F7); stem separation (F6); smart search;
   embeddings for media search.
3. **Won't match (business-model gaps):** generative video, avatars/voice cloning, asset
   marketplace, cloud/teams/brand kit, collaboration, mobile/web.

## Compliance invariants (never break)

- FFmpeg: **LGPL builds only**, via the inherited `assertLgpl()` gate + SHA-256 pins. Never bundle the GPL system FFmpeg.
- OBS: connect to a separately installed OBS; **never bundle GPL OBS components**.
- Secrets: OS `safeStorage` only; never in renderer, source control, or plaintext config.
- **Remove or invert OpenScreen's opt-out PostHog telemetry** before any release.
- Preserve MIT copyright notices from every reused project.
- Never commit recordings, screenshots, keys or signing material.

## Working method

Small testable modules. Automated tests (`vitest`) + Playwright E2E + a repeatable Windows smoke test (record/import → edit → save → reopen → export). Synthetic media only. **Never claim a build/test/export/integration succeeded unless verified.** When context approaches ~90%, flush state to `docs/SESSION_HANDOVER.md` (see `ENGINEERING_AUDIT.md` §13 protocol).
