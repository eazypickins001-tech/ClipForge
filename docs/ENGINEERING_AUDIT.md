# ClipForge — Phase 0 Engineering Audit

**Date:** 2026-10-29
**Auditor:** CommandCode agent (pairs with `Master Prompt.txt` §3)
**Method:** isolated shallow clones into `ClipForge/audit/`, then real install/build/test attempts **on this machine**. Nothing outside `audit/` was modified.
**Honesty rule:** every result below is a command that was actually run, with its real exit code. Anything not run is marked **NOT RUN**.

> **Headline:** OpenScreen is confirmed as the correct foundation, but **this machine cannot build its native Windows components** (no MSVC/CMake/Ninja/Rust) and its hardware is **below OpenScreen's own published minimums**. The JS/TS layer builds and tests fine. Resolving the native toolchain is the first order of business — see §10 and §12.

---

## 1. Environment inventory (measured)

| Item | Measured value | Notes / impact |
|---|---|---|
| OS | **Windows 11 Pro, 10.0.22000 (build 22000)** | Windows 11 21H2. Meets OpenScreen's 1903+ floor. |
| CPU | **Intel Core i5-5350U @ 1.80 GHz, 2 cores / 4 threads** | Broadwell, 5th gen, 2015 low-power part. **Below OpenScreen minimum** (Intel 8th gen / Ryzen 2000+). |
| GPU | **Intel HD Graphics 6000** (integrated), driver 20.19.15.5171 | No NVIDIA/AMD → **no NVENC, no AMF**. QSV may be present (unverified). |
| RAM | **8,288,700 KB total (~7.9 GiB)**; **770,856 KB free (~753 MiB)** at capture | OpenScreen wants 8 GB min / 16 GB recommended. Effectively maxed out. |
| Disk | **C: 142.3 GB used / 40.9 GB free** (43.6 GB after cleanup) | Tight for Rust + Electron + native builds. |
| git | 2.50.0.windows.1 | OK |
| Node.js | **v22.17.0** | Projects pin **22.22.1** (OpenScreen) / engine `>=22` + undici needs `>=22.19.0`. |
| npm | **11.16.0** | Projects pin **npm 10.9.4**. npm 11 gates lifecycle scripts (`allow-scripts`) — see §4/§10. |
| Rust / Cargo | **NOT INSTALLED** | Hard blocker for `crates/` (native compositor). |
| CMake | **NOT INSTALLED** | Hard blocker for the WGC capture helper. |
| Ninja | not present | Required by the WGC helper's CMake generator (`-G Ninja`). |
| Visual Studio Build Tools / MSVC | **NOT INSTALLED** (only *VS Installer* + VS Code; no `vcvarsall.bat`, no `cl.exe`/`link.exe`) | Hard blocker for every native Windows artefact. |
| LLVM / libclang | not verified (likely absent) | Needed by bindgen for the compositor addon. |
| Python | 3.13.2 | — |
| gh CLI | 2.102.0 | — |
| FFmpeg / FFprobe | **9.0.2-full_build-www.gyan.dev** | **GPL build.** Must not be bundled. |
| winget | available | `Gyan.FFmpeg`, `OpenJS.NodeJS.22` installable. |
| **`NODE_ENV`** | **`production` (set persistently)** | Causes npm `omit=dev` → **devDependencies silently skipped** on every install. |
| Shell cwd | `…\UoK\SpaceWise` | Unrelated; audit commands used explicit `Set-Location`. |

**Environment verdict:** the machine can develop/run the **JS/TS/Electron** layers but **cannot build the native Windows recorder/compositor** without installing a multi-GB toolchain.

---

## 2. Candidate repositories & pinned commits

Cloned with `git clone --depth 1 --single-branch --no-tags` into `ClipForge/audit/<name>/`.

| Candidate | Pinned commit | Commit date | Working-tree size |
|---|---|---|---|
| **OpenScreen** | `5d82a0cb2c1d54a8310836497966c49da4012ca2` | 2026-10-28 | 930.4 MB |
| **OpenScene** | `4bd3d3c4c15fb27dd0b521065643b3a2d516be08` | 2026-10-21 | 7.7 MB |
| **NanoThumbnail** | `5eb2c34bafe3f9569d858c88d6649f9f5bad5c5b` | 2026-09-27 | 242.4 MB |
| **Fest Video Editor** | `cb2f3b6b62b373d65d4dadb19e8bc1369062ca55` | 2026-05-28 | **0.2 MB** |
| **RHCES Video Editor** | `6a98a615f2ff43a711923c5db957903e5228c30e` | 2026-05-06 | 0.4 MB |

---

## 3. Licence & dependency findings

| Candidate | Licence (from file) | Verdict |
|---|---|---|
| OpenScreen | **MIT** — "Copyright (c) 2025 Siddharth Vaddem; Copyright (c) 2025-2026 OpenScreen contributors" | Clean. Preserve both copyright lines. |
| OpenScene | **MIT** — "Copyright (c) 2026 Theorvane" | App is clean, **but** see submodule note. |
| NanoThumbnail | **MIT** — "Copyright (c) 2025 Yoan Bernabeu" | Clean. |
| Fest Video Editor | **NO LICENSE FILE IN REPO** (README claims MIT) | ⚠️ Claim unverifiable from the repo; do not copy code. |
| RHCES | **MIT** — "Copyright (c) 2026 rhces" | Clean, but project immature (§4). |

**Submodules / vendored code**
- **OpenScene `.gitmodules`:** `external/opencut` → `https://github.com/Theorvane/OpenCut.git`. OpenCut's own `LICENSE` is **MIT-style** (permissive, "Copyright 2026 OpenCut"). **Not a licence blocker**, but per the master prompt we are **not** adopting OpenScene or OpenCut anyway (see §9).
- **OpenScreen vendors (verified via `THIRD-PARTY-NOTICES.md` + `scripts/fetch-ffmpeg.mjs`):**
  - **FFmpeg — LGPL v2.1+**, BtbN `*-lgpl-shared-8.1` assets, release `autobuild-2026-07-31-14-10`, SHA-256 pinned. The build script `assertLgpl()` reads `ffmpeg -L`, `-buildconf` and `-encoders` and **refuses any GPL/nonfree binary**. Corresponding-source offer included. **This is exactly the compliance posture ClipForge needs.**
  - **web-demuxer** — MIT wrapper containing LGPL FFmpeg→WASM.
  - **whisper.cpp / ggml** — MIT (built from source); STT model **not** bundled (downloaded to userData on first use).
  - **ONNX Runtime** — MIT (downloaded + SHA-256 verified at build).
- **Bottom line:** OpenScreen's dependency/licence hygiene is the strongest of the five and is directly reusable.

---

## 4. Actual build & test results

All commands run from the candidate's directory (PowerShell 5.1). `audit/**` was never modified to make anything pass.

### OpenScreen (`5d82a0c`)
| # | Command | Result | Evidence |
|---|---|---|---|
| 1 | `node scripts/build-windows-wgc-helper.mjs` | **EXIT 1** | `Error: Could not find Visual Studio vcvarsall.bat. Install Visual Studio Build Tools with C++.` |
| 2 | `node scripts/build-windows-compositor-addon.mjs` | **EXIT 1** | `FFMPEG_DIR pin (crates/.cargo/config.toml) points at …\crates\thirdparty\ffmpeg-n8.1.2-win64-lgpl-shared, which doesn't exist.` (and `cargo` is absent — the script would fail on that next) |
| 3 | `npm ci` (env as-is) | EXIT 0, **prod-only** | 0.26 GB; **no** `typescript`/`vitest`/`electron`/`vite`/`biome`. Cause: `NODE_ENV=production` → `omit=dev`. |
| 4 | `npm ci --include=dev` with `NODE_ENV=development` | **EXIT 0** | 0.84 GB; all devDeps present (`typescript`, `vitest`, `electron`, `vite`, `@biomejs/biome`, `playwright`). |
| 5 | `npx vitest --run` (full suite) | **did not complete** | Ran >25 min across two attempts on this CPU and was stopped; no verdict. |
| 6 | `npx vitest --run src/lib/ai-edition/timeline/zoom-suggestions.test.ts` | **EXIT 0** | 1 file, **37/37 passed**, 6.30 s. |
| 7 | `npx vitest --run src/lib/exporter/ src/lib/ai-edition/timeline/ src/native/` | **EXIT 0** | **44 files, 691/691 passed**, 46.66 s. |
| 8 | `npm run build:win` | **NOT RUN** | Cannot succeed — step 1/2 prerequisite failures. |
| 9 | NSIS packaging / app launch / recording / export | **NOT RUN** | Blocked by #8. |

### NanoThumbnail (`5eb2c34`)
| # | Command | Result | Evidence |
|---|---|---|---|
| 1 | `npm ci` | **EXIT 0** | 400 packages, ~5 min. |
| 2 | `npm run typecheck` | EXIT 1 | `'tsc' is not recognized` — TypeScript was not installed (dev omission). |
| 3 | `npm test` | EXIT 1 | `'vitest' is not recognized` — same cause. |
| 4 | `npm run build` | **EXIT 0** | Astro built 6 pages, ~32 s. |

### Fest Video Editor (`cb2f3b6`)
- Tree contains **only** `README.md`, `docs/icon.png`, `docs/Screenshot.png`. **No source, no LICENSE, no `package.json`.**
- **Cannot be built or inspected as software.** Documentation only. → §9.

### RHCES (`6a98a61`)
- **`git rev-list --count HEAD` = 1.** README states project save/load is "coming" (not implemented) and colour-filter export is partial.
- **NOT built** (single-commit scaffold; adopting it would mean finishing someone's v0.1).

### OpenScene (`4bd3d3c`)
- **NOT built** in this pass (decision already resolved by other candidates; not needed). Repo has `package.json`/`pnpm-lock.yaml` and a `mobile/` React Native app.

---

## 5. Recording & export tests

**NOT RUN — blocked.** Both require artefacts this machine cannot produce:
- **Recording** needs `electron/native/bin/win32-x64/wgc-capture.exe` (built by MSVC+CMake+Ninja) — blocked by §4 row 1.
- **Native preview / GPU compositor** needs `compositor_view.node` (Rust `cargo build`) — blocked by §4 row 2.
- **Export** additionally needs the pinned **LGPL FFmpeg** shared DLLs (`npm run fetch:ffmpeg`) and the ONNX/whisper binaries.

Conclusion: **no recording, editing, save/reopen or export has been verified on this machine.** Anyone claiming otherwise would be wrong. The `src/native/browserShim.ts` path is UI-dev scaffolding (fake sources, no real capture) — it is **not** a native-free recording path.

---

## 6. Security & privacy findings

1. **OpenScreen ships opt-out telemetry.** `electron/usage-ping.ts` posts an **anonymous daily ping to PostHog** (`https://eu.i.posthog.com/i/v0/e/`, public project token `phc_zhJDJHBBRDAJBwSb7zf2JuQ59v6RwBN96ZksM2y4oq8C`), **enabled by default**, honouring `DO_NOT_TRACK`. No install ID/hardware hash; GeoIP off. **This contradicts OpenScreen's README claim that "the desktop app sends nothing about you anywhere."** For ClipForge, this MUST be removed or inverted to opt-in/off-by-default to satisfy the master prompt's "no unexpected network requests" (§15) and privacy stance (§10).
2. **Auto-update:** OpenScreen declares `electron-updater` with a GitHub `publish` provider → produces `latest.yml`/`app-update.yml`. Network behaviour to be disclosed and made explicit in ClipForge.
3. **Credentials:** OpenScreen stores provider keys via Electron `safeStorage` (main process only) — good; renderer never receives them. Reuse this pattern.
4. **Positive:** the `assertLgpl()` gate and generated `THIRD-PARTY-LICENSES.txt` SBOM are strong supply-chain controls; the marketing **website** has analytics (`website/src/analytics.ts`) but that is not the desktop app.
5. **System FFmpeg is GPL** (`gyan.dev full_build`) → ClipForge must bundle only the project's fetched **LGPL** build, never the system one.

---

## 7. Architecture comparison

| Criterion (prompt §3.6) | OpenScreen | OpenScene | NanoThumbnail | Fest | RHCES |
|---|---|---|---|---|---|
| Windows build reliability | **Blocked here** (needs MSVC/Rust/CMake); well-scripted | Unverified | Web, builds OK | No source | 1 commit |
| Recording capability | **Native WGC + system audio + webcam (best-in-class)** | window capture to WebM | 0 | 0 | 0 |
| Timeline functionality | strong (trim/crop/speed/zoom/annotations/captions) | strong (keyframes, transitions) | — | minimal | multi-track |
| Save/reopen | versioned `.openscreen` project JSON | folder-as-project | IndexedDB | — | **not implemented** |
| Export quality/perf | GPU compositor + FFmpeg; wide aspect ratios | local FFmpeg H.264/AAC | — | Remotion/FFmpeg | `filter_complex` |
| Test coverage | **very high** (691 tests pass in a 3-dir slice) | moderate | moderate | none | none |
| Maintainability | **excellent** (full `technical-documentation/architecture/*.md`) | good, early | good | n/a | poor |
| Licence clarity | **excellent** (verification-gated LGPL + SBOM) | good (submodule MIT) | clean | **no LICENSE file** | clean |
| Packaging/updates | electron-builder NSIS + MSIX + electron-updater | installers + updater | PWA | installer | partial |
| Ease of adding content engine | high (ai-edition + MCP already present) | high (typed tool surface) | n/a | — | — |
| Ease of adding Thumbnail Studio | high (React + provider layer) | medium | **highest (logic to reuse)** | — | — |
| Maintenance risk | Medium (upstream drift) | Medium-High | Low | n/a | High |

---

## 8. Recommended foundation

**Fork OpenScreen as ClipForge's capture + editing + export foundation (Option A), and add the ClipForge modules (Content Studio, Thumbnail Studio, Library & Approvals, Publishing, Licensing) as new surfaces on the same shell.**

- It uniquely satisfies the master prompt's *"do not build a video editor from scratch"* while also carrying the licensing discipline (LGPL FFmpeg gate + SBOM) that de-risks commercial distribution.
- Adopt OpenScene's **patterns** (narrow typed bridge, main-process-owned secrets, approval-before-mutation) — **not** its code or its `opencut` submodule.
- **This recommendation is conditional** on resolving the native toolchain (§10). If that proves infeasible, the documented fallback is a native-light ClipForge that reuses OpenScreen's JS/TS + `fetch-ffmpeg` + caption modules with a Chromium `getDisplayMedia` recording path, built out over time.

---

## 9. Components to reuse / rewrite / exclude

**Reuse (from OpenScreen, MIT, with notices preserved):** native WGC capture helper, Rust GPU compositor, FFmpeg manager + `assertLgpl()` + pinned LGPL binaries, on-device Whisper captioning, versioned project format + migrations, export pipeline, CLI + MCP server, electron-builder NSIS/appx config, `licenses:generate` SBOM.

**Rewrite / replace:** branding (appId `com.etiennelescot.openscreen`, productName, copyright, icons, i18n copy); **remove or invert `usage-ping` telemetry**; add the ClipForge module set.

**Exclude:** OpenScene (code + `external/opencut` submodule), Fest (no source; no LICENSE), RHCES (single-commit scaffold, save/load missing), NanoThumbnail app (web/PWA — reuse only its concept/style/critique/prompt logic, reimplemented in-renderer).

---

## 10. Known limitations & blockers

| # | Blocker | Severity | Proposed resolution |
|---|---|---|---|
| B1 | No **VS Build Tools 2022 (C++, Windows 10/11 SDK)** → WGC helper cannot build | **Critical** | Install VS Build Tools + Windows SDK (~6-10 GB) |
| B2 | No **CMake + Ninja** → WGC helper build fails | **Critical** | `winget install Kitware.CMake`, `Ninja-build.Ninja` |
| B3 | No **Rust (rustup/cargo)** → compositor addon cannot build | **Critical** | `winget install Rustlang.Rustup` (+ MSVC target) |
| B4 | No **LLVM/libclang** → bindgen for the addon | High | `winget install LLVM.LLVM`, set `LIBCLANG_PATH` |
| B5 | **Hardware below OpenScreen minimums** (5th-gen 2C/4T, Intel HD 6000, 8 GB RAM) | High | Accept slow builds/recordings; document actual support; consider a stronger build machine |
| B6 | **40.9 GB free disk** for toolchain + Rust target + node_modules | High | Free space or use another drive; Rust `target/` alone can be several GB |
| B7 | **`NODE_ENV=production`** → npm skips devDependencies | Medium | Unset for installs, or always pass `--include=dev` |
| B8 | **npm 11.16.0** vs pinned **10.9.4**; `allow-scripts` gate blocks postinstalls (esbuild/electron/sharp) | Medium | Install the pinned npm (via `corepack`/volta) and/or approve scripts |
| B9 | Node **22.17.0** vs pinned **22.22.1** | Low | `winget upgrade OpenJS.NodeJS.22` (→22.23.4) |
| B10 | System FFmpeg is **GPL** | Medium | Bundle only the project's fetched LGPL build |

---

## 11. Implementation phases

Unchanged from the approved roadmap (`docs/ROADMAP.md` / plan §8). Phase 0 (this audit) leads directly into **Phase 1 — usable desktop editor**, whose first prerequisite is resolving **B1–B4** so `npm run build:win` can produce a runnable app.

---

## 12. Decision required (why we pause here)

The foundation choice (fork OpenScreen) is confirmed **on evidence**, but it cannot be *built* on this machine until the native toolchain exists. Before spending disk/time on a ~6–10 GB toolchain install on 2015 hardware, choose one of:

**Option 1 — Install the native toolchain (full fork capability).**
Install VS Build Tools 2022 (C++ + Windows SDK), CMake, Ninja, LLVM, Rust. Then `npm run fetch:ffmpeg` → `build:native:win` → `build:native:compositor` → `npm run build:win`. Risk: multi-GB download + very slow Rust compile on 2 cores; B5/B6 remain.

**Option 2 — Native-light first, native later (or elsewhere).**
Proceed with ClipForge's **JS/TS/Electron** layers (shell, IA, Content Studio, Thumbnail Studio, Library, Publishing, Licensing, FFmpeg-manager via prebuilt LGPL binaries, captions) and add a Chromium `getDisplayMedia` recording path; defer the WGC/compositor native build to a stronger machine. Faster to a working app here; recording quality lower until the native path lands.

**Recommendation:** Option 1 if this machine is the intended dev/build environment and you can free disk; otherwise Option 2 to keep momentum, with the native build scheduled on a stronger machine.

---

## 13. Reproduction

```powershell
# environment
Get-CimInstance Win32_OperatingSystem | Select Caption,Version,BuildNumber
Get-CimInstance Win32_Processor | Select Name,NumberOfCores
git --version; node -v; npm -v; rustc -V; cmake --version; ffmpeg -version
# native build failures (from audit/openscreen)
node scripts/build-windows-wgc-helper.mjs          # exit 1: no vcvarsall.bat
node scripts/build-windows-compositor-addon.mjs    # exit 1: FFMPEG_DIR pin missing
# JS layer (works)
$env:NODE_ENV="development"; npm ci --include=dev
npx vitest --run src/lib/exporter/ src/lib/ai-edition/timeline/ src/native/   # 691 passed
```
