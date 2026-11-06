# Handover — 2026-11-06: boundary blends, keyframed scale, autoReframe

Continues `HANDOVER-2026-11-04-transitions.md`, which is the umbrella for this work stream (Phases A/B/C
of the parity plan). That file's capability table and open flags were updated mid-session in `b82500a`;
this one records the session as a whole. Read both before touching the native side.

**State at handover: `03bcfea`, CI green, Build green, one build on disk (`%LOCALAPPDATA%\cf-03bcfea`).**
Working tree clean, nothing in flight.

---

## 1. What shipped, and how far it is actually verified

| Commit(s) | What | Verification |
|---|---|---|
| `1257edd` `1edb555` `784490f` `7e4bf60` | **Cross dissolve** — the two clips overlap by `d`, the programme shortens, the outgoing frame drawn over the incoming one | CI + Build + **watched in the app**, preview *and* export |
| `5b9bb42` | **Wipes and slides**, four edges each | CI + Build + **watched** |
| `87eb752` | **Keyframed scale** — a key records its zoom level, so a region pushes in | 1989 tests; **picture NOT watched** |
| `03bcfea` | **`autoReframe`** agent tool | 328 tests across the pinned tool surface |
| `b82500a` | Handover update + one flag retracted (§4) | CI (no Build — docs are path-filtered) |

Grid of what is *rendered* versus merely *tested*: the blend family has been seen working; the dip
family has **never** been watched; keyframed scale has been tested on the TS side only, and its Rust
sampling was written blind.

## 2. The blend, because the plan was wrong about it

`HANDOVER-2026-11-04-transitions.md` §3 (and `clipforge-transitions-and-capcut-parity.md`) predicted
that a blend would need the shared `walk_timeline` to orchestrate the overlap, a stub on every backend
(the walk was believed to be typed against a trait), and `live.rs` to HOLD the outgoing decoders across
the boundary. **None of it was true.** Do not budget from that estimate.

What it actually is:

- The walk already calls `set_scene` per clip, so the **Windows** `compose_frame` sees the blend alone.
  mac/Linux compile untouched and never draw one — the same half-port `video_dip` already is.
- The outgoing picture is a **copy of the render target**, taken at the very top of `compose_frame`
  *before* `begin_image_frame` clears it, where the previous clip's last frame still sits. One
  `CopyResource`, one full-screen pass, **no second decoder, no held state, no re-seek**.
- That is also why the live preview blends for free, and why `live.rs` was never touched.

Files: `crates/compositor/src/{scene.rs,regions.rs,compositor_windows.rs}`, `shaders.hlsl` (`ps_dissolve`),
`build.rs` (its entry point — the list there is **explicit**; a new shader without an entry fails to
compile), `src/native/clipVideoDips.ts` (`clipIncomingBlends`), `src/native/sceneDescription.ts` +
`components/ai-edition/ExportDialog.tsx` (all three clip lists), `src/native/contracts.ts`.

**The time model is the risky half, not the GPU.** A blend shortens the programme:
`timeline/transitionOverlap.ts::blendOverlapSec` owns the clamps; `resolvePlaybackSegments` applies them
through its optional third argument; `playbackOverlaps` gives the CLAMPED value per clip for the emit.
Those two walks are pinned against each other by a test that reads the overlap off the laid-out segments
rather than off the rule. **If you change one, the other's test fails — that is the point.**

## 3. Keyframed scale

A key (`zoomKeyframeSchema`) gained an optional `scale`. Absent means "the region's own", so a
camera-only path emits exactly the payload it always did and interpolates flat — asserted directly.

- Capture stays CAPTURE, not placement: `addZoomKeyframe` records the region's current focus *and* its
  current level, read through `effectiveZoomScale`, so a legal `customScale: 12` is recorded as the 5×
  the picture shows and a key can never carry a level the compositor would refuse.
- Rust: `focus_path_at` became `path_at` (position + level), with `effective_scale` as the single door
  every `scale` read in `zoom_state_in` now goes through. Closing that door is the point: no call site
  can quietly keep reading `region.scale` and ignore an animated path.
- A key's focus is clamped against **its own** scale's bounds, not the region's — clamping against the
  region would refuse a legal push-in, i.e. the feature.

## 4. One flag retracted, and one real limit

**Retracted (do not re-investigate).** I claimed `document/migrate.ts` dropping zoom `keyframes` needed
checking. It is not a bug: the legacy `ZoomRegion` type has no `keyframes` field, so a v2 project has
nowhere to keep a path; the reverse (`migrateAxcutDocumentToProjectData`) has **no production caller**;
and `importProjectFile` routes anything with `schemaVersion` + `timeline` to the schema parser.

**Real, and written into the code as a known limit.** The blend window is measured on the **source**
clock (`source_t - clip start`, as the dip beside it is), while `durationSec` is a **programme** number.
A speed region covering a clip's opening ends the blend early. Fixing it means carrying the clip's
programme start in the scene. It is the last source-clock leftover, and **speed ramps are what would
make it matter** — take them next.

## 5. `autoReframe`

`planReframe` (`src/lib/ai-edition/document/reframe.ts`) is pure and tested: keep the short side and trim
the long one; centre on the average focus of the zooms already over that clip, else the middle;
**all-or-nothing** — one clip without probed dimensions refuses the whole request, because the format
cannot change halfway down the timeline. Source size comes from `asset.video.width/height`, the one shape
`largestClipDims` and `calculateEffectiveSourceDimensions` already read.

The tool writes the **crops and the output format together**: cropping to 9:16 inside a 16:9 canvas
letterboxes rather than reframes. It does **not** read the cursor track — the description says so rather
than implying it followed the action.

Registering a tool touches five points, all pinned by tests: the zod schema, the executor `case`, both
rosters (`OPENSCREEN_TOOL_NAMES`, `MUTATING_TOOL_NAMES`), and `TOOL_ARG_SCHEMAS` + `TOOL_DESCRIPTIONS`
in `deep-agent/service.ts`. Two traps that cost cycles:

- `TOOL_ARG_SCHEMAS` must list tools in the **same order** as `OPENSCREEN_TOOL_NAMES`.
- `service.test.ts` has an `ARGS` fixture table; every tool needs an entry **even when that fixture
  makes it fail** (the test compares the tool's verdict with the executor's on the same fixture).
- No `documentWriteAudit.test.ts` row was needed — the executor returns a document and the commit funnels
  through the existing `applyAgentDocumentIfCurrent` site.

## 6. Next, in the order I would take it

1. **Speed ramps.** Closes §4's source-clock leftover, and makes it observable.
2. **Colour grade** — a pass plus a panel; `apply_shader_effect` already carries the plumbing.
3. **Scene detection → split.** The only one needing a new capability (an FFmpeg pass over a source).
4. **`script-to-video`** — composition over `insertClip` / `addAnnotation` / `addZoom`. Value is atomicity
   and a consistent scene shape; the *deciding what the scenes are* is the model's job already. Be sure
   it is not a thin wrapper before building it.
5. **TTS is NOT a tool, it is an engine.** Everything in this stream rearranged things that existed.
   Speech synthesis has nothing to rearrange: it needs a model or a platform API (SAPI, `say`), which
   lands as a Windows-only hack in a cross-platform app. That is a product decision first.
6. Still unclaimed: `side: "out"` transitions are modelled and emitted but nothing in the UI writes one.

## 7. Environment, and the traps that cost time here

- **No Rust toolchain and no GPU on the dev machine.** Every Rust change is CI-only, ~16 min/cycle, and
  the *picture* can only be checked by a human running `cf-<sha>`. Design Rust changes so a mistake
  degrades to today's behaviour (the blend is fail-closed for exactly this reason), not to a wrong frame.
- **The Build is path-filtered** on `docs/**` and `**.md` — a docs commit runs CI but skips the 16-minute
  Windows build. CI has no such filter.
- **The packaged smoke step flakes.** Observed signatures, three times this session: `bootWithTwoClips`
  → "the split never reached the saved project"; and bare `scrollIntoViewIfNeeded` / `click` timeouts on
  specs unrelated to the change. Protocol: read the failing step, satisfy yourself the change cannot
  reach it, then `gh run rerun <id> --failed`. It has gone green on re-run every time. **Do not "fix" a
  flake.**
- **PowerShell:** `gh run list ... | ConvertFrom-Json | Where-Object` mangles the output — assign to a
  variable, then loop. `Select-String`/`-Quiet` against `app.asar` is the reliable artifact check; the
  production bundle **mangles local function names**, so grep for the **embedded SHA stamp**, not for a
  symbol you added.
- **One build on disk** (`%LOCALAPPDATA%\cf-<sha>`, ~667 MB). Verify the new one, then prune the previous
  — but check `Get-CimInstance Win32_Process` for processes whose `ExecutablePath` matches the tree
  first, and **never kill a running app to force a prune**.
- **`biome check --write` rewrites files**, so an edit prepared from an earlier read is rejected
  ("modified since last read"). Re-read before editing. This bit me repeatedly.
- `$env:NODE_ENV=$null` before `vitest`, or it mass-fails. A full local run is ~12 min (CI does it anyway).

## 8. Method notes that earned their keep

- **Write the arithmetic first, as a pure module, with its tests.** Of the failures it produced, **all
  three were my test bugs, not code bugs** (a width formula copied into the height case, a spread with
  wrong key names, a const rename) — which is exactly the signal you want before anything consumes it.
- **Let the repo's pinned tests tell you what to update.** The tool surface, the write audit and locale
  parity all fail loudly with a diff naming the entry you missed. Guessing at those lists wastes a cycle.
- **The comments in this codebase are the design record.** Every non-obvious choice here carries its why
  (the fail-closed blend, the all-or-nothing reframe, the per-key clamp). Keep that up; a bare change
  will be "fixed" back by the next session.
- **Correct a wrong claim out loud.** §4's retraction is worth as much as a fix, and cheaper.
