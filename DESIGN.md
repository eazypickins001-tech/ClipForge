---
name: ClipForge
description: A calm, precise, local-first cutting room for screen-recorded video.
colors:
  signal-mint: "#10b981"
  signal-mint-deep: "#059669"
  accent-ink: "#04221a"
  playhead-violet: "#6c55ff"
  record-red: "#ef4444"
  warn-amber: "#f59e0b"
  annotation-amber: "#eab308"
  speed-orange: "#f97316"
  zoom-blue: "#3b82f6"
  cool-slate: "#eaeef3"
  surface: "#ffffff"
  surface-1: "#f1f5f9"
  surface-2: "#e2e8f0"
  surface-3: "#cbd5e1"
  ink: "#0f172a"
  ink-2: "#334155"
  muted: "#64748b"
  border: "#e2e8f0"
  border-soft: "#e6eaef"
  border-hi: "#cbd5e1"
  dark-canvas: "#0a0d12"
  dark-surface: "#14181f"
typography:
  display:
    fontFamily: "Geist, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.2
  headline:
    fontFamily: "Geist, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.3
  title:
    fontFamily: "Geist, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "-0.015em"
  body:
    fontFamily: "Geist, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Geist, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.3
  mono:
    fontFamily: "Geist Mono, ui-monospace, SF Mono, Menlo, Consolas, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  xs: "4px"
  sm: "8px"
  md: "10px"
  lg: "12px"
  xl: "16px"
  shell: "18px"
  pill: "9999px"
spacing:
  sp-1: "4px"
  sp-2: "8px"
  sp-3: "12px"
  sp-4: "16px"
  sp-5: "20px"
  sp-6: "24px"
components:
  button-primary:
    backgroundColor: "{colors.signal-mint}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "34px"
  button-primary-hover:
    backgroundColor: "{colors.signal-mint-deep}"
    textColor: "{colors.accent-ink}"
  button-secondary:
    backgroundColor: "#0f172a14"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "34px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.sm}"
    padding: "0 10px"
    height: "30px"
  icon-button:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.sm}"
    size: "32px"
  text-field:
    backgroundColor: "#f1f5f9"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "34px"
  chat-chip:
    backgroundColor: "#10b9811a"
    textColor: "{colors.signal-mint}"
    rounded: "{rounded.pill}"
    padding: "5px 10px"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "20px 24px 24px"
---

# Design System: ClipForge

## Overview

**Creative North Star: "The Calm Cutting Room"**

ClipForge should feel like a quiet, precise cutting room: a settled desktop instrument where the footage and the timeline are the work, and the chrome stays out of the way. The layout is cool and orderly, the type is compact and exact, and mint appears as a single live signal on the action that matters. Restraint is the point — a creator should feel the tool is under control, not that the interface is competing with the edit.

The system is **calm, precise and quietly confident**. It is not warm and tactile, and it is not a dense technical console: there is air around the panels, but density stays high enough for real editing. Light is a cool slate daylight desk; dark is the graphitic hero look. Both are the same token set swapped, with the same mint and the same hierarchy.

**Key Characteristics:**
- Mint as one live signal, not a decorative wash.
- Cool slate neutrals; white surfaces on light, graphite surfaces on dark.
- Geist for the interface; Geist Mono for numbers and technical readouts.
- 34px controls, 10px radii, 13px body: compact, exact, touchable with a mouse.
- Flat at rest, with a faint lift only for cards, popovers and dialogs.
- The timeline is the signature object: mint clips, colour-coded effect pills, a violet scrub line.

## Colors

The palette is a cool neutral field with exactly one chromatic signal and a small set of semantic hues. The neutrals do the structural work; the hues annotate state.

### Primary
- **Signal Mint** (#10b981): the primary action, the selected state, the clip card and the record-ready signal. It is the only chromatic accent the chrome uses.
- **Signal Mint Deep** (#059669): the hover of a mint-filled primary action; on dark, hover brightens to #34d399 instead.
- **Accent Ink** (#04221a): the dark green ink that sits on mint fills. Mint cannot carry white text at this size.

### Secondary
- **Playhead Violet** (#6c55ff): the scrub cursor and its glow. Deliberately not mint — the cursor crosses mint clips and pills and needs a hue of its own to stay legible on both themes.
- **Record Red** (#ef4444): REC, cuts, skips, trims, transcript highlights and destructive actions. Red means something is being taken, recorded or is wrong.
- **Warn Amber** (#f59e0b): warnings and soft cautions that are neither destructive nor a primary action.

### Tertiary
- **Annotation Amber** (#eab308): annotation pills on the timeline.
- **Speed Orange** (#f97316): speed-ramp pills on the timeline.
- **Zoom Blue** (#3b82f6): zoom pills, so the common effect never reads as the clip underneath it.

### Neutral
- **Cool Slate** (#eaeef3): the light canvas behind the panels; the daylight desk.
- **Surface** (#ffffff): cards, dialogs and the panel faces on light.
- **Surface 1** (#f1f5f9): the low row and field bed; the mode-switch track.
- **Surface 2** (#e2e8f0): secondary pressed/hover fills and inline field beds.
- **Surface 3** (#cbd5e1): the selected segment, icon-button hover, strong dividers.
- **Ink** (#0f172a): primary text on light; **Ink 2** (#334155): labels and secondary copy.
- **Muted** (#64748b): values, hints and meta copy — never use mint for small text on light.
- **Border** (#e2e8f0), **Border Soft** (#e6eaef), **Border Hi** (#cbd5e1): the three line weights. Shell rules are darker than panel borders on light so they survive against white.
- **Dark Canvas** (#0a0d12) and **Dark Surface** (#14181f): the dark-theme equivalents; the dark surface steps run #14181f, #191d26, #1c2029, #252a35.

### Named Rules
**The One Signal Rule.** Signal Mint is used on ≤10% of any screen: the primary action, the selected state, the active clip. Its rarity is what makes it read as a signal.

**The Take Rule.** Red is reserved for REC, cuts, skips, trims, transcript highlights and destructive actions. It is never decoration, never a generic highlight, and never a second accent.

**The Playhead Rule.** The scrub cursor is Violet #6c55ff in both themes. Do not recolour it mint when the clip underneath is mint.

**The Token Swap Rule.** Components read the `--*` custom properties in `src/styles/design-tokens.css`; dark is a token swap on `:root[data-theme="dark"]`, not a second palette. Never hardcode a hue that a token already owns.

## Typography

**Display Font:** Geist (with system-ui, Segoe UI, sans-serif)
**Body Font:** Geist (with system-ui, Segoe UI, sans-serif)
**Label/Mono Font:** Geist Mono (with ui-monospace, SF Mono, Menlo, Consolas)

**Character:** Geist is the whole interface: compact, slightly technical, and quiet at 13px. Geist Mono is reserved for numbers, timecodes and technical readouts so figures line up and read as data rather than prose. Both are self-hosted so the editor starts offline.

### Hierarchy
- **Display** (600, 24px, 1.2): rare, for a first-run or dialog-scale statement; not for dense editor chrome.
- **Headline** (600, 20px, 1.3): dialog titles, e.g. the modal header.
- **Title** (600, 15px, 1.5, -0.015em): the product name and section-level anchors.
- **Body** (400, 13px, 1.5): the editor's working size; controls, rows, descriptions.
- **Label** (500, 13px, 1.3): field and slider labels in Ink 2; section labels step up to 600.
- **Mono** (400, 12px, 1.4): numeric values, timecodes and technical readouts; use tabular numerals where values change.

### Named Rules
**The Geist Rule.** The interface speaks Geist and nothing else; Geist Mono is a data voice, not a second UI face.

**The Tabular Rule.** Numeric values that update (timecodes, percentages, levels) use `font-variant-numeric: tabular-nums` so the layout does not twitch.

## Layout

A single-window desktop editor, not a responsive website. The shell is one column pinned to the window width (`minmax(0, 1fr)`), so a long timeline can never widen the grid and push the top-bar controls off-screen. The top bar doubles as the title bar at 34px; the body is a preview/timeline deck with a left rail/panel and a right inspector rail (320px; the deck caps the right side at `clamp(286px, 20vw, 352px)`); the timeline panel is 224px tall at rest. The shell padding and gaps are 14px.

The controls are 34px tall with 10px radii; rows use an 8px rhythm; panels use 16–24px internal padding. Density is compact but not cramped: 13px body text and 30–32px icon buttons. Responsive behaviour is a desktop-window concern: at widths 1240, 1080, 960, 850 and 760px the top bar tightens, its gaps shrink and the mode-switch labels ellipsise before any control clips a glyph.

## Elevation & Depth

The system is **flat at rest, with a soft lift**. Rows, fields and pane sections sit on the surface with no shadow; cards, popovers and dialogs alone carry a faint elevation, and the lift deepens only for a real z-layer (dialog over the editor). Depth is mostly tonal: the surface steps and 1px borders carry the hierarchy.

### Shadow Vocabulary
- **Card lift** (`--elev-card`): the default for cards and raised controls; a 1px ambient line plus a soft low shadow.
- **Card lift, soft** (`--elev-card-soft`): the quietest raised surface, for a card that sits inside another panel.
- **Popover lift** (`--elev-pop`): menus, popovers and the top-bar dropdown; more spread, still restrained.
- **Dialog lift** (`0 24px 60px rgba(22, 23, 29, 0.5)`): the modal card over a blurred backdrop, the one deliberately deep shadow.
- **Focus ring** (`--focus-ring`): a 3px mint-tinted ring, not a hard outline, plus the 2px accent `:focus-visible` outline used across the shell.

### Named Rules
**The Flat-At-Rest Rule.** A row is flat. Do not add a shadow to a row, a field or a pane section; reserve lift for cards, popovers and dialogs.

## Shapes

Form is softly technical: **4px** for tiny marks and reset chips, **8px** for icon buttons and small cards, **10px** for every standard control (buttons, fields, selects), **12px** for the mode-switch track, **16px** for dialog cards, **18px** for the large shell panels, and **9999px** for pills. Borders are 1px and mostly soft; the timeline and the dialog card are the only places with a heavier silhouette.

The radius grows with the surface, not with decoration: small marks stay nearly square, controls are gently rounded, and only dialogs and shell panels get the large corner. The timeline's clip cards and effect pills are the exception in form: candy-coloured cards with their own glow, deliberately more physical than the chrome around them.

### Named Rules
**The Soft Corner Rule.** Radius rises with surface: 4px mark → 10px control → 16px dialog → 18px shell panel. Do not put a 16px corner on a 34px control.

## Components

### Buttons
- **Shape:** 34px tall, 10px radius, 14px horizontal padding, 500 weight at 13px.
- **Primary:** Signal Mint fill with Accent Ink text; the hover is Signal Mint Deep.
- **Secondary:** a tinted ink wash (8% ink) with Ink text; hover deepens to 13%. No outline.
- **Ghost:** transparent at rest, Ink 2 text, 30px tall, 8px radius; hover adds Surface 1 and a border.
- **Icon:** 30–32px square, 8px radius, Muted glyph; hover Surface 3 and Ink. A toggled icon uses the mint-soft bed with mint ink.
- **Focus / Disabled:** a 2px Signal Mint outline offset 2px; disabled drops to 0.5 opacity and keeps its geometry. Transitions are 120ms with the house ease.

### Chips
- **Style:** pill radius, mint-soft bed (10% mint), Signal Mint text, 12px at 500 weight, 5px 10px; a 5px mint dot marks live state.
- **Timeline pills:** the same pill geometry carries the effect hues — Annotation Amber, Speed Orange, Zoom Blue — and the clip card itself is Signal Mint.

### Cards / Containers
- **Corner Style:** 16px for dialogs; 18px for the main shell panels.
- **Background:** Surface on light, Dark Surface on dark.
- **Shadow Strategy:** see Elevation — card lift only; no shadow on rows.
- **Border:** 1px Border; the shell's rules use the darker shell-rule tokens.
- **Internal Padding:** 20–24px for dialog heads/bodies; 16px for pane insets.

### Inputs / Fields
- **Style:** 34px tall, 10px radius, filled with a 7% ink mix over Surface 1, text at 13px Ink. No outline at rest; the border is transparent.
- **Focus:** the border becomes Signal Mint; keyboard focus also gets the mint focus ring. Invalid stays Record Red until corrected.
- **Disabled:** 0.5 opacity, not-allowed cursor. Textareas share the bed with 8px 10px padding and vertical resize.

### Navigation
- **Style:** a 34px top bar acting as the title bar; 24px brand mark and a 15px/600 wordmark; a three-segment mode switch on a Surface 1 track with a 12px radius, selected segment on Surface 3 at 600 weight; icon buttons at 32px and ghost buttons at 30px.
- **States:** hover is a Surface 2 or Surface 1 fill; the selected mode gets the strongest plate; disabled drops to 0.45 opacity.
- **Drag:** the top bar is an app drag region; every button, input and select inside it opts out. While a menu is open the whole bar stops being a drag region so outside clicks can close it.

### Signature: The Timeline
The timeline is the object the system is built around. Clips are mint candy cards with dark ink; zoom pills are blue, annotation pills amber, speed pills orange; the scrub playhead is violet with a soft glow. Clips and pills are physical enough to grab (6px handles) but stay in the same soft, flat language as the chrome. Red hatching marks removed content; a cut is a line, not a card.

## Do's and Don'ts

### Do:
- **Do** use the `--*` tokens from `src/styles/design-tokens.css` and let `:root[data-theme="dark"]` do the theme swap.
- **Do** keep Signal Mint rare: the primary action, the selected state, the active clip.
- **Do** use 34px controls, 10px radii and 13px body text for editor chrome.
- **Do** use Geist Mono with tabular numerals for timecodes and changing values.
- **Do** keep the scrub playhead violet in both themes.
- **Do** keep rows flat; save the soft lift for cards, popovers and dialogs.

### Don't:
- **Don't** use mint for small text on the light theme; it is not a readable body colour. Use Muted for values and meta copy.
- **Don't** use red for decoration or a second highlight; it means REC, a cut or an error.
- **Don't** recolour the playhead mint when the clip under it is mint.
- **Don't** add shadows to fields, rows or pane sections.
- **Don't** introduce a second accent hue for chrome; the timeline pill hues are data annotations, not a second brand.
- **Don't** hardcode a hex that a token already owns, and don't bypass the token layer for a dark-theme "fix".
