# Handover — 2026-11-09: in-app Help, H1–H4 closed, live OpenRouter default

Continues `HANDOVER-2026-11-08-queue-finish.md`.

| Commit | What |
|---|---|
| `e2093f0` | In-app **Help** menu and seven task topics; H1–H4 closed; OpenRouter default moved to a model with live endpoints. |

**State: `e2093f0`, CI green, Windows build green, artifact verified on disk at
`C:\Users\Apple\AppData\Local\cf-e2093f0`.** Its `app.asar` contains
`anthropic/claude-sonnet-4.5`, `How to use ClipForge`, `help-menu` and `help.gettingStarted`.
Working tree has only the intentionally uncommitted Impeccable `.opencode/` and
`.github/{agents,hooks,skills}` trees.

- CI (`42540497360`) — success, 2m45s: lint, type-check, unit tests.
- Build Windows installer (`42540497403`) — success, 14m59s: native capture, D3D11 compositor,
  Whisper, NSIS package, and the packaged smoke test (export, trim/save/reopen, clip edits,
  transitions, transcription).

---

## 1. Help menu

- `src/components/ai-edition/v4/helpContent.ts` — seven topics: Getting started, Recording,
  Editing, Export, AI & agent, Thumbnail Studio, Keyboard shortcuts. Bodies are English-first;
  task steps use the exact command names from the UI.
- `HelpMenu.tsx` — a `TopBarMenu` ("Help") that opens one `ModalShell` with a topic sidebar and
  the selected body. Mounted unconditionally in `EditorTopBar`, so it exists in Media, Edit and
  Rec, with or without a project or provider.
- Topic titles reuse existing keys where they exist (`topbar.export`,
  `inspector.thumbnailStudio`, `shortcuts.title`); six new keys (`help.menu`, `help.title`,
  `help.gettingStarted`, `help.recording`, `help.editing`, `help.ai`) are translated in all 15
  locales. Parity check: 464 keys, zero differences.
- `HelpMenu.test.tsx` opens the menu, picks a topic, switches to Export, and closes the modal.

## 2. H1–H4

- **H1 — reported, not fixed.** The cancel path is unit-tested. The packaged "cancels a running
  native GIF" spec is deliberately excluded from the smoke step
  (`--grep-invert`), and both observed symptoms are documented in
  `tests/e2e/gif-export.spec.ts`. A renderer-responsiveness fix remains future work.
- **H2 — unit-verified.** `NativeCompositorOverlay.test.tsx` now feeds an ENOENT view error and
  asserts the missing-file headline plus the relink button; a non-ENOENT error keeps the GPU
  headline and offers no relink.
- **H3 — documented.** `technical-documentation/engineering/build-and-packaging.md` has
  “Export has no JS fallback — a checkout without the addon cannot export”, including the failure
  strings and the whole-directory copy rule.
- **H4 — closed.** `tests/e2e/clip-edits.spec.ts` already presses the Split control and asserts two
  clips on disk and in the UI; it runs in the packaged smoke step. The roadmap now records that.

## 3. OpenRouter “empty response”

The text default was `anthropic/claude-3.5-sonnet`. OpenRouter now reports **zero endpoints** for
that slug (the models list omits it), so every chat turn threw, and the deep agent wrapped the
failure as `Empty response from model`. The default is now `anthropic/claude-sonnet-4.5`
(seven live endpoints at the time of writing), and the provider table in
`technical-documentation/architecture/llm-providers.md` matches.

A user who already saved a config keeps the old slug in `llm-config.json`. Re-open
**Settings → AI → OpenRouter**, choose a current model (the picker lists live slugs), and save.
Image generation (`google/gemini-2.5-flash-image` by default) is a separate path and needs a key
with credits; image models are not free.

## 4. Remaining

- Phase-B blend leftovers, F6 (stem separation), F7 (subject tracking), F8 (general
  keyframes/graphs), F9 and hosted TTS — all decision-gated or large.
- H1's cancel responsiveness, if it is ever prioritised.
- Help bodies are English-only; localising them is a follow-up, not a blocker.

## 5. Resume

```powershell
Set-Location "C:\Users\Apple\Downloads\Telegram Desktop\UoK\ClipForge"
gh run list --limit 5
# artifact already downloaded:
& "C:\Users\Apple\AppData\Local\cf-e2093f0\release\0.1.0\win-unpacked\ClipForge.exe"
```
