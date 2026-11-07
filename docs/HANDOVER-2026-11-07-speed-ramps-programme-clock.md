# Handover — 2026-11-07: speed-ramp presets, and the blend window on the programme clock

Continues `HANDOVER-2026-11-06-blends-zoom-reframe.md` §6 item 1 ("Speed ramps"), and closes that file's §4.
Read that one and `HANDOVER-2026-11-04-transitions.md` first.

**State at handover: `2e3ef8e`, CI green, Build green, one build on disk (`%LOCALAPPDATA%\cf-2e3ef8e`).**
Working tree clean. The artifact's `app.asar` carries the SHA stamp — the tree is the commit.

> **Follow-up, same day (uncommitted):** the blend overlap is wired on the export side — §4 is now
> a WIRED section, not a flag. tsc / biome / the unit suite were run; **no new Windows build and
> no watched export**. `git status` is dirty by this session's changes only.

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

## 4. WIRED (same session) — the blend's overlap now shortens the EXPORT

`blendOverlapSec` (`timeline/transitionOverlap.ts`), `resolvePlaybackSegments`' optional third
argument and `playbackOverlaps` all existed and were tested. The bug was that nothing consumed
them: `resolveVisibleClips` built a contiguous list, so a dissolve drew a freeze-frame blend over
the incoming clip's opening and the programme did not shorten.

**The export grid is now shortened.** `clipBlendTailTrims` (`native/clipVideoDips.ts`) reads the
CLAMPED overlap back from `clipIncomingBlends` and cuts that many PROGRAMME seconds off the
outgoing clip's tail. `clipSourceEndAtProgrammeSec` (`lib/exporter/outputFrameCount.ts`, the
bisected inverse of `clipProgrammeEndSec`) converts that to source seconds — a 2x tail loses `d × 2`,
not `d`. `buildNativeClipList` (ExportDialog, CLI, MCP `getFrames`) emits the shortened windows, so
the native walk derives a shorter frame grid and the progress total follows it.
`buildSceneDescription(document, null, { trimBlendTails: true })` emits the same windows AND the
moved programme starts, so the blend window still begins at the incoming clip's first frame.
`projectRawTimelineSecToPlayback` gained an optional transitions argument, so imported tracks and
the MCP frame indices follow the shortened programme on the export side.

**What did NOT change, on purpose: the LIVE PREVIEW.** `resolveVisibleClips` still passes no
transitions, because the editor's playhead and the virtual transport run on the RAW ruler; a
shortened preview clock would be discontinuous with it. The preview keeps the full windows and the
freeze-frame blend it was watched with. Making the editor's transport programme-time — so the
preview and the ruler shorten too — is a slice of its own.

**Still a freeze, not a true dissolve.** The outgoing clip's last COMPOSED frame is held over the
incoming's opening; its final `d` seconds of motion are not advanced. The plan's Phase B item 3
(compose the outgoing per frame during the window) is untouched. The audio boundary is still the
240-sample crossfade, not `d`: the outgoing's tail audio is dropped with its window, so a true
`d`-length equal-power crossfade remains open. Export click sounds (`clickSound.ts`) are still
projected without the blend shift.

**Verified by tests only:** app tsc, biome, and the unit suite (the one full-suite failure was
`LeftPanel.copyMessage`, green on re-run — the known flake class). **No new Windows build was
produced and no exported picture was watched.** That remains §6, now with a dissolve that must
visibly shorten the file by the transition's duration.


## 5. Next, in the order I would take it

1. **Wire the overlap** — DONE for the export grid (§4). What remains of it: the true animated
   outgoing during the blend, the `d`-length audio crossfade, and the preview/transport
   programme clock. Otherwise, at minimum, the transitions handover §2 is now corrected.
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
- **Export overlap (new)**: export a dissolve between two known-length clips. The file must be SHORTER than
  the raw timeline by the transition's duration (clamped to half the shorter neighbour), while the blend
  still starts at the cut. Imported audio after the cut must stay in sync. The preview deliberately does
  NOT shorten — do not judge the export's length from it.
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

**Export overlap wiring (same session):** `src/native/clipVideoDips.ts` (`clipBlendTailTrims`) ·
`src/lib/exporter/outputFrameCount.ts` (`clipSourceEndAtProgrammeSec`) · `src/native/sceneDescription.ts`
(`trimBlendTails`; the doc note on `resolveVisibleClips`) · `src/lib/ai-edition/document/timeline.ts`
(`projectRawTimelineSecToPlayback`'s optional transitions) · `src/components/ai-edition/ExportDialog.tsx` ·
`src/cli/CliExportRunner.tsx` · `electron/mcp/media-tools.ts`. Tests: `src/native/clipBlendTails.test.ts`
(new), `src/native/sceneDescription.test.ts`, `src/lib/exporter/outputFrameCount.test.ts`,
`src/lib/ai-edition/document/timeline.test.ts`.
