# ClipForge — session handover (2026-11-04)

Repo: `C:\Users\Apple\Downloads\Telegram Desktop\UoK\ClipForge`
Branch `main`, remote `github.com/eazypickins001-tech/ClipForge`.
**HEAD: `4836e87` — CI green, Windows build green, packaged-app smoke step passing.**
Working tree clean. No build downloaded locally for this SHA yet (`%LOCALAPPDATA%\cf-383ed80`
is STALE — it predates the transitions UI).

## Honesty gate (unchanged, absolute)

Never claim a build, test, export or integration succeeded unless it was run and observed.
Anything unverified is labelled NOT RUN. This session's own near-miss: three new `saveDocument`
calls went in without a `documentWriteAudit` row; CI caught it, a local run of that one file would
have. It is cheap to run the file you touched.

## What shipped this session

| Commit | What |
|---|---|
| `383ed80` | **The audio mixer**: clip volume + fades now reach the exported file. Also fixed the export dialog's drifted clip list (`hasAudio: true`, no level/fades), which is what made the UI export ignore the clip audio panel — mute included. |
| `82d754e` | **Transitions, part 1 (TS, inert)**: `transitionSchema` + `document.transitions`, `RegionKind`/`removeRegion`/`EDIT_REGIONS`, `withClipsChanged` pruning, `clipVideoDips` (its own module), store actions, and the emit on both clip lists. |
| `c3616ed` | Declared the new writes in `documentWriteAudit.test.ts` (CI had caught 102 scanned vs 99 declared). |
| `e6042b7` | **Transitions, part 2 (native)**: `SceneClipDip` + `SceneClip.video_dip`, `frame_geometry::dip_visible_at`, and the `compose_frame` dip pass (full-screen solid at `alpha = 1 - envelope`). Windows only. |
| `4836e87` | **Transitions, part 3 (UI)**: the junction button on the timeline, `TransitionModal`, shell wiring, and 7 i18n keys in all 15 locales. |

## Where the feature is (how to find it, and what it does)

**The audio work (already finished last session, now actually in the file):**
open a clip's audio panel from the inspector rail's speaker button ("Output level"). Volume and
fades are now honoured by the export as well as the preview. `383ed80` is what fixed that.

**The transitions (new):**

1. Open the **Edit** surface with **two or more clips**. The reliable way: import a recording, put
   the playhead inside the clip, then **Split** (inspector rail, or the clip's right-click menu).
   Split marks the halves `detached`, so they stay two clips.
2. Look at the **seam between two clips** in the clip row. A small round button sits on the join:
   **`+`** when that boundary has no dip, **`◑`** when it does.
3. Click it. The **Transition** sheet opens:
   - kind tiles — **Fade to black** / **Fade to white** / **Fade to color**
   - **Duration** slider, 100–3000 ms, default 500
   - **Color** swatch, shown only for "Fade to color"
   - **Remove transition** (only when one exists) and **Close**
4. Every change is **one write, one undo step** (commit on release, like the clip audio panel).

Semantics: half the duration lands on each side of the cut. A 500 ms dip = 250 ms ramping the
outgoing clip down into the colour, 250 ms ramping the incoming clip up out of it. That is why one
duration control covers both.

Test hooks: `[data-transition-at="<clipId>"]`, `transition-kind-dip-black`, `transition-kind-dip-white`,
`transition-kind-dip-color`, `transition-kind-dissolve`, `transition-kind-wipe`,
`transition-kind-slide`, `transition-edge-<left|right|top|bottom>`, `transition-color`,
`transition-remove`, `transition-done`. (`tests/e2e/transitions.spec.ts` exists now and runs in the
packaged smoke step — this list used to say it did not.)

**Why a boundary needs a real cut:** `joinContiguous` fuses two adjacent same-media, same-crop,
media-contiguous clips into one unless either is `detached`. So transitions are reachable on
(a) the two halves of a Split, and (b) any two clips from different assets. Two same-media clips
dragged together are one clip and have no boundary — by design, and unchanged by this work.

## The plan document

`C:\Users\Apple\.commandcode\plans\clipforge-transitions-and-capcut-parity.md`

Contains: what the compositor can actually blend (with file:line), the transition model, the
three implementation phases, the UI plan, verification, **the CapCut gap analysis** (official
sources only), and a prioritised parity roadmap. Read §1 and §3 before touching the native side.

Agreed scope: transitions + scene animations in depth; CapCut parity as a roadmap.
Parity focus: **editing craft, on-device AI, cloud generative AI (BYOK)** — NOT assets/brand/cloud
collaboration.

## Control matrix (what is real)

| Control | Document | Preview | Exported file |
|---|---|---|---|
| Clip mute (audio) | yes | yes | yes |
| Clip volume (audio) | yes | yes | **yes** (since `383ed80`) |
| Clip fades (audio) | yes | yes | **yes** (since `383ed80`) |
| Boundary dip (video) — black / white / colour | yes | **Windows compose path** | **Windows only** |
| Boundary dip — macOS / Linux | yes | **no** — parsed, not drawn | **no** |
| Blend — cross dissolve | yes, overlaps by `d` | **Windows compose path** (`ps_dissolve`) | **Windows only** |
| Blend — wipe / slide, four edges | yes, overlaps by `d` | **Windows compose path** (same pass, `regions::blend_geometry`) | **Windows only** |
| Blend — macOS / Linux | yes | **no** — parsed, not drawn | **no** |

**A blend is not a dip, and the difference is not cosmetic.** A dip lives inside each clip (half the
duration ramps each side) and costs the programme nothing. A blend shows both pictures at once, so the
two clips OVERLAP by the transition's duration and the video gets SHORTER. `timeline/transitionOverlap.ts`
owns that arithmetic, `resolvePlaybackSegments` applies it, and `playbackOverlaps` gives the clamped
value per clip for the scene emit — the two walks are pinned against each other by a test that reads
the overlap off the layout rather than off the rule.

**NOT RUN, and it matters:** nobody has *watched* a dip. The envelope is unit-tested
(`frame_geometry::dip_visible_at`), the draw path compiles, the packaged app still passes its smoke
step — but no assertion anywhere looks at the pixels. Watch an export, and the live preview, before
believing it. (The BLEND family has since been watched, in both the preview and an export; the dip
family still has not.)

## Where this stands — Phases A, B and C have all shipped

Watched in the app by hand, in the preview AND in an exported file: the dip family has still never
been looked at, the blend family has.

| # | What | Commits |
|---|---|---|
| A4 | `tests/e2e/transitions.spec.ts`, wired into the packaged smoke step | `303dad2`, `69822ca` |
| B | **cross dissolve**: the two clips OVERLAP by `d`, so the programme shortens | `1257edd`, `1edb555`, `784490f`, `7e4bf60` |
| B+ | **wipes and slides**, four edges each — the same pass, geometry from `regions::blend_geometry` | `5b9bb42` |
| C | **keyframed focus path** (`regions.rs::path_at`) | previous session |
| C+ | **keyframed SCALE**: a key records its zoom level, so a region can push in | `87eb752` |

**How a blend is drawn, because the plan predicted it wrong.** The plan expected the shared
`walk_timeline` to orchestrate the overlap, a stub on every backend (the walk was thought to be typed
against a trait), and `live.rs` to HOLD the outgoing decoders across the boundary. None of that was
needed: the walk already calls `set_scene` per clip, so the WINDOWS `compose_frame` sees the blend on
its own — no cross-backend work, no trait. And the outgoing picture is a **copy of the render target**
taken at the very top of `compose_frame`, before `begin_image_frame` clears it, so the previous clip's
last frame is still there: one `CopyResource`, one full-screen pass, and **no second decoder at all**.
That is also why the live preview blends for free.

## What is left, in the order I would take it

1. **Speed ramps.** The blend window is the last piece still on the source clock (see Open flags), and
   ramps are what would make that visible.
2. **Colour grade** (LUT / saturation / levels) — a pass plus a panel; the compositor already has the
   shader plumbing (`apply_shader_effect`).
3. **Effects library** — the same pass machinery, a curated list instead of a code box.
4. **Scene detection → split**, **auto-reframe**, **TTS**, **script-to-video**: the last three are
   **agent tools**, not engines — the agent already writes the timeline. Scene detection is the one
   that needs a new capability (an FFmpeg pass over a source).
5. Still unclaimed from before: `side: "out"` transitions are modelled and honoured by the emitter but
   nothing in the UI writes one (no fade-out at the end of the programme).

## Open flags

- **The dip is on the SOURCE clock.** `compose_frame` uses `source_t`, so under a speed region the
  dip's wall-clock length scales with the speed. Deliberate (it keeps the fade glued to the picture)
  and documented in the code; revisit if a speed ramp ever looks wrong mid-dip.
- **macOS / Linux draw no dip.** Deliberate half-port: `SceneClip.video_dip` parses everywhere, the
  pass exists only in `compositor_windows.rs`. `dip_visible_at` is in `frame_geometry` so the ports
  share the envelope.
- **The blend window is on the SOURCE clock.** `compose_frame` measures it as `source_t - clip start`
  (as the dip beside it does), while `durationSec` is a PROGRAMME number — so a speed region covering
  the clip's opening ends the blend early. Written in the code as a known limit, not an oversight:
  fixing it means carrying the clip's programme start in the scene, and a cut almost always lands on
  1x. It is the last source-clock leftover.
- **macOS / Linux draw no blend either.** `SceneClip.incoming_blend` parses everywhere; the pass is in
  `compositor_windows.rs`. The blend is fail-closed, so an unwatched path degrades to today's hard cut
  rather than to a wrong frame.
- **`migrate.ts` does not carry zoom `keyframes` — CHECKED, NOT A BUG.** Both zoom rewriting sites
  there drop them, but the legacy `ZoomRegion` type has no `keyframes` field (so a v2 project has
  nowhere to keep a path), the reverse function `migrateAxcutDocumentToProjectData` has no production
  caller, and `importProjectFile` routes anything with `schemaVersion` + `timeline` to the schema
  parser, which preserves them. Nothing to fix; recorded so nobody re-investigates it.
- **`npm run i18n:check` is broken in this repo state** — it throws
  `Could not find appx block in electron-builder.json5` before checking anything. Pre-existing and
  unrelated. Locale parity was verified directly instead (15 locales, 388 keys each, identical).
- **The locale insertion script is still broken** (closes the wrong JSON object). This session used
  a one-off script that PARSES each file and re-emits it; that is the safe shape.
- **`documentWriteAudit.test.ts` is a table you must edit** for every new `saveDocument` /
  `setDocument` / `useProjectStore.setState` site. It fails loudly with a diff. Read it before
  adding a write; it is the only guard that the compiler cannot provide.
- **No transitions for the "dip-out at the end of the programme"** yet: `side: "out"` is modelled
  and honoured by the emitter on the last clip, but nothing in the UI writes one.
- Still open from before: `MS_STORE_PRODUCT_ID` is OpenScreen's (gated, unused); GIF cancel is
  unreliable; capture-time aspect ratio is not selectable.

## Environment gotchas that cost time this session

- `NODE_ENV=production` is global in this shell — clear it (`$env:NODE_ENV=$null`) or vitest
  mass-fails.
- **No Rust toolchain, no CMake, no native addon locally**: Rust is CI-only, ~13 min/cycle.
- Commit messages must go through a file (`git commit -F`). PowerShell here-strings break.
- PowerShell + `ConvertFrom-Json` pipelines mangle output — use explicit `foreach` loops.
- `gh run watch` with no id watches the LATEST run. Always resolve the id for the SHA.
- **`git push` can return a transient `Internal Server Error`** (HTTP 500) after the commit lands —
  the commit is fine, just push again.
- The smoke step lists its spec files explicitly (`build.yml:162`) — a spec not listed runs nowhere.
- **The smoke step flakes.** This session it failed once on `clip-edits.spec.ts:95 › Split …`
  ("the split never reached the saved project"), a test this session never touched; the re-run went
  green, and the prior historical failure (`4b9c3be`) was a *different* test in the same spec with
  the same message. Re-run the failed job before believing red.
- Biome's formatter is not optional: `npx biome check --write <files>` after writing, then
  `npx biome check <files>` to confirm. Warnings do not fail the build; errors do.
- The full local vitest suite did NOT complete on this machine (>20 min, twice) — CI's ubuntu run is
  the reliable full-suite signal. Run the touched files locally.

## Verify-then-deliver recipe

```
git push origin main
# resolve the run ids FOR THIS SHA, then:
gh run watch <ci-id> --exit-status
gh run watch <build-id> --exit-status
gh run download <build-id> -n clipforge-windows-x64 -D %LOCALAPPDATA%\cf-<sha>
# confirm the stamp and feature markers inside app.asar before handing over the path
```

The stamp is `__BUILD_COMMIT__` = `GITHUB_SHA[:7]`, baked by `vite.config.ts:42`; grep the short
SHA inside `resources/app.asar` to prove which build a tree is. After a verified build, prune older
`%LOCALAPPDATA%\cf-*` trees (each ~667 MB), keeping only the newest.

## Files touched this session

**Audio (`383ed80`):** `crates/compositor/src/{audio_jobs,audio,pipeline_windows,pipeline_macos,pipeline_linux}.rs`,
`crates/compositor-view-napi/src/lib.rs`, `crates/poc-d3d/src/bench.rs`,
`crates/compositor/tests/*.rs`, `src/components/ai-edition/ExportDialog.tsx` (+ its test).

**Transitions:** `src/lib/ai-edition/schema/index.ts`,
`src/lib/ai-edition/document/timeline.ts`, `src/lib/ai-edition/store/useTimeline.ts`,
`src/lib/ai-edition/store/documentWriteAudit.test.ts`, `src/native/contracts.ts`,
`src/native/sceneDescription.ts`, `src/native/clipVideoDips.ts` (+ test),
`src/components/ai-edition/TransitionModal.tsx` (new),
`src/components/ai-edition/v4/V4Timeline.tsx`, `src/components/ai-edition/NewEditorShell.tsx`,
`electron/ai-edition/agent-tools.ts`, `src/i18n/locales/*/settings.json` (15),
`crates/compositor/src/scene.rs`, `crates/compositor/src/frame_geometry.rs`,
`crates/compositor/src/compositor_windows.rs`.
