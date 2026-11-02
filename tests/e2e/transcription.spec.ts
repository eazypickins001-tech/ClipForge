// Proves the audio actually reaches a transcript, which is the half that
// "whisper-stt-server is packaged" does not prove: the helper can boot and load its
// model while every transcribe call still fails.
//
// The fixture is synthetic speech with no human in it:
//
//   Add-Type -AssemblyName System.Speech
//   $s = New-Object System.Speech.Synthesis.SpeechSynthesizer
//   $s.Rate = -1
//   $s.SetOutputToWaveFile("speech.wav")
//   $s.Speak("The quick brown fox jumps over the lazy dog. Clip Forge transcribes this recording locally on this machine.")
//
// then muxed over a black 640x480 30 fps video with the app's own bundled FFmpeg
// (`-c:v libopenh264 -c:a aac`, 8.3 s, ~93 KB). Regenerate it the same way; the
// assertion below only relies on "quick brown fox", not on exact punctuation.
//
// The assertion is made against the SAVED PROJECT rather than the UI, for the same
// reason phase1-acceptance reads its trim back through the dialog: the transcript is
// part of the document (`transcript.segments[].text`), so a file on disk that carries
// the expected words proves audio → whisper → document → save without depending on any
// pane being open.
//
// Needs a built app: `dist-electron/main.js`, or CLIPFORGE_APP_EXE for the packaged
// build. The first run downloads ggml-small-q8_0 (~264 MB) into the app's userData, so
// this spec needs network the first time and is slower than the others.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { closeApp, FIXTURES_DIR, launchApp, openEditorWithRecording } from "./harness";

const FIXTURE = path.join(FIXTURES_DIR, "speech-sample.mp4");

interface Segment {
	kind?: string;
	startSec?: number;
	endSec?: number;
	text?: string;
}

interface Transcript {
	language?: string;
	segments?: Segment[];
}

interface ProjDoc {
	transcript?: Transcript | null;
	transcripts?: Transcript[] | null;
}

// Every project document currently on disk. Reads are best-effort: the writer renames
// into place, so a read can still land on a partially written file.
function savedDocs(projectsDir: string): ProjDoc[] {
	let names: string[];
	try {
		names = fs.readdirSync(projectsDir);
	} catch {
		return [];
	}
	const docs: ProjDoc[] = [];
	for (const name of names) {
		if (!name.endsWith(".openscreen")) continue;
		try {
			docs.push(JSON.parse(fs.readFileSync(path.join(projectsDir, name), "utf8")) as ProjDoc);
		} catch {
			// A write in progress; the poll below will try again.
		}
	}
	return docs;
}

function transcriptsOf(docs: ProjDoc[]): Transcript[] {
	const found: Transcript[] = [];
	for (const doc of docs) {
		if (doc.transcript) found.push(doc.transcript);
		for (const transcript of doc.transcripts ?? []) {
			if (transcript) found.push(transcript);
		}
	}
	return found;
}

function speechTextOf(docs: ProjDoc[]): string {
	return transcriptsOf(docs)
		.flatMap((transcript) => transcript.segments ?? [])
		.filter((segment) => segment.kind === "speech" && segment.text)
		.map((segment) => segment.text as string)
		.join(" ")
		.trim();
}

test("transcribes a recording's speech into the saved project", async () => {
	// A ~264 MB model download on the first run, then CPU inference on 8 s of audio.
	test.setTimeout(600_000);

	const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "clipforge-transcribe-user-"));
	const appTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "clipforge-transcribe-tmp-"));
	const projectsDir = path.join(userDataDir, "projects");

	const app = await launchApp(userDataDir, appTmpDir);
	try {
		const recordingsDir = path.join(
			await app.evaluate(({ app: electronApp }) => electronApp.getPath("userData")),
			"recordings",
		);
		fs.mkdirSync(recordingsDir, { recursive: true });
		const recordingPath = path.join(recordingsDir, "transcription-sample.mp4");
		fs.copyFileSync(FIXTURE, recordingPath);

		const editor = await openEditorWithRecording(app, recordingPath);
		// The editor imports the recording on mount; transcription is kicked off from there.
		await expect(editor.locator("[data-clip-id]")).toHaveCount(1, { timeout: 60_000 });

		await expect
			.poll(() => speechTextOf(savedDocs(projectsDir)), {
				message: "no speech transcript ever reached the saved project",
				timeout: 420_000,
				intervals: [1_000, 2_000, 5_000],
			})
			.toMatch(/quick\s+brown\s+fox/i);

		// The words being right is not enough: a transcript with no usable timings is
		// not a caption source. Check the shape the caption pipeline actually consumes.
		const [transcript] = transcriptsOf(savedDocs(projectsDir));
		expect(transcript?.language, "transcript carries no language").toBeTruthy();
		const speech = (transcript?.segments ?? []).filter((segment) => segment.kind === "speech");
		expect(speech.length, "no speech segments in the transcript").toBeGreaterThan(0);
		for (const segment of speech) {
			expect(segment.endSec).toBeGreaterThanOrEqual(segment.startSec as number);
			expect(segment.startSec).toBeGreaterThanOrEqual(0);
			expect(segment.endSec).toBeLessThanOrEqual(60);
		}
	} finally {
		await closeApp(app);
	}
});
