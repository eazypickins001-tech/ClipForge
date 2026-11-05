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

## Next task — the e2e (A4), then the rest of Phase A

1. **A4 — e2e + CI wiring.** New `tests/e2e/transitions.spec.ts` in the shape of
   `clip-edits.spec.ts`: boot with a recording, split it (or use two assets), click
   `[data-transition-at="<clipId>"]`, pick a kind, `poll` the SAVED project for
   `transitions[0] === { clipId, side: "in", kind, durationMs }`.
   **It runs NOWHERE until it is added to the explicit list at `build.yml:162`.**
2. **Phase B — true cross-boundary blends (dissolve, wipe, slide).** These need the two clips to
   OVERLAP in the output programme, which shortens the video. Touches
   `resolvePlaybackSegments`, `outputFrameCount.ts`, `build_audio_concat_plan` +
   `assemble_concatenated_pcm`, and `walk_timeline`. Windows first. §3 of the plan has the detail,
   including why no cheaper model is correct.
3. **Phase C — scene animations (keyframes/curves on regions).** `regions.rs` already has the
   easing but keeps it private (`ease_spring`, `lerp`, `scale_lerp`, `clamp01`, `smoothstep`).
   Widen and add one `KeyframeTrack::sample(t)`.
4. Then the CapCut parity roadmap (§7 of the plan). Cheapest big wins: remove-filler-words /
   silence, scene detection, auto-reframe, and script-to-video **as agent tools** — our agent
   already writes the timeline, so those are new tools, not new engines.

## Open flags

- **The dip is on the SOURCE clock.** `compose_frame` uses `source_t`, so under a speed region the
  dip's wall-clock length scales with the speed. Deliberate (it keeps the fade glued to the picture)
  and documented in the code; revisit if a speed ramp ever looks wrong mid-dip.
- **macOS / Linux draw no dip.** Deliberate half-port: `SceneClip.video_dip` parses everywhere, the
  pass exists only in `compositor_windows.rs`. `dip_visible_at` is in `frame_geometry` so the ports
  share the envelope.
- **No e2e for transitions**, so nothing in CI proves the UI path beyond tsc.
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
