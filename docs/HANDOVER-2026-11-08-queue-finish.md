# Handover — 2026-11-08: the remaining queue (panel, script-to-video, Thumbnail Studio)

Continues `HANDOVER-2026-11-07-speed-ramps-programme-clock.md` and
`HANDOVER-2026-11-07-scene-detect-split.md`. This session finished the five-item queue those
files left:

| Commit | What |
|---|---|
| `edd2b3c` | The blend overlap is wired on the **export** side (frame grid, progress, scene programme starts, track/frame projection). |
| `12d5f00` | Scene detection's **sensitivity + progress panel** (threshold, minimum shot length, live bar, Cancel). |
| `7c7f5fa` | **`scriptToVideo`** — one atomic composition over `insertClip` / `addAnnotation` / `addZoom`. |
| `f90e7c9` | **Thumbnail Studio (prompt-only)** + **publishing copy** (title / body / tags), local and honest about its evidence basis. |
| `df69a5a` | **Thumbnail image generation** through OpenRouter (consent, actual cost, one at a time, save outside project JSON). |

**State: `df69a5a`, CI green, Windows build green, artifact verified on disk at
`%LOCALAPPDATA%\cf-df69a5a`.** Its `app.asar` contains the SHA stamp and the feature markers
`generate-thumbnail-image`, `save-thumbnail-image`, `studioImageModel`, `scriptToVideo`. Working tree clean.

Colour grade (`7b9e853`) and the earlier scene-detection slices (`5441576`, `7437576`) are already in
this build too.

---

## 1. Where the features are (for the build above)

- **Scene detection:** Edit mode → put the playhead inside a clip → top bar **Clip → Detect scenes**.
  The panel runs FFmpeg's scene score with **Sensitivity** (threshold), **Minimum shot length**, a
  live progress bar and **Cancel** (which kills the decode). Every cut inside that clip lands in one
  write; **one Ctrl+Z** undoes the sweep. Windowed clips only: cuts outside the clip's source window
  are ignored.
- **Agent scene split:** AI chat → “split this clip at its scene changes” (`splitAtScenes`). Also
  exposed to MCP clients (`openscreen mcp`).
- **Script to video:** AI chat → give the model a scene script; the `scriptToVideo` tool places each
  scene as its own clip and anchors that scene's caption/zoom to its exact span, atomically
  (`replace: true` starts from a clean timeline; assets, transcript and look stay). One call, one
  undo. There is no separate UI for it yet — it is the model's composition tool.
- **Thumbnail Studio:** Edit mode → top bar **Clip → Thumbnail Studio**. Fill Title / Brief /
  Audience / Platform / Brand kit / Avoid; **Generate prompts** produces three thumbnail concepts
  and the publishing copy (title, description, tags). Each prompt and field is editable and has a
  **Copy** button; **Save to project** stores the whole composition in the project (one write, one
  undo). Each concept also has **Generate image**: it asks for consent, calls OpenRouter with the
  stored OpenRouter key (the model is editable, default `google/gemini-2.5-flash-image`), shows the
  preview and the **actual cost** OpenRouter reports, and **Save image** writes the file. The
  document stores the path/model/cost, never the bytes. The pixel editor and 1280×720 PNG/JPEG
  composition are still open.
- **Export blend overlap:** no menu item. Put a dissolve/wipe/slide on a clip junction (`+`/`◑` on
  the seam), then export; the file is shorter by the transition duration. The live preview
  deliberately stays on the raw ruler and does not shorten.

## 2. What shipped, in one line each

**Panel (`12d5f00`)**
- `electron/media/sceneDetect.ts` gained `durationSec` + `onProgress`; it passes `-progress pipe:1`
  and parses `out_time_us`/`out_time_ms` into a 0..1 fraction (throttled to ~4/s). The handler
  forwards fractions on `scene-detect-progress`; preload exposes `onSceneDetectProgress`.
- `SceneDetectModal.tsx` owns the IPC (it needs the stream while open) and hands the cuts to the
  shell, which applies them with **one** `splitClipAtTimesAt`. Cancel bumps a run sequence, kills
  the child and ignores a late reply. 6 new i18n keys × 15 locales.

**Script to video (`7c7f5fa`)**
- `clearTimeline` (`document/timeline.ts`) clears the clip-anchored collections (trims, modifiers,
  transitions, layout runs, shader ranges, audio takes, legacy speed/camera envelopes) while keeping
  assets, transcript and look. `withClipsChanged` alone cannot do this on an empty clip list.
- `insertAssetClip` accepts `detached?: boolean` so script scenes never fuse into a neighbour.
- `scriptToVideo` (`agent-tools.ts`) composes each scene through the existing `insertClip` semantics,
  then adds the scene's caption (`addAnnotation`) and push-in (`addZoom`) over the placed clip's
  span via `executeAgentTool` on the in-progress document. Any failure refuses the whole script; the
  result is one document. Registered in the roster, mutating set, schemas, descriptions and the MCP
  surface; `ARGS` fixture and tests updated.

**Thumbnail Studio (`f90e7c9`, `df69a5a`)**
- `src/lib/ai-edition/thumbnailStudio.ts` is pure and deterministic: inputs (title, brief, audience,
  platform, brand, exclusions) + optional transcript → three concepts (curiosity / benefit /
  contrast), each with hook, composition, focal point, palette, thumbnail text, prompt, rationale
  and an **evidence basis**; plus one publishing block with platform title limits, description and
  tags. No provider call; prompts tell the image tool not to depict anything the evidence does not
  state.
- Stored as data under `legacyEditor.thumbnailStudio` (the schema passthrough) — no schema bump, no
  image bytes. `readThumbnailStudio` validates it with zod; `withThumbnailStudio` merges into the
  envelope. `saveThumbnailStudio` saves once (`history: true`; declared in the write audit).
- `electron/ai-edition/thumbnail-image.ts` calls OpenRouter's `POST /api/v1/images` with the stored
  OpenRouter credential (`OPENROUTER_LLM_API_KEY` / `OPENROUTER_API_KEY` or the keychain row),
  `aspect_ratio: "16:9"`, `output_format: "png"`, a 120 s timeout and one in-flight request per
  window. It returns a preview data URL and the **actual `usage.cost`**; `save-thumbnail-image`
  writes the chosen bytes to a file the user picks (PNG/JPEG/WebP/SVG, 25 MB cap).
- `ThumbnailStudioModal.tsx` + a Clip menu row; prompts/publishing are editable and copy through
  `window.electronAPI.copyToClipboard`. 30 new i18n keys × 15 locales across the two commits.

## 3. Verification, honestly

- Root `tsc --noEmit` and biome are clean on every touched file; `tsc -p tsconfig.test.json` remains
  red on the **pre-existing** audio-track `detached` / `useTimeline` `transition` fixtures (the new
  tests add no errors). `npm run i18n:check` is still broken at the `appx` block; key parity was
  checked directly (430 keys × 15 `editor.json`).
- Targeted suites: scene detector + modal (17), shell + Clip menu (33), agent tools + deep-agent +
  MCP (346), thumbnail generator + modal + store + audit + Clip menu (136), image request/response
  (135 with the studio/store suites) — all green.
- **CI and the Windows installer build are green for `df69a5a`.** The build was downloaded and its
  `app.asar` checked for the SHA and the feature markers above.
- **Not run:** scene detection against a real media file (this checkout has no FFmpeg/Rust/addon),
  a real OpenRouter image call (no key in this checkout; the request/response is unit-tested), and
  no rendered export was watched. The handovers' human-watch steps still stand for the overlap (§6
  of the 2026-11-07 file).

## 4. What is still open (so "finished" is not overstated)

This session finished **the queue the 2026-11-07 handovers listed**, not the whole product backlog.

1. **F5 steps 5–6:** the composition editor (text/font/alignment/outline, logo, crop, 1280×720) and
   PNG/JPEG export of the composed frame. Step 4's direct generation, step 7's publishing copy and
   the prompt-only studio are done.
2. **Transitions:** `side: "out"` is modelled/emitted but nothing in the UI writes one.
3. **Export overlap leftovers (Phase B):** the outgoing frame is still a freeze, not advanced per
   frame during the blend; the audio boundary is still the 240-sample crossfade (not `d`); the live
   preview/ruler deliberately does not shorten.
4. **TTS** remains a product decision (an engine, not a tool), and **F6–F9** (stem separation spike,
   auto-reframe tracking, keyframes, headless render) are untouched.
5. Scene detection still decodes the whole source and filters to the clip; a `-ss`/`-t` scan window
   is the next efficiency step. The agent tool and UI share the same detector.

## 5. Traps that cost time here

- `documents` in this repo are written by many paths: the **write audit** table must gain a row for
  every new store `saveDocument` (this session: `splitClipAtTimesAt`, `saveThumbnailStudio`).
- The **full local vitest suite** takes >14 min and flakes on `LeftPanel.copyMessage` under load;
  run touched files and let CI be the full-suite signal.
- The packaged smoke step has a documented **`transitions.spec.ts` split flake**; re-run the failed
  job, never “fix” it.
- `biome check --write` reformats test files mid-edit; re-read before a second edit.
- The i18n insertion script is still broken; this session used a parse-and-re-insert Node script
  that only adds lines after a known anchor and re-parses the file.
