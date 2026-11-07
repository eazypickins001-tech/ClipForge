# Handover — 2026-11-07: speed-ramp presets, and the blend window on the programme clock

Continues `HANDOVER-2026-11-06-blends-zoom-reframe.md` §6 item 1 ("Speed ramps"), and closes that file's §4.
Read that one and `HANDOVER-2026-11-04-transitions.md` first.

**State at handover: `2e3ef8e`, CI green, Build green, one build on disk (`%LOCALAPPDATA%\cf-2e3ef8e`).**
Working tree clean. The artifact's `app.asar` carries the SHA stamp — the tree is the commit.

---

## 1. What shipped, and how far it is actually verified

| Commit | What | Verification |
|---|---|---|
| `2e3ef8e` | **Speed-ramp presets** — a region's `curve` (ramp-up / ramp-down / peak / valley), expanded to constant sub-spans at the emit | tsc + biome + 1489 tests across the touched suites; **picture NOT watched** |
| `2e3ef8e` | **§4 closed** — the blend window now measured on the PROGRAME clock via a per-clip `programmeStartSec` | Rust compiles in CI; **picture NOT watched** |

CI green (lint, tsc, full unit suite). Build green on `windows-latest` (Rust + packaged smoke). What is *rendered*
has still never been looked at for either half — the human step is §6.

## 2. Speed ramps, and the one thing that matters about them

A `legacyEditor.speedRegions[i]` gained an **optional** `curve`. `legacyEditor` is `z.object({}).passthrough()`,
so this needed no schema bump and no migration.

**The whole feature is one approximation, in one place.** The compositor integrates a speed region as
`Σ (length / speed)` over CONSTANT spans (`regions.rs::speed_segments_for_window`, mirrored by
`outputFrameCount.ts`) and never learns a curve exists: `expandCurvedRegion`
(`timeline/speedCurve.ts`) discretises the shape into constant sub-spans, and BOTH the emit and the programme
arithmetic read that one expansion through `readSpeedSpans` — so they cannot disagree about the frame grid. Had
the curve been carried into the scene and divided in Rust, the TS frame-count mirror would have had to reproduce
the discretisation exactly, on a machine with no Rust toolchain. Do not "simplify" it by moving the maths native.

- The ramp is a **staircase** at `SPEED_CURVE_STEP_SEC` (1/30 s of source), capped at 300 steps. One constant,
  one file. A midpoint rule, so the error is O(1/n²).
- `readSpeedRegions` is the AUTHORED list (UI pills, agent summary); `readSpeedSpans` is the arithmetic one.
  A region with no curve emits exactly what it always did — asserted in `sceneDescription.test.ts`.
- UI: a `ChoiceRow` in `SpeedControl` (`v4/FloatingInspector.tsx`). Agent: an optional `curve` on `addSpeed` /
  `setSpeed`, plus the snapshot. Six i18n keys × 15 locales, added by hand (the insertion script is still broken).

## 3. §4 — and one flag retracted by *finding the real story*

The clip `videoDip` stays on the SOURCE clock on purpose ("the fade stays glued to the picture"). Only the
blend's window was wrong: `compose_frame` measured `source_t - source_start_sec`, while `incomingBlend.durationSec`
is a PROGRAMME number — so a speed region over the incoming clip's opening ended the fade early.

`SceneClip.programme_start_sec: Option<f64>` (`#[serde(default)]`) carries the fix. TS emits it per clip
(`clipProgrammeStarts` in `outputFrameCount.ts` — the same fold `outputFrameCount` walks, read as POSITIONS);
`regions::blend_elapsed_sec` picks the programme clock when present, the source clock otherwise, so any payload
without the field keeps today's render exactly. **Emitted on the SCENE's clip list only**: the export ARGUMENT
list never reaches the draw path, and this number needs the projected speed spans, which only the scene builds.

## 4. FLAGGED, NOT FIXED — the blend's overlap is inert. Read this before touching transitions.

`blendOverlapSec` (`timeline/transitionOverlap.ts`), `resolvePlaybackSegments`' optional third argument, and
`playbackOverlaps` all exist and are tested. **But `resolveVisibleClips` (`sceneDescription.ts`) calls
`resolvePlaybackSegments(clips, trimRanges)` with no transitions** — and that is the clip list the scene, the
export and the walk all consume. So today a `dissolve`:

- ships `incomingBlend.durationSec` (the CLAMPED overlap the arithmetic computes), and
- the compositor draws the outgoing clip's **frozen last frame** over the incoming clip's opening for that many
  seconds — but the programme does **not** shorten.

`HANDOVER-2026-11-04-transitions.md` §2 says "the two clips overlap by `d`, the programme shortens". That
describes the arithmetic module, not the wiring. It was "watched in the app" as a *transition effect*; it is not
a true cross-dissolve. **Fixing it changes the frame grid** (and the audio concat path, whose 240-sample crossfade
would become `d`), i.e. it is Phase B work — a slice of its own. Until then, do not budget from §2's estimate, and
note that `clipProgrammeStarts`' comment says the same thing: it and `resolveVisibleClips` must move together.

## 5. Next, in the order I would take it

1. **Wire the overlap** (§4) — or, at minimum, correct the transitions handover §2 so nobody builds on a false
   premise. Small in code, large in blast radius.
2. **Colour grade** — a pass plus a panel; `apply_shader_effect` already carries the plumbing.
3. **Scene detection → split.** The only one needing a new capability (an FFmpeg pass over a source).
4. **`script-to-video`** — composition over `insertClip` / `addAnnotation` / `addZoom`.
5. **Thumbnail Studio (F5)** — a new request rode in this session: generate a **video description** (title /
   body / tags) beside the thumbnail prompt, so a creator gets from footage to publishable metadata without
   leaving ClipForge. Recorded in `docs/ROADMAP.md` F5 step 7. Still unclaimed: `side: "out"` transitions.

## 6. What a human still has to watch (2e3ef8e)

Run `%LOCALAPPDATA%\cf-2e3ef8e\release\0.1.0\win-unpacked\ClipForge.exe`. Then:

- **Speed ramp**: a speed pill over a clip, pick a curve (Ramp up / Peak), watch it accelerate rather than step.
  If it looks steppy, lower `SPEED_CURVE_STEP_SEC` (one constant in `speedCurve.ts`).
- **§4**: a dissolve whose INCOMING clip opens under a speed region on a `ramp-down` curve (so the opening is
  fast) — the fade should now run its full duration.
- Nothing about either is asserted against pixels.

## 7. Traps that cost time here

- **`gh run watch` in a background shell exited 1 while the run was green.** Twice. Read the verdict from
  `gh run list --json conclusion` / `gh run view <id> --json status,conclusion`, not from the watcher's exit code.
- **`gh run download` lays the artifact out as `release/0.1.0/win-unpacked/resources/app.asar`**, not
  `resources/app.asar` at the tree root, despite the older handover's recipe. Grep for the SHA there.
- **Biome mishandles many absolute paths** on this shell ("Checked 1 file" then `internalError/io`). Point it at a
  DIRECTORY, or at a few files.
- `shell_command` runs **cmd.exe** — `$LASTEXITCODE` and `Select-Object` do not exist there. Use the PowerShell
  tool for anything with a pipeline.
- The rest is unchanged from the 2026-11-06 handover: no Rust toolchain and no GPU locally (Rust is CI-only,
  ~16 min/cycle); clear `$env:NODE_ENV` before vitest; the Build is path-filtered on `docs/**` and `**.md`; the
  packaged smoke step flakes — re-run the failed job, never "fix" a flake; a docs-only commit runs CI but skips
  the Windows build.

## 8. Files touched

**New:** `src/lib/ai-edition/timeline/speedCurve.ts` (+ `.test.ts`)

**TS:** `lib/ai-edition/document/timeline.ts` (`readSpeedSpans`, curve through `readSpeedRegions`) ·
`lib/exporter/outputFrameCount.ts` (`clipProgrammeStarts`, exported `clipProgrammeEndSec`, optional
`sourceEndSec`) · `native/sceneDescription.ts` (both speed readers → `readSpeedSpans`; `speedSpans` hoisted;
`programmeStartSec` on the clip emit) · `native/contracts.ts` · `lib/ai-edition/store/useTimeline.ts`
(`updateSpeedCurve`) · `store/documentWriteAudit.test.ts` · `components/ai-edition/v4/FloatingInspector.tsx` ·
`v4/SpeedControl.test.tsx` · `src/i18n/locales/*/settings.json` (15)

**Electron:** `ai-edition/agent-tools.ts` · `ai-edition/deep-agent/service.ts`

**Rust:** `crates/compositor/src/scene.rs` · `regions.rs` (`blend_elapsed_sec` + test) ·
`compositor_windows.rs`

**Docs:** `docs/ROADMAP.md` (F5 step 7)
