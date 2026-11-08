# Handover — 2026-11-07 (second slice): scene detection → split

Continues `HANDOVER-2026-11-07-speed-ramps-programme-clock.md`. Same day, same tree:

- `edd2b3c` — **the blend overlap is wired on the export side** (that handover's §4 is now a
  WIRED section). CI and the Windows installer build are green for it.
- `5441576` — **scene detection → split** (this file). The Windows installer build is **green**.
  Its CI run was cancelled by the `ci-${{ github.ref }}` concurrency group when this handover's
  commit landed; the handover's CI run — the same code tree plus this markdown — is **green**.
- `e8e8bb5`, `93635d7` — this handover and its status correction.
- `7437576` — **`splitAtScenes` in the agent surface** (in-app agent, MCP, stdio). CI **green**. The
  Windows installer build failed once on the packaged smoke step's known `transitions.spec.ts`
  "the split never reached the saved project" flake and went **green on `gh run rerun --failed`**.

Verified for `5441576` locally: app `tsc`, biome, the touched suites (147 tests) and i18n key
parity (405 keys × 15 locales); the full suite is green on CI. The agent surface (`7437576`) is
covered by 326 targeted `service`/`agent-tools`/MCP tests. **No detection ran against a real
file** — this checkout has no FFmpeg, no Rust toolchain and no native addon.

---

## 1. What shipped

**The detector** — `electron/media/sceneDetect.ts` (new):

- Runs `ffmpeg -i <file> -an -sn -dn -vf "select='gt(scene,<threshold>)',showinfo" -f null -`.
  `showinfo` logs every selected frame's `pts_time`; those are the source seconds a new scene
  begins at. `parseSceneCuts` reads them, `filterSceneCuts` keeps one cut per `minSceneSec`
  (default 0.5 s), so a flash or a wipe cannot become a stack of micro-clips.
- Resolves FFmpeg through the same `resolveFfmpeg` as the waveform decoder, so it finds the
  packaged Windows `ffmpeg-shared.exe` (the static `ffmpeg.exe` is deliberately not shipped) and
  `ffmpeg` on macOS/Linux.
- Degrades, never throws: no FFmpeg (`reason: "no-ffmpeg"`), a non-zero exit, a timeout
  (5 min default) and an abort all come back as `success: false` with a message. Abort/timer
  `SIGKILL`s the child. Defaults: threshold 0.4, min scene 0.5 s.

**The IPC** — `electron/ipc/handlers.ts`, `electron/preload.ts`, `electron/electron-env.d.ts`:

- `detect-scenes` (file path, options) → `SceneDetectResult`. The path goes through
  `readableApprovedPath`, the same gate as every other renderer-supplied read. A second request
  from the same window aborts the first.
- `cancel-scene-detection` aborts that window's in-flight pass.
- The renderer only receives **source seconds**; the handler knows nothing about the document.

**The batch split** — `splitClipAtTimes` in `document/timeline.ts`:

- Applies the cuts **descending**. `splitClip` keeps the original id on the left half and shrinks
  its `sourceEndSec`, so a lower cut still addresses the same clip; ascending cuts would no-op.
- Reuses `splitClip` wholesale, so trims/regions/audio-take handover behaviour is unchanged.

**The action** — `splitClipAtTimesAt` in `store/useTimeline.ts`:

- Reads the document at **call** time (`useProjectStore.getState()`), not from the render
  closure: detection is async and an edit made while it ran must not be overwritten.
- Filters the detector's cuts to the clip's own source window, performs the batch, saves **once**
  (`history: true`) and returns the number of pieces added. Every cut missing = no save, no undo
  step. Declared in `documentWriteAudit.test.ts`.

**The UI** — Clip menu → **Detect scenes** (`v4/ClipMenu.tsx`, wired in `NewEditorShell.tsx`):

- Resolves the clip under the playhead (the same `clipAtPlayhead` the other rows use), takes its
  asset's `originalPath`, calls `detectScenes` with 0.4 / 0.5 s, then `splitClipAtTimesAt` with
  reason `"Scene change"`.
- One undo step for the whole sweep. A missing path, missing FFmpeg, a failed decode or no cuts
  is a toast; the clip's playhead miss reuses `inspector.splitClipHint`.
- Four i18n keys in `editor.json` × 15 locales: `inspector.detectScenes`,
  `detectScenesNone`, `detectScenesDone`, `detectScenesUnavailable`.

**The agent tool** — `splitAtScenes` (in-app agent, MCP server, `openscreen mcp` over stdio):

- One call, one clip: `{ clipId, threshold?, minSceneSec?, dryRun? }`. `runDocumentTool`'s async
  pre-flight (`loadSceneCuts`) resolves the clip's asset, calls `runtime.detectScenes` with the
  request's threshold/min-scene and the turn's abort signal, and filters the cuts to the clip's
  own source window. The synchronous executor then applies
  `splitClipAtTimes(document, clipId, cuts, "agent", "Scene change")` — one document, one undo.
- `dryRun: true` returns the cuts and edits nothing. The pre-flight keeps the same three verdicts
  as the UI/IPC: `ok`, `unavailable` (wired but failed / not wired) and `no-ffmpeg`; the executor
  reports them separately so "could not look" is never passed off as "no shots".
- Registered in `OPENSCREEN_TOOL_NAMES`, `MUTATING_TOOL_NAMES`, `TOOL_ARG_SCHEMAS` (same order) and
  `TOOL_DESCRIPTIONS`. The runtime is wired in `handlers.ts` (the MCP deps **and** the in-app chat
  runtime), `chat-service.ts`/`InvokeArgs`, and `McpToolDeps` in `openscreen-mcp-server.ts`; the
  stdio CLI gets it through the same `mcpToolDeps`.
- Tests: `service.test.ts` (detects + filters + splits in one document, dryRun edits nothing, a
  detector that could not look, a missing FFmpeg), the `ARGS` fixture entry, the mutating-name
  table, and the MCP tool list (derived from `OPENSCREEN_TOOL_NAMES`).

**Tests**

- `electron/media/sceneDetect.test.ts` (new): argument shape, `pts_time` parse, the min-gap
  filter, clean exit, no-FFmpeg, non-zero exit, abort → `SIGKILL`. `spawn` is mocked, the pattern
  `stt/extractAudio.test.ts` uses.
- `document/timeline.split.test.ts`: descending batch, dedupe/outside cuts, identity on a miss.
- `store/useTimeline.test.ts`: one save for N cuts, one past-history entry, no save on a miss.
- `v4/ClipMenu.test.tsx`: the new row and its action; the row order list was updated.
- `documentWriteAudit.test.ts`: the `splitClipAtTimesAt` row.

## 2. What a human still has to run

1. Use a build with a real FFmpeg (the packaged Windows build carries `ffmpeg-shared.exe`; a dev
   checkout without `electron/native/bin` has none). Put the playhead inside a clip with visible
   shot changes, then **Clip → Detect scenes**.
2. Expect one cut per shot boundary, all inside that clip, and **one Ctrl+Z** for the sweep.
3. A file with no shots, a photo, or a missing FFmpeg should toast, not throw.
4. Nothing about the cuts has been watched against pixels or against a known edit list. A false
   positive/negative rate at 0.4 is unmeasured.

## 3. Known limits, deliberately left

- **The whole source file is scanned**, then cuts are filtered to the clip's window. Correct, but a
  small clip in a two-hour recording pays for the whole decode. A later pass can add `-ss`/`-t`
  with a pre-roll.
- **No progress or cancel button in the UI.** The IPC has `cancel-scene-detection`; the menu
  action just awaits. The pass is usually faster than a Whisper transcription, but it is not
  instant on a long file. The agent tool has the same wait — its only progress is the chat's
  running-tool indicator, and the abort signal is threaded so a cancelled turn kills the decode.
- **The agent tool has no panel threshold control**; it takes `threshold`/`minSceneSec` from the
  model. The UI action still uses the two constants.
- **A `dryRun` call is still classed as mutating** (`MUTATING_TOOL_NAMES`), so it needs agent/MCP
  edits enabled even though it writes nothing. That is deliberate: one tool, one consent rule.
- **Threshold/min-scene are constants** (0.4 / 0.5) in the menu call, not a panel.
- Inherited from `splitClip`: `wordRefs` stay on the left half; a modifier spanning a cut stays
  anchored to the left; anchored audio takes are handed over, not cut. Those are documented in
  `splitClip` and unchanged.
- **`npm run i18n:check` is still broken** (`Could not find appx block in
  electron-builder.json5`). Parity was checked directly: 405 keys in all 15 `editor.json`.
- **`tsc -p tsconfig.test.json` is still red on pre-existing fixtures** (`detached` on audio
  tracks, `transition` in the `useTimeline` tool maps). The new test files add no errors; the root
  `tsc --noEmit` is clean.
- The full unit suite was attempted after this slice and **timed out on this machine at 20 min**
  after the same `LeftPanel.copyMessage` failure seen before (it passes in isolation; known flake).
  The previous local full run was 5278 passed / 1 flaky. **CI ran the full suite for `e8e8bb5` and
  is green**, which is the reliable signal.

## 4. Next, in the order I would take it

1. **Sensitivity + progress**: a small panel (threshold, min scene) and `-progress pipe:1` with the
   IPC cancel surfaced, so a long file does not look hung. The agent tool already takes the two
   knobs; the UI action still hard-codes them.
2. **Scan window**: `-ss`/`-t` around the clip with a pre-roll.
3. Then the remaining queue: `script-to-video`, Thumbnail Studio (F5, including the video
   description recorded in `ROADMAP.md` F5 step 7), and the export overlap's remaining items
   (animated outgoing during a blend, `d`-length audio crossfade, preview programme clock).

## 5. Files touched

**New:** `electron/media/sceneDetect.ts` (+ `.test.ts`), this handover.

**Main/IPC:** `electron/ipc/handlers.ts` · `electron/preload.ts` · `electron/electron-env.d.ts`

**Document/store:** `src/lib/ai-edition/document/timeline.ts` (`splitClipAtTimes`) ·
`src/lib/ai-edition/store/useTimeline.ts` (`splitClipAtTimesAt`) ·
`src/lib/ai-edition/store/documentWriteAudit.test.ts` · tests above

**UI/i18n:** `src/components/ai-edition/v4/ClipMenu.tsx` (+ test) ·
`src/components/ai-edition/NewEditorShell.tsx` · `src/i18n/locales/*/editor.json` (15)

**Agent surface (`7437576`):** `electron/ai-edition/agent-tools.ts` (+ test) ·
`electron/ai-edition/deep-agent/service.ts` (+ test) · `electron/ai-edition/chat-service.ts` ·
`electron/ipc/handlers.ts` · `electron/mcp/openscreen-mcp-server.ts`
