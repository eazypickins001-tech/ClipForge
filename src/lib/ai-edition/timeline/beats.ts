// Beat/onset detection from the same min/max peaks the waveform already decodes.
//
// `getAudioPeaks` gives `[min, max]` pairs at up to 200 blocks/second (5 ms) from a 16 kHz mono
// mixdown — a ready-made amplitude envelope with no second decode. The detector is pure so it can
// be tested against a synthetic click track and run in the renderer without a worker.
//
// Rules:
// - novelty is the positive rise of the envelope over ~20 ms, so a sustained note does not mark
//   every block;
// - a peak must clear a LOCAL mean + std threshold, so a quiet intro still gets beats;
// - a refractory gap (default 180 ms ≈ 333 BPM ceiling) stops one transient from firing twice and
//   stops a fast hi-hat from becoming the tempo;
// - BPM is the median inter-onset interval, so a missed beat does not double the estimate.

export interface BeatDetection {
	/** Onset times in SOURCE seconds of the analysed file, ascending. */
	beats: number[];
	/** Median tempo, or null with too few beats to estimate one. */
	bpm: number | null;
}

export interface BeatOptions {
	/** Minimum gap between accepted onsets, seconds. */
	minGapSec?: number;
	/** How many standard deviations above the local mean a peak must sit. */
	sensitivity?: number;
}

const NEGATIVE_INFINITY = Number.NEGATIVE_INFINITY;

export function detectBeats(
	peaks: Float32Array,
	durationSec: number,
	options: BeatOptions = {},
): BeatDetection {
	const blocks = Math.floor(peaks.length / 2);
	if (blocks < 8 || !(durationSec > 0)) return { beats: [], bpm: null };

	const stepSec = durationSec / blocks;
	const envelope = new Float32Array(blocks);
	for (let i = 0; i < blocks; i++) {
		envelope[i] = Math.max(Math.abs(peaks[i * 2]), Math.abs(peaks[i * 2 + 1]));
	}

	// Rise over ~20 ms: the attack of a transient, not its body.
	const lag = Math.max(1, Math.round(0.02 / stepSec));
	const novelty = new Float32Array(blocks);
	for (let i = lag; i < blocks; i++) {
		novelty[i] = Math.max(0, envelope[i] - envelope[i - lag]);
	}

	const halfWindow = Math.max(4, Math.round(0.5 / stepSec));
	const minGap = Math.max(1, Math.round((options.minGapSec ?? 0.18) / stepSec));
	const sensitivity = options.sensitivity ?? 1.2;
	const absoluteFloor = 0.02;

	const beats: number[] = [];
	let lastAccepted = NEGATIVE_INFINITY;
	for (let i = 0; i < blocks; i++) {
		const value = novelty[i];
		if (value <= absoluteFloor) continue;

		let sum = 0;
		let sumSquares = 0;
		let count = 0;
		const from = Math.max(0, i - halfWindow);
		const to = Math.min(blocks - 1, i + halfWindow);
		for (let j = from; j <= to; j++) {
			sum += novelty[j];
			sumSquares += novelty[j] * novelty[j];
			count++;
		}
		const mean = sum / count;
		const std = Math.sqrt(Math.max(0, sumSquares / count - mean * mean));
		if (value < mean + sensitivity * std) continue;

		// Local maximum inside the refractory window: a shoulder of the same hit is not a beat.
		let strongest = true;
		for (let j = Math.max(0, i - minGap); j <= Math.min(blocks - 1, i + minGap); j++) {
			if (j !== i && novelty[j] > value) {
				strongest = false;
				break;
			}
		}
		if (!strongest) continue;

		const time = i * stepSec;
		if (time - lastAccepted < minGap * stepSec) continue;
		lastAccepted = time;
		beats.push(time);
	}

	let bpm: number | null = null;
	if (beats.length >= 3) {
		const intervals: number[] = [];
		for (let i = 1; i < beats.length; i++) {
			const interval = beats[i] - beats[i - 1];
			if (interval > 0.2 && interval < 2) intervals.push(interval);
		}
		intervals.sort((a, b) => a - b);
		const median = intervals[Math.floor(intervals.length / 2)];
		if (median) bpm = Math.round(60 / median);
	}

	return { beats, bpm };
}

/** The audio track's placement on the ruler, in seconds, and the source window it plays. */
export interface BeatTrackWindow {
	startSec: number;
	endSec: number;
	offsetSec: number;
}

export interface BeatClipWindow {
	timelineStartSec: number;
	timelineEndSec: number;
	sourceStartSec: number;
	sourceEndSec: number;
}

/** Closer to an edge than this and `splitClip` would reject the cut anyway (its MIN_SPLIT_SEC). */
const EDGE_MARGIN_SEC = 0.08;

/**
 * The SOURCE timecodes at which one clip should be cut to land on the music's beats.
 *
 * The track's beat times are in the file's own clock, so they move by the track's placement and
 * `offsetSec` before they are compared with the clip's ruler span. Only beats inside both the track
 * window and the clip are kept, and the edges are excluded because a cut there is a no-op.
 */
export function beatsForClip(
	beats: readonly number[],
	track: BeatTrackWindow,
	clip: BeatClipWindow,
): number[] {
	const from = Math.max(track.startSec, clip.timelineStartSec);
	const to = Math.min(track.endSec, clip.timelineEndSec);
	const sourceTimes = new Set<number>();
	for (const beat of beats) {
		const timelineSec = track.startSec + (beat - track.offsetSec);
		if (timelineSec < from || timelineSec > to) continue;
		const sourceSec = clip.sourceStartSec + (timelineSec - clip.timelineStartSec);
		if (
			sourceSec <= clip.sourceStartSec + EDGE_MARGIN_SEC ||
			sourceSec >= clip.sourceEndSec - EDGE_MARGIN_SEC
		) {
			continue;
		}
		// The split helper takes source seconds; two beats rounding to the same cut are one cut.
		sourceTimes.add(Math.round(sourceSec * 1000) / 1000);
	}
	return [...sourceTimes].sort((a, b) => a - b);
}
