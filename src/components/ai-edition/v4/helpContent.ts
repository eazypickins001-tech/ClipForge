// The in-app help content. It mirrors the product: short, task-oriented steps for the surfaces a
// user actually meets, with the exact command names from the UI.
//
// The bodies are English-first. The menu label, modal title and topic titles are i18n keys so the
// navigation localises; translating the long bodies is a follow-up, not a reason to hide the help.

export type HelpTopicId = "start" | "record" | "edit" | "export" | "ai" | "studio" | "shortcuts";

export interface HelpTopic {
	id: HelpTopicId;
	/** `editor` keys by default; the shortcuts topic lives in the `shortcuts` namespace. */
	namespace: "editor" | "shortcuts";
	titleKey: string;
	body: string[];
}

export const HELP_TOPICS: readonly HelpTopic[] = [
	{
		id: "start",
		namespace: "editor",
		titleKey: "help.gettingStarted",
		body: [
			"Open a project from the ClipForge menu, or import a recording from the Media panel.",
			"Media imports footage, Edit is the timeline, and Rec starts a new recording.",
			"The dot beside the project name shows unsaved changes. Ctrl/Cmd+S saves.",
			"Export from the top bar when the timeline is ready.",
		],
	},
	{
		id: "record",
		namespace: "editor",
		titleKey: "help.recording",
		body: [
			"Open Rec mode or the recorder HUD and choose a screen or window, a camera and a microphone.",
			"System audio and the camera are separate toggles; the gear picks the camera and microphone.",
			"Stop from the HUD or the tray. The take opens in the editor, with auto-zoom on by default.",
			"Recordings stay in your recordings folder. ClipForge does not upload them.",
		],
	},
	{
		id: "edit",
		namespace: "editor",
		titleKey: "help.editing",
		body: [
			"Drag clips on the timeline; the playhead decides where an action lands.",
			"Split at the playhead with Ctrl/Cmd+B, the rail's Slice button, or Clip → Split.",
			"Trim a clip's edges in Edit clip; a cut inside a clip is a non-destructive trim.",
			"Click the +/◑ button on a junction for a transition; Clip → Fade out ending fades the programme.",
			"Clip → Cut to the beat splits the clip under the playhead on the first music track's beats. Add a music track first.",
			"Zooms, annotations and speed pills live in the inspector. The Effects pane holds the colour grade (twelve presets plus five sliders) and the vignette.",
			"Camera background can target the camera OR the primary video: pick Cutout, Blur or Custom, then Apply to → Primary video. Cut out, blur or replace that layer's background.",
			"The clip rail's Opacity button fades a clip over time: set the slider, then Add keyframe at the playhead. Each key has an easing menu (four presets or a custom curve) and a position you can edit; → jumps the playhead to it; Clear removes the animation.",
			"Audio's Volume panel has the clip level, mute and fades, plus Volume over time — a keyframed envelope on top of the level.",
			"Remove filler words and silences from the Transcript menu.",
		],
	},
	{
		id: "export",
		namespace: "editor",
		titleKey: "topbar.export",
		body: [
			"Export opens the dialog: pick MP4 or GIF, a quality and a destination.",
			"Export renders the edited timeline. It can be cancelled and retried.",
			"Missing media is reported in the preview before an export; use Locate file to relink it.",
		],
	},
	{
		id: "ai",
		namespace: "editor",
		titleKey: "help.ai",
		body: [
			"Chat is optional. Add an OpenRouter (or another provider) key in AI settings.",
			"Ask for edits in plain language: the agent uses the same document tools as the UI, and each turn is undoable.",
			"Scene detection, Automatic zooms, Auto-reframe and script-to-video are available as agent tools.",
			"Core editing stays local; only a request that uses AI reaches a provider.",
		],
	},
	{
		id: "studio",
		namespace: "editor",
		titleKey: "inspector.thumbnailStudio",
		body: [
			"Clip → Thumbnail Studio, or the ClipForge menu → Thumbnail Studio. Every field has a hint; only the title is required.",
			"Generate prompts writes ONE prompt grounded in the video: it quotes the transcript's opening, names the subjects and numbers the evidence states, and fits the platform's format and safe areas.",
			"Copy prompt and paste it into any image tool (ChatGPT, Gemini, Midjourney…). The Studio calls no provider — no key, no credits, no spend.",
			"The 1280×720 editor composes the headline, outline, colours, logo and background; export it as PNG or JPEG. Save to project keeps the prompt and the composition.",
		],
	},
	{
		id: "shortcuts",
		namespace: "shortcuts",
		titleKey: "title",
		body: [
			"Ctrl/Cmd+S save · Ctrl/Cmd+Z undo · Ctrl/Cmd+Shift+Z redo",
			"Ctrl/Cmd+B split · Ctrl/Cmd+Shift+O bring ClipForge to the front",
			"Use Ctrl/Cmd+N / Ctrl/Cmd+O for a new project / open project.",
			"The full list is in the ClipForge menu → Keyboard shortcuts.",
		],
	},
];
