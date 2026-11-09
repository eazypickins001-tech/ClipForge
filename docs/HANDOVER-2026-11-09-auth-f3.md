# Handover — 2026-11-09: OpenRouter auth and F3 (1440p/2160p export)

Continues `HANDOVER-2026-11-09-help-h1-h4.md`.

| Commit | What |
|---|---|
| `61d1f7b` | OpenRouter requests always carry an explicit bearer token; missing keys fail at the model boundary; Provider settings reports a failed key write. |
| `aea9aa7` | Export offers **1440p** and **2160p**, capped at the source so they never upscale; F3 is closed. |

**State: `aea9aa7`, CI green, Windows build green, artifact verified at
`C:\Users\Apple\AppData\Local\cf-aea9aa7`.** Its `app.asar` contains
`anthropic/claude-sonnet-4.5`, `defaultHeaders`, `saveFailed`, `1440p`, `2160p`, `qhd` and `uhd`.

- CI (`42546936453`) — success, 2m21s.
- Build Windows installer (`42546936428`) — success, 16m21s, packaged smoke passed.
- The auth build (`42543944421`) first failed its smoke on
  `clip-edits.spec.ts` "Extract audio" (a 30 s click timeout, unrelated to the change); the failed
  job was rerun and passed. Do not "fix" that timeout from a single occurrence.

---

## 1. OpenRouter "missing auth header"

Three changes, all in the AI path:

1. `createOpenScreenChatModel` sends `Authorization: Bearer <key>` through
   `configuration.defaultHeaders` as well as `apiKey`, so OpenRouter cannot receive a request with
   no auth header when a key exists. The key is trimmed first.
2. An API-key provider with no key now throws at model construction
   (`No API key for openrouter. Add one in Settings → AI.`) instead of making an unauthenticated
   request. `openai-compatible` remains the one provider allowed to be keyless.
3. `ProviderSettings.saveApiKey` checks `llmSetApiKey` and `llmSetConfig`; a failed
   `safeStorage` write is shown as `providerSettings.saveFailed` rather than a success toast.
   `saveFailed` is translated in all 15 locales.

Tests in `chat-model.test.ts` pin the trimmed bearer header and the missing-key throw. If a user
still sees a missing-auth error after this build, the remaining causes are outside the request
builder: re-open **Settings → AI → OpenRouter**, re-enter the key and save (an old config can keep
an empty credential), and check that the save toast is not the failure message.

## 2. F3 — 1440p/2160p export

- `ExportQuality` gained `"1440p"` and `"2160p"`; the dialog shows 720p / 1080p / 1440p / 2160p /
  Source in a wrapping grid.
- `calculateCappedDimensions` clamps the target short side to the source's own short side before
  sizing, so a 1080p source asked for 2160p exports 1920×1080, while a 4K source gets 3840×2160.
  Landscape and portrait are both covered.
- 720p/1080p keep their explicit behaviour (they may upscale; the dialog warns). Source still
  resolves to the smallest clip's own resolution. 24/30/60 fps were already offered; 60 fps is not
  gated on the source rate, so a 30 fps source is frame-duplicated. HDR is not implemented.
- `settings.json` gained `exportQuality.qhd` / `exportQuality.uhd` in 15 locales. Tests cover the
  caps and the bitrate path.

## 3. What remains

- **F4** background removal for the primary video (native compositor + packaged runtime check).
- **Phase-B blend leftovers**: the outgoing frame is still a freeze during the overlap; audio is a
  240-sample crossfade, not `d`; the live preview/ruler does not shorten.
- **F6–F9** and **TTS** remain decision-gated or large. H1's GIF-cancel flakiness is still reported,
  not fixed.

## 4. Resume

```powershell
Set-Location "C:\Users\Apple\Downloads\Telegram Desktop\UoK\ClipForge"
gh run list --limit 5
& "C:\Users\Apple\AppData\Local\cf-aea9aa7\release\0.1.0\win-unpacked\ClipForge.exe"
```
