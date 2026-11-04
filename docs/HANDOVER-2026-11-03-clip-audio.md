# ClipForge — session handover (2026-11-03)

Repo: `C:\Users\Apple\Downloads\Telegram Desktop\UoK\ClipForge`
Branch `main`, remote `github.com/eazypickins001-tech/ClipForge`.
**HEAD: `164fc8b` — CI green, Windows build green, 7 packaged-app e2e passing.**
Working tree clean. Latest build extracted at `%LOCALAPPDATA%\cf-164fc8b`.

## Honesty gate (unchanged, absolute)

Never claim a build, test, export or integration succeeded unless it was run and observed.
Anything unverified is labelled NOT RUN. This session leaned on it repeatedly: two "green"
reads turned out to be the wrong run, and one green job had tested nothing I added.

## What shipped this session

| Commit | What |
|---|---|
| `9282be8` | Audio-only export (WAV) in the Export dialog — renders the project, discards the picture, extracts the stream |
| `32a3359` | Three tests unpinned from the landscape canvas + `@noble/hashes` resolved from `app-builder-lib` instead of a stray `node_modules` above the checkout |
| `add082e` | The audio render (`<out>.wav.render.mp4`) is deleted in a `finally`; guarded IPC `delete-export-render` |
| `958a1d7` | Audio render sized from `sceneDesc.output` — the compositor refuses a different shape (`audioRenderDims`) |
| `5a9cd35` | **Reverted** the 9:16 factory canvas: `aspectRatio` is `"auto"` again |
| `44f60d6` | Capture shape picker (Auto · 16:9 · 9:16 · 1:1) in the HUD, persisted in recording prefs, applied at import |
| `1a8f361` | Picker moved to the TOP of the panel (it was below the fold — shipped but unfindable) |
| `83ef979` | `extracted` audio-track kind + `isVoiceKind` predicate |
| `aba8800`,`b7151fa`,`f424fde`,`20bde8e` | e2e for Split + Extract audio, wired into the smoke step, and made to pass |
| `8196ea7` | **Clip mute**: per-clip `gainDb`/`muted`/`fadeInMs`/`fadeOutMs`, `setClipAudio`, `joinable` guard, `updateClipAudio`; export silences via `hasAudio: false` |
| `4b9c3be` | Preview honours mute, applied in the rAF tick |
| `f20987c` | **Regression fix**: the native scene parser knows only `music\|voiceover`, so `extracted` failed the WHOLE parse. Translated at the boundary |
| `9926c34` | **Clip audio panel** (`ClipAudioModal`) + rail speaker button + shell wiring |
| `c13e658` | e2e for the panel's mute, through the packaged app (verified: 7 e2e passed) |
| `3e5cbe7` | Scene emits `gainDb`/`fadeInSec`/`fadeOutSec` per clip (inert: no `deny_unknown_fields`) |
| `164fc8b` | Preview applies the clip's level and fades (reuses `timelineAudioFadeAt`) |

## The bug that started the audio work

`muteRanges` was **write-only**: `detachAudio` wrote one and nothing read it — no renderer path,
no scene field, and the crates have no mute concept at all. So Extract audio moved the sound to a
new track and left the clip playing it underneath, in the preview and in the file. Fixed by a
per-clip `muted` flag, which reaches native as `hasAudio: false`.

## Control matrix (what is real)

| Control | Document | Preview | Exported file |
|---|---|---|---|
| Mute (panel or extraction) | yes | yes | **yes** |
| Volume (clip level) | yes | yes | **NO** |
| Fade in / out | yes | yes | **NO** |

Volume and fades reach the scene but nothing consumes them yet.

## Next task — the Rust mixer (the only thing left in audio)

TS side is DONE (`3e5cbe7` emits the fields; serde ignores what it does not know, so the current
native build is unaffected). What remains, in this order:

1. **Windows only first**, so one CI cycle is cheap to diagnose:
   - `crates/compositor-view-napi/src/lib.rs:556` — the JS-facing clip struct (`has_audio`), and its
     mapping at `:781`. Add `gain_db: f32`, `fade_in_sec: f64`, `fade_out_sec: f64`
     (`#[serde(default)]`, camelCase comes from the struct's rename attr — CHECK it first).
   - `crates/compositor/src/pipeline_windows.rs:1334` — the pipeline's clip struct. Same fields.
     Read them at `:1858` (the `has_audio` guard) / `:1898` (`declared_audio`).
   - `crates/compositor/src/audio_jobs.rs:47-74` (`decode_and_stretch_clip_audio`) — apply
     `apply_gain_db(&mut pcm, gain_db)` next to the existing `loudness_gain_db(path)` call, and the
     fades with `resolve_fade_samples` (`audio.rs:2103`) + `fade_envelope` (`audio.rs:2120`).
     Both are currently **private** — visibility will need widening.
   - Mind the hardcoded 240-sample boundary crossfade (`audio.rs:27`): fades must not fight it.
2. Push, read the build log, fix, repeat until green.
3. Mirror to `pipeline_macos.rs` / `pipeline_linux.rs` (~1380 / ~1245 in the other checkout; verify).

## After that — transitions and scene animations (not started, needs a plan)

- Transitions: compositing across a clip boundary. The video side has no blend stage; the audio side
  has only the fixed 240-sample crossfade. Expect a scene-schema change **plus** native work, and
  plan it from what the compositor can actually do, not from a list of CapCut transition names.
- Scene animations: `zoomRanges` / `shaderEffectRanges` / annotations are all "a region with a time
  span and an effect" — build on that rather than inventing a parallel system.
- User's standing instruction: **mimic CapCut as closely as possible**, UI and behaviour.

## Open flags

- `MS_STORE_PRODUCT_ID` in `electron/star-prompt.ts` is still OpenScreen's. Gated behind the unused
  MS Store channel; must not survive a Store release.
- The **locale insertion script is broken** — it closed the wrong JSON object and broke all 15 locale
  files (reverted). Until it is fixed, add i18n keys by hand or reuse existing ones. The clip audio
  panel currently reuses `audio.title`, `audio.outputGain`, `audioTrack.fadeIn/fadeOut/mute`.
- `muteRanges` remains in the schema but nothing reads it; `detachAudio` no longer writes it.
  Retiring the field is a separate decision.
- `extracted` is translated to `voiceover` at the native boundary; the native enum has two kinds and
  does not need a third that behaves like the second.
- Ubuntu-only failures are gone: the "permanently red CI" was a borrowed module resolved from a
  `node_modules` above the checkout, not a platform bug.

## Environment gotchas that cost time this session

- `NODE_ENV=production` is set globally in this shell — clear it for vitest or the suite mass-fails.
- No Rust toolchain, no CMake, no native addon locally: **Rust and anything touching
  `compositor_view.node` can only be verified in CI** (~13 min per build).
- Commit messages must go through a file (`git commit -F`). A PowerShell here-string breaks when a
  message line starts with `'@`; `-m "" -m "..."` gets parsed as pathspecs.
- PowerShell + `ConvertFrom-Json` pipelines mangle output; write explicit `foreach` loops.
- `gh run watch` **with no id watches the latest run** — it silently watched CI when I meant the
  build, and I reported a false "build green". Always resolve the run id for the SHA first.
- The smoke step lists its spec files **explicitly** (`build.yml:162`): a new spec that is not added
  there runs nowhere. It also reported a green job while testing none of my new tests.
- `gh run download` extracts into the target dir; a partial earlier extract makes the retry fail.
  Delete the dir first, and use `%LOCALAPPDATA%` (the `%TEMP%` sweeper ate a build once).
- After a verified build, delete older `%LOCALAPPDATA%\cf-*` trees: each is ~667 MB. Keep only the
  newest (user's standing instruction).

## Verify-then-deliver recipe

```
git push origin main
# resolve the run ids FOR THIS SHA, then:
gh run watch <build-id> --exit-status      # and <ci-id> separately
gh run download <build-id> -n clipforge-windows-x64 -D %LOCALAPPDATA%\cf-<sha>
# confirm the stamp and the feature markers inside app.asar before handing over the path
```
