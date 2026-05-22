/**
 * Sound cue catalogue.
 *
 * Each entry is one of:
 *   • An object — single note (see soundManager.scheduleNote).
 *   • An array of note objects — played in sequence.
 *   • A function ({ ctx, masterGain, startTime, scheduleNote,
 *     scheduleSequence }) — for cues that need layered or pitched
 *     control beyond the ADSR envelope.
 *
 * The catalogue is intentionally small (six cues). Each lasts <1s
 * so multiple events stacked on top of each other don't muddy the
 * mix.
 *
 * The "design" here is the same school of synthesised SFX as the
 * Tetris series: pure waves, fast envelopes, recognisable contour.
 * If you want to swap to recorded assets, add a "src" string to the
 * cue and extend `soundManager.playSound` to fetch via a buffer
 * source — kept on the to-do list.
 */

const A4 = 440;
const semitone = n => A4 * Math.pow(2, n / 12);

export const SOUND_CUES = {
	// A tetromino has just locked into place. Short, dry thunk.
	drop: {
		freq: semitone(-12), // A3
		type: 'triangle',
		attack: 0.002,
		decay: 0.05,
		sustain: 0.2,
		sustainTime: 0.04,
		release: 0.08,
		gain: 0.35,
		pitchSweep: -200,
	},

	// A row was cleared — short ascending arpeggio.
	lineClear: [
		{ freq: semitone(0),  type: 'square', attack: 0.005, decay: 0.04, sustain: 0.4, sustainTime: 0.05, release: 0.08, gain: 0.3 },
		{ freq: semitone(4),  type: 'square', attack: 0.005, decay: 0.04, sustain: 0.4, sustainTime: 0.05, release: 0.08, gain: 0.3 },
		{ freq: semitone(7),  type: 'square', attack: 0.005, decay: 0.04, sustain: 0.4, sustainTime: 0.05, release: 0.10, gain: 0.3 },
		{ freq: semitone(12), type: 'square', attack: 0.005, decay: 0.04, sustain: 0.5, sustainTime: 0.06, release: 0.15, gain: 0.35 },
	],

	// Captured an enemy piece — meaty bass thud + dissonant blip.
	capture: ({ ctx, scheduleNote, startTime }) => {
		scheduleNote({
			freq: semitone(-19), // E2
			type: 'sawtooth',
			attack: 0.002,
			decay: 0.06,
			sustain: 0.3,
			sustainTime: 0.08,
			release: 0.12,
			gain: 0.45,
			pitchSweep: -300,
		}, startTime);
		// Layered "hit" — high noise-ish blip a beat later.
		scheduleNote({
			freq: semitone(8),
			type: 'square',
			attack: 0.001,
			decay: 0.02,
			sustain: 0.1,
			sustainTime: 0.02,
			release: 0.05,
			gain: 0.2,
		}, startTime + 0.04);
	},

	// Power-up orb claimed — bright two-note flourish.
	orbClaim: [
		{ freq: semitone(7),  type: 'triangle', attack: 0.003, decay: 0.04, sustain: 0.5, sustainTime: 0.05, release: 0.08, gain: 0.32 },
		{ freq: semitone(14), type: 'triangle', attack: 0.003, decay: 0.04, sustain: 0.5, sustainTime: 0.06, release: 0.10, gain: 0.32 },
		{ freq: semitone(19), type: 'sine',     attack: 0.005, decay: 0.06, sustain: 0.5, sustainTime: 0.10, release: 0.20, gain: 0.30 },
	],

	// Pawn promoted to credit — celebratory rising sweep.
	promotion: ({ ctx, scheduleNote, startTime }) => {
		scheduleNote({
			freq: semitone(0),
			type: 'triangle',
			attack: 0.01,
			decay: 0.08,
			sustain: 0.6,
			sustainTime: 0.18,
			release: 0.20,
			gain: 0.35,
			pitchSweep: 1200, // octave up over the duration
		}, startTime);
		// Sparkle layer.
		scheduleNote({
			freq: semitone(12),
			type: 'sine',
			attack: 0.02,
			decay: 0.06,
			sustain: 0.4,
			sustainTime: 0.14,
			release: 0.18,
			gain: 0.18,
			pitchSweep: 700,
		}, startTime + 0.05);
	},

	// Invalid move / rejected action — short downward two-tone blat.
	error: [
		{ freq: semitone(-2), type: 'square', attack: 0.001, decay: 0.02, sustain: 0.3, sustainTime: 0.04, release: 0.05, gain: 0.25 },
		{ freq: semitone(-6), type: 'square', attack: 0.001, decay: 0.02, sustain: 0.2, sustainTime: 0.04, release: 0.08, gain: 0.25 },
	],

	// Tetromino selection / rotation — tiny click.
	tick: {
		freq: semitone(19),
		type: 'square',
		attack: 0.001,
		decay: 0.01,
		sustain: 0.0,
		sustainTime: 0.0,
		release: 0.02,
		gain: 0.15,
	},

	// Hard drop — descending whoosh.
	hardDrop: ({ ctx, scheduleNote, startTime }) => {
		scheduleNote({
			freq: semitone(7),
			type: 'sawtooth',
			attack: 0.002,
			decay: 0.05,
			sustain: 0.4,
			sustainTime: 0.06,
			release: 0.08,
			gain: 0.28,
			pitchSweep: -1800,
		}, startTime);
	},

	// King captured — long, descending, ominous.
	kingFall: ({ ctx, scheduleNote, startTime }) => {
		scheduleNote({
			freq: semitone(-12),
			type: 'sawtooth',
			attack: 0.02,
			decay: 0.15,
			sustain: 0.5,
			sustainTime: 0.25,
			release: 0.4,
			gain: 0.4,
			pitchSweep: -700,
		}, startTime);
		scheduleNote({
			freq: semitone(-7),
			type: 'triangle',
			attack: 0.03,
			decay: 0.12,
			sustain: 0.4,
			sustainTime: 0.22,
			release: 0.35,
			gain: 0.3,
			pitchSweep: -700,
		}, startTime + 0.05);
	},
};
