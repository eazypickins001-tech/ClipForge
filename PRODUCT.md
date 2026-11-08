# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Solo creators and founders who record product demos, tutorials and short-form video themselves — usually on one machine, with no editor, camera crew or production pipeline. Their job is to turn raw screen and camera footage into a watchable, publishable clip quickly, without handing the work to a cloud service.

## Product Purpose

ClipForge is a local-first desktop workspace for recording the screen and camera, editing the take, and preparing it for publishing. Success is a creator getting from raw footage to an exported video — and to its copy and thumbnail — without needing an account or a cloud service.

## Positioning

Local-first, no account. The core record → edit → export path runs on the creator's machine and needs no cloud account; AI is optional and brings its own key (BYOK). A neighbouring cloud editor cannot truthfully claim that same default.

## Operating Context

Desktop Electron application for Windows, macOS and Linux, rendered as web UI. Projects, recordings and exports live locally; AI features are optional and reach a provider only when the creator configures a key. A local MCP/agent surface exposes the same document tools to external clients. There is no native iOS or Android app.

## Capabilities and Constraints

Confirmed product constraint: the core is local and offline-capable, and AI is optional (BYOK). **The product is not freemium and never adds a paywall, premium tier, feature gate or upsell**: the core stays free and fully usable without an account, and the revenue model is deliberately undecided until the build is complete. Implemented in the repository: screen and webcam recording; non-destructive timeline editing (trim/split, audio, transitions, speed ramps, zoom, layout, colour grade); a native Rust compositor for preview and export; local Whisper captions; an AI assistant and agent tools; scene detection and split; script-to-video composition; a Thumbnail Studio with prompt-only concepts, OpenRouter image generation, publishing copy, and a 1280×720 PNG/JPEG composer.

Open decisions: licensing, distribution and the eventual revenue model (deliberately deferred until the build is complete) are not recorded here. Do not invent them, nor any customer, benchmark or deployment claim.

## Evidence on Hand

Working Electron/React code, a Rust compositor, unit and packaged end-to-end tests, and the handovers under `docs/`. No customer testimonials, benchmark results or pricing evidence exist in the repository; future work must not fabricate them.

## Product Principles

- **Local-first by default** — the record → edit → export path must work without an account; AI may be absent and the product must still be whole.
- **AI assists, never gates** — no core capability may require a provider key or a cloud round trip.
- **The creator stays in control** — edits are non-destructive and one gesture is one undo step.
- **Honest output** — the preview and the export agree, and generated copy is derived from declared evidence rather than invented claims.
- **Free core, no gating** — never put a paywall, premium tier or upsell in front of a core craft feature; decide the revenue model after the build, not by degrading the product.
