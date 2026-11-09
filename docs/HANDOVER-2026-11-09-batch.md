# Handover — 2026-11-09: F9 headless batch export

Continues `HANDOVER-2026-11-09-auth-f3.md`.

| Commit | What |
|---|---|
| `583768d` | **`openscreen batch <manifest.json>`** — sequential headless exports from a JSON manifest, `--json`, `--fail-fast`, exit 0/1/2. |
| `21f0fc7` | Fix the batch spawn call: pass the executable and args separately, not the whole argv as `command`. |

**State: `21f0fc7`, CI green, Windows build green, artifact verified at
`C:\Users\Apple\AppData\Local\cf-21f0fc7`.**

- CI `42551230844` (2m27s) and `42553256598` (3m44s) — green.
- Build `42551230724` (14m46s) and `42553256552` (12m33s) — green, packaged smoke passed.
- Packaged CLI checks against `cf-21f0fc7`:
  - `ClipForge.exe --help` exits 0 and lists `openscreen batch <manifest.json>`.
  - `batch empty-batch.json --json` exits 2 with `The manifest needs a non-empty "jobs" array`.
  - `batch missing-batch.json --json` exits 1 and the child **`CliExportRunner` actually starts**
    (it fails on the missing project, which is the expected result). The first artifact
    (`cf-583768d`) failed every job with `The "file" argument must be of type string. Received an
    instance of Array`; that is what this fix addresses.

---

## 1. The contract

`website/docs/cli.md` is the reference. A manifest is a JSON object:

```json
{
  "jobs": [
    { "project": "demo.openscreen", "out": "out/demo.mp4", "quality": "source", "fps": 60 },
    { "project": "vertical.openscreen", "out": "out/vertical.mp4", "format": "mp4" }
  ],
  "failFast": false
}
```

- `project` is required. `out`, `format`, `quality`, `fps`, `gifFps`, `gifSize`, `gifLoop`,
  `autoZoom`, `audio`, `audioMode`, `audioOffset` mirror the export flags.
- `project`, `out` and `audio` resolve relative to the manifest file.
- Jobs run in order, one child export at a time; a failure does not stop the rest unless the
  manifest sets `failFast` or the command passes `--fail-fast`.
- Exit `0` all attempted jobs succeeded, `1` at least one failed, `2` invalid manifest or argument.
- `--json` emits `batch-start`, `job-start`, `job-done` (with `success`, `code`, optional `error`)
  and a final `done` with `succeeded`, `failed`, `skipped`, `results`.

## 2. Where it lives

- `electron/cli/batchManifest.ts` — pure validation + `batchExportArgv`, tested without Electron.
- `electron/cli/batchCommand.ts` — reads the manifest, spawns the app's own export CLI per job,
  drains child stdout in JSON mode, reports results; `spawn`/`readFile` are injectable for tests.
- `electron/cli/args.ts` — `batch` subcommand, `--json`, `--fail-fast`.
- `electron/cli/cliMain.ts` — dispatches `batch` after app-ready, before the renderer/handlers.
- `electron/cli/batchManifest.test.ts`, `batchCommand.test.ts`, `args.test.ts` — 36 tests total.

The child invocation is `spawn(execPath, [...(isPackaged ? [] : [appPath]), ...exportArgv])`.
The packaged app uses `firstArgIndex = 1`; a dev build uses `2`, which is why the app path is
prepended only when not packaged.

## 3. Trap that cost a build

`child_process.spawn(command, args, options)` is not `spawn(argv, options)`. The first artifact
passed the whole array as `command`; every batch job failed with Node's fs error rather than an
export error. The unit test now pins both `command` and `argv`, and the packaged check above is the
real end-to-end proof. Keep that packaged check when touching the batch runner.

## 4. What remains

- **F4** primary-video background removal (native compositor + packaged runtime check).
- **Phase-B blend leftovers**: outgoing frame is a freeze during the overlap; audio boundary is a
  240-sample crossfade, not `d`; the live preview/ruler does not shorten.
- **F6–F8** and **TTS** remain decision-gated or large. H1's GIF-cancel flakiness is still reported.

## 5. Resume

```powershell
Set-Location "C:\Users\Apple\Downloads\Telegram Desktop\UoK\ClipForge"
gh run list --limit 5
& "C:\Users\Apple\AppData\Local\cf-21f0fc7\release\0.1.0\win-unpacked\ClipForge.exe"
```
