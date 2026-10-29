# ClipForge — Roadmap

**Requirements source of record:** `Master Prompt.txt`
**Phase 0 findings:** `docs/ENGINEERING_AUDIT.md`

## Locked decisions

| # | Decision |
|---|----------|
| 1 | **Foundation:** fork **OpenScreen** (MIT) for capture + editing + export; layer ClipForge modules on top |
| 2 | **Repo:** new repo in this folder, fresh history → `github.com/eazypickins001-tech/ClipForge` |
| 3 | **Checkpoint:** Phase 0 audit first, then pause for review |
| 4 | **Optional AI:** **OpenRouter** primary BYOK; core stays fully local/offline without it |

## Product promise

"Capture what you do. Turn it into content. Edit it. Repurpose it. Prepare it for publication."

Local-first desktop workspace: recording → editing → AI-assisted content → short-form repurposing → thumbnails → content library & approvals → optional publishing. No cloud account needed for core record/edit/save/export.

## Phases

Each phase ends with: run tests → fix regressions → record commands/results → update docs → summarise what works / remains / is blocked.

- **Phase 0 — Engineering audit.** *(this pass)* Environment inventory, candidate clones + pinned commits, licence/dependency audit, real build/test attempts, foundation decision. → `docs/ENGINEERING_AUDIT.md`
- **Phase 1 — Usable desktop editor.** Rebrand fork; create/save/reopen/duplicate project; import + preview; basic timeline edit (add/trim/split/move/delete/order); save/reopen; export playable MP4; clear missing-media + error handling. **Prerequisite: resolve toolchain blockers B1–B4.**
- **Phase 2 — Capture & recording handoff.** Verify/adapt recording; manual + drag-drop import; configurable watched folder with completion detection + duplicate detection; "Open in Editor"; optional OBS WebSocket connector (only if version/API tests pass, else documented manual path); preserve originals.
- **Phase 3 — Build-in-Public Content Engine.** Content sessions; evidence model (notes, transcript, frames, read-only git, test results); generate editable hooks/scripts/storyboards/captions/platform copy with **per-asset evidence provenance**; no invented claims; local save; AI optional.
- **Phase 4 — Repurposing & captions.** Derivative projects (landscape/vertical/square, highlights, captioned variants); source↔derivative tracking; source never overwritten; ASR (local Whisper default) or subtitle import; user reviews proposed clips.
- **Phase 5 — Thumbnail Studio.** Input context with declared evidence basis; 3 distinct concepts; **prompt-only mode with no API**; direct generation via verified providers (OpenRouter default) with consent/cost disclosure; composition editor; PNG/JPEG export; 16:9 **1280×720** preset; honest quality heuristics (no CTR/virality fabrication).
- **Phase 6 — Content library & publishing connectors.** Asset library by project/session; approval state machine; investigate GHL (+ others) against live docs before implementing; preserve human approval; real publish states; manual export package fallback.
- **Phase 7 — Freemium readiness & release candidate.** Useful free tier; clear premium boundaries; **Ed25519** entitlements with private key outside the app; expiry never blocks local files; Windows installer + portable; notices/SBOM; new user completes core workflow unaided.

## Compliance invariants (never break)

- FFmpeg: **LGPL builds only**, via the inherited `assertLgpl()` gate + SHA-256 pins. Never bundle the GPL system FFmpeg.
- OBS: connect to a separately installed OBS; **never bundle GPL OBS components**.
- Secrets: OS `safeStorage` only; never in renderer, source control, or plaintext config.
- **Remove or invert OpenScreen's opt-out PostHog telemetry** before any release.
- Preserve MIT copyright notices from every reused project.
- Never commit recordings, screenshots, keys or signing material.

## Working method

Small testable modules. Automated tests (`vitest`) + Playwright E2E + a repeatable Windows smoke test (record/import → edit → save → reopen → export). Synthetic media only. **Never claim a build/test/export/integration succeeded unless verified.** When context approaches ~90%, flush state to `docs/SESSION_HANDOVER.md` (see `ENGINEERING_AUDIT.md` §13 protocol).
