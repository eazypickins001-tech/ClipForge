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
			"Zooms, annotations, speed pills and the colour grade live in the inspector and the Effects pane.",
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
			"Clip → Thumbnail Studio. Fill the title, brief, audience, platform, brand kit and exclusions.",
			"Generate prompts produces three thumbnail concepts and the publishing title, description and tags.",
			"Generate image calls OpenRouter with your key and shows the actual cost; Save image writes the file.",
			"The 1280×720 editor composes the headline, outline, colours, logo and background; export it as PNG or JPEG.",
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
