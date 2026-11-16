/**
 * The Viking edition's sounds: timber, water, iron and horn instead of
 * the standard game's beeps (cues.js). Same cue names, so every call
 * site plays the right one for the edition (soundManager.playSound),
 * plus cues only the Viking game has: a chess move set down, longship
 * events, the check alarm, a dissolving piece.
 *
 * Each cue is (s, t) => void, where `s` is the synth from synth.js and
 * `t` the start time. The music is in D dorian (D E F G A B C), the
 * old northern mode: a horn on D and A, the lyre on D, A, D', E'.
 */

const D3 = 146.83, F3 = 174.61, A3 = 220.0, D4 = 293.66, E4 = 329.63, A4 = 440.0, D5 = 587.33, E5 = 659.25;
const A2 = 110.0;

/** Wood on wood: a knock. */
function knock(s, t, { freq = 1800, gain = 0.16, body = 900 } = {}) {
	s.noise(t, { filter: 'bandpass', freq, q: 4, attack: 0.001, decay: 0.035, gain, reverb: 0.06 });
	s.tone(t, { freq: body, freqEnd: body * 0.8, type: 'sine', attack: 0.001, decay: 0.045, gain: gain * 0.5, reverb: 0.06 });
}

/** A heavy timber block set down. */
function thud(s, t, { freq = 120, gain = 0.5 } = {}) {
	s.tone(t, { freq, freqEnd: freq * 0.52, type: 'sine', attack: 0.002, decay: 0.17, gain, reverb: 0.12 });
	s.noise(t, { filter: 'lowpass', freq: 900, freqEnd: 260, attack: 0.002, decay: 0.09, gain: gain * 0.6, reverb: 0.12 });
	knock(s, t + 0.004, { freq: 1300, gain: gain * 0.25, body: freq * 4 });
}

/** Water: a splash, `big` from an oar's dip to a hull going down. */
function splash(s, t, { big = 0.3, gain = 0.3 } = {}) {
	s.noise(t, {
		filter: 'lowpass', freq: 1800 + 2200 * big, freqEnd: 350 - 150 * big,
		attack: 0.01, decay: 0.2 + 1.0 * big, gain, reverb: 0.25,
	});
	s.noise(t + 0.01, { filter: 'highpass', freq: 3500, attack: 0.005, decay: 0.08 + 0.2 * big, gain: gain * 0.25, reverb: 0.2 });
}

/** The ship's timbers and oarlocks: a groaning creak. */
function creak(s, t, { dur = 0.25, gain = 0.08, freq = 118 } = {}) {
	s.tone(t, {
		freq, freqEnd: freq * 0.9, type: 'sawtooth', attack: 0.05, hold: dur * 0.5, decay: dur * 0.5,
		gain, filterType: 'bandpass', filterFreq: 700, q: 6,
		vibrato: { rate: 19, cents: 45, delay: 0 }, reverb: 0.15,
	});
}

/** An oar stroke: the blade's swish through water, a drip, the oarlock. */
function oar(s, t, gain = 0.22) {
	s.noise(t, { filter: 'bandpass', freq: 950, freqEnd: 420, q: 0.8, attack: 0.07, decay: 0.24, gain, reverb: 0.25 });
	s.noise(t + 0.22, { filter: 'highpass', freq: 4200, attack: 0.002, decay: 0.05, gain: gain * 0.3, reverb: 0.25 });
	creak(s, t + 0.04, { dur: 0.2, gain: gain * 0.35 });
}

/** Iron on iron. */
function clash(s, t, { gain = 0.22, freq = 1240, pan = 0 } = {}) {
	s.bell(t, { freq, partials: [1, 1.47, 2.09, 2.56, 3.18], decay: 0.55, gain, reverb: 0.3, pan });
	s.noise(t, { filter: 'highpass', freq: 3000, attack: 0.001, decay: 0.08, gain: gain * 1.3, reverb: 0.25, pan });
	s.tone(t, { freq: 90, freqEnd: 50, type: 'sine', attack: 0.002, decay: 0.15, gain: gain * 1.5, reverb: 0.2 });
}

export const VIKING_CUES = {
	// A piece moved or turned: a small wooden knock.
	tick: (s, t) => knock(s, t, { gain: 0.12 }),

	// A piece locks into the land: timber laid down.
	drop: (s, t) => thud(s, t),

	// Hard drop: the swing, then the timber lands.
	hardDrop: (s, t) => {
		s.noise(t, { filter: 'bandpass', freq: 2600, freqEnd: 350, q: 1.2, attack: 0.02, decay: 0.15, gain: 0.22, reverb: 0.1 });
		thud(s, t + 0.13, { gain: 0.6, freq: 105 });
	},

	// A line cleared: two drum beats and the lyre rising.
	lineClear: (s, t) => {
		s.drum(t, { freq: 100, gain: 0.5 });
		s.drum(t + 0.13, { freq: 120, gain: 0.45 });
		[D4, A4, D5, E5].forEach((f, i) => s.pluck(t + 0.22 + i * 0.075, { freq: f, gain: 0.16, pan: -0.3 + i * 0.2 }));
	},

	// A piece taken: blades meet.
	capture: (s, t) => clash(s, t),

	// Refused: a dull double knock on a shut door.
	error: (s, t) => {
		s.tone(t, { freq: 180, freqEnd: 150, type: 'triangle', attack: 0.002, decay: 0.09, gain: 0.3, filterFreq: 900, reverb: 0.1 });
		s.tone(t + 0.11, { freq: 140, freqEnd: 118, type: 'triangle', attack: 0.002, decay: 0.12, gain: 0.3, filterFreq: 700, reverb: 0.1 });
	},

	// A bonus orb taken: a rune-stone's chime.
	orbClaim: (s, t) => {
		s.bell(t, { freq: 880, partials: [1, 2.0, 3.01, 4.2], decay: 1.2, gain: 0.16, reverb: 0.55 });
		s.bell(t + 0.12, { freq: 1318.5, partials: [1, 2.0, 3.01], decay: 1.4, gain: 0.13, reverb: 0.55 });
	},

	// A pawn promoted: a drum and a rising horn call.
	promotion: (s, t) => {
		s.drum(t, { freq: 90, gain: 0.45 });
		s.horn(t + 0.05, { freq: A3, dur: 0.32, gain: 0.24 });
		s.horn(t + 0.4, { freq: D4, dur: 0.65, gain: 0.26 });
	},

	// A king falls: the great horn and the war drum, long and low.
	kingFall: (s, t) => {
		s.drum(t, { freq: 62, freqEnd: 34, decay: 1.2, gain: 0.75, reverb: 0.5 });
		s.horn(t + 0.05, { freq: D3, dur: 1.5, gain: 0.3, bend: -160, reverb: 0.7 });
		s.horn(t + 0.05, { freq: A2, dur: 1.5, gain: 0.2, bend: -160, reverb: 0.7, bright: 4 });
		s.drum(t + 0.55, { freq: 58, freqEnd: 32, decay: 1.0, gain: 0.6, reverb: 0.5 });
	},

	// Check: two short, urgent horn blasts.
	alert: (s, t) => {
		s.horn(t, { freq: D4, dur: 0.18, gain: 0.26, release: 0.12, reverb: 0.35 });
		s.horn(t + 0.27, { freq: D4, dur: 0.24, gain: 0.28, release: 0.15, reverb: 0.35 });
	},

	// A piece crumbles away: a rumble.
	explosion: (s, t) => {
		s.noise(t, { filter: 'lowpass', freq: 1200, freqEnd: 150, attack: 0.01, decay: 0.7, gain: 0.45, reverb: 0.3 });
		s.tone(t, { freq: 70, freqEnd: 30, type: 'sine', attack: 0.003, decay: 0.5, gain: 0.5, reverb: 0.2 });
	},

	// A chess piece set down on its new square.
	move: (s, t) => {
		s.tone(t, { freq: 210, freqEnd: 150, type: 'sine', attack: 0.002, decay: 0.08, gain: 0.3, reverb: 0.08 });
		knock(s, t, { freq: 1600, gain: 0.14, body: 640 });
	},

	/* ---- longships ---- */

	// Under way: three oar strokes.
	shipSail: (s, t) => { oar(s, t); oar(s, t + 0.38, 0.2); oar(s, t + 0.76, 0.18); },

	// A warrior steps aboard: a foot on the deck, the hull answers.
	shipEmbark: (s, t) => { thud(s, t, { freq: 150, gain: 0.4 }); creak(s, t + 0.06, { dur: 0.35, gain: 0.07 }); },

	// Ashore: a splash in the shallows and a footfall.
	shipLand: (s, t) => { splash(s, t, { big: 0.1, gain: 0.22 }); thud(s, t + 0.15, { freq: 160, gain: 0.3 }); },

	// A raid: the war horn, the drums.
	shipRaid: (s, t) => {
		s.horn(t, { freq: D3, dur: 0.45, gain: 0.28, reverb: 0.55 });
		s.horn(t + 0.5, { freq: F3, dur: 0.7, gain: 0.3, reverb: 0.55 });
		[0, 0.18, 0.36].forEach((d, i) => s.drum(t + 0.5 + d, { freq: 85 + i * 6, gain: 0.45 }));
	},

	// A ship taken: blades, and a short horn for the new masters.
	shipSeized: (s, t) => { clash(s, t); s.horn(t + 0.25, { freq: A3, dur: 0.4, gain: 0.22 }); },

	// A ship lost to the sea: the plunge, the boom, the bubbles.
	shipSunk: (s, t) => {
		splash(s, t, { big: 1, gain: 0.5 });
		s.tone(t, { freq: 80, freqEnd: 38, type: 'sine', attack: 0.01, decay: 0.6, gain: 0.45, reverb: 0.4 });
		for (let i = 0; i < 9; i++) {
			const f = 350 + Math.random() * 550;
			s.tone(t + 0.4 + i * 0.13 + Math.random() * 0.08, {
				freq: f, freqEnd: f * 1.6, type: 'sine', attack: 0.003, decay: 0.06, gain: 0.07, reverb: 0.3,
			});
		}
	},

	// A ship launched: the hull meets the water, a horn calls the crew.
	shipLaunched: (s, t) => { splash(s, t, { big: 0.45, gain: 0.35 }); s.horn(t + 0.25, { freq: D4, dur: 0.6, gain: 0.22 }); },

	// A ship built at the mooring: hammer blows.
	shipBuilt: (s, t) => {
		for (const d of [0, 0.22, 0.44]) {
			s.tone(t + d, { freq: 430, freqEnd: 380, type: 'sine', attack: 0.001, decay: 0.07, gain: 0.25, reverb: 0.2 });
			s.noise(t + d, { filter: 'bandpass', freq: 2600, q: 3, attack: 0.001, decay: 0.025, gain: 0.2, reverb: 0.2 });
		}
	},

	// A raider's time ran out: a falling horn.
	raidLost: (s, t) => s.horn(t, { freq: A3, dur: 0.9, gain: 0.24, bend: -500, reverb: 0.55 }),

	// A ship hemmed in by land: the timbers groan and crack.
	shipTrapped: (s, t) => {
		creak(s, t, { dur: 0.8, gain: 0.1, freq: 95 });
		for (const d of [0.25, 0.4, 0.55]) {
			s.noise(t + d, { filter: 'lowpass', freq: 900, attack: 0.002, decay: 0.08, gain: 0.3, reverb: 0.2 });
		}
	},
};

/** Which longship cue a `tetches:ship` detail kind plays (null: none). */
export const SHIP_KIND_CUES = Object.freeze({
	sailed: 'shipSail',
	embark: 'shipEmbark',
	land: 'shipLand',
	raid: 'shipRaid',
	boarded: 'shipSeized',
	seize: 'shipSeized',
	seized: 'shipSeized',
	sunk: 'shipSunk',
	lost: 'shipSunk',
	launched: 'shipLaunched',
	built: 'shipBuilt',
	raid_lost: 'raidLost',
	trapped: 'shipTrapped',
});
