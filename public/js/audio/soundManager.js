/**
 * Sound manager — minimal, deps-free, procedural.
 *
 * Why procedural and not real audio files: nothing to license,
 * nothing to bundle, zero extra HTTP requests, works offline, and
 * sounds can be tuned in real time. The trade-off is the cues are
 * "Mario-school" beeps rather than orchestral hits, which actually
 * fits the chess-meets-Tetris aesthetic.
 *
 * Each cue is a tiny ADSR envelope on top of one or two oscillators.
 * Cues live in `./cues.js` so the actual sound design is data, not
 * code, and easy to iterate on.
 *
 * API surface (kept small on purpose):
 *   • initSoundManager()       — lazily creates the AudioContext.
 *   • playSound(cueName)       — fire-and-forget. Cheap; honours mute.
 *   • setMuted(boolean)        — persists to localStorage.
 *   • isMuted()
 *   • toggleMuted()            — returns the new state.
 *
 * The AudioContext is created on the first user gesture (browsers
 * forbid creating it before that). Calls before that are buffered
 * to a no-op rather than throwing.
 */

import { SOUND_CUES } from './cues.js';

const MUTE_STORAGE_KEY = 'tetches.audio.muted';
const VOLUME_STORAGE_KEY = 'tetches.audio.volume';

let _audioContext = null;
let _masterGain = null;
let _muted = false;
let _volume = 0.6;
let _initAttempted = false;

function loadPreferences() {
	try {
		const m = localStorage.getItem(MUTE_STORAGE_KEY);
		if (m !== null) _muted = m === '1';
		const v = parseFloat(localStorage.getItem(VOLUME_STORAGE_KEY));
		if (Number.isFinite(v) && v >= 0 && v <= 1) _volume = v;
	} catch (_e) { /* localStorage unavailable */ }
}

function savePreferences() {
	try {
		localStorage.setItem(MUTE_STORAGE_KEY, _muted ? '1' : '0');
		localStorage.setItem(VOLUME_STORAGE_KEY, String(_volume));
	} catch (_e) { /* ignored */ }
}

/**
 * Lazily build the AudioContext + master gain. Safe to call many
 * times. Returns null if the browser refuses (most commonly because
 * we're called before any user gesture).
 */
export function initSoundManager() {
	if (_audioContext) return _audioContext;
	if (_initAttempted && !_audioContext) return null;
	_initAttempted = true;
	loadPreferences();
	try {
		const AC = window.AudioContext || window.webkitAudioContext;
		if (!AC) return null;
		_audioContext = new AC();
		_masterGain = _audioContext.createGain();
		_masterGain.gain.value = _muted ? 0 : _volume;
		_masterGain.connect(_audioContext.destination);
	} catch (err) {
		console.warn('[soundManager] AudioContext init failed:', err.message);
		_audioContext = null;
	}
	return _audioContext;
}

/**
 * Some browsers freeze a "suspended" context until a user gesture
 * resumes it. Touching mouse / keyboard kicks it back to life.
 */
function ensureRunning() {
	if (!_audioContext) initSoundManager();
	if (_audioContext && _audioContext.state === 'suspended') {
		_audioContext.resume().catch(() => { /* ignore */ });
	}
	return _audioContext;
}

function applyGain() {
	if (_masterGain) _masterGain.gain.value = _muted ? 0 : _volume;
}

export function setMuted(value) {
	_muted = !!value;
	applyGain();
	savePreferences();
}

export function isMuted() {
	return _muted;
}

export function toggleMuted() {
	setMuted(!_muted);
	return _muted;
}

export function setVolume(value) {
	const v = Number(value);
	if (!Number.isFinite(v)) return;
	_volume = Math.min(1, Math.max(0, v));
	applyGain();
	savePreferences();
}

export function getVolume() {
	return _volume;
}

/**
 * Build a single tone with the given ADSR envelope. The caller may
 * issue several of these back-to-back to form a chord or a sequence.
 *
 * @param {Object} note
 * @param {number} note.freq        Hz
 * @param {string} [note.type]      'sine'|'square'|'triangle'|'sawtooth'
 * @param {number} [note.attack]    seconds
 * @param {number} [note.decay]     seconds
 * @param {number} [note.sustain]   0..1
 * @param {number} [note.release]   seconds
 * @param {number} [note.gain]      peak gain 0..1
 * @param {number} [note.detune]    cents
 * @param {number} [note.pitchSweep] cents to drift over the duration
 * @param {number} startTime        AudioContext time
 * @returns {number} the time the note finishes
 */
function scheduleNote(note, startTime) {
	if (!_audioContext || !_masterGain) return startTime;
	const ctx = _audioContext;

	const osc = ctx.createOscillator();
	osc.type = note.type || 'sine';
	osc.frequency.value = note.freq;
	if (Number.isFinite(note.detune)) osc.detune.value = note.detune;
	if (Number.isFinite(note.pitchSweep) && note.pitchSweep !== 0) {
		// Linear cents ramp over attack+decay+sustain duration.
		const rampEnd = startTime + (note.attack || 0.01) + (note.decay || 0.05) + (note.sustainTime || 0.1);
		osc.detune.linearRampToValueAtTime(note.pitchSweep, rampEnd);
	}

	const gain = ctx.createGain();
	const peak = (note.gain ?? 0.4) * 0.9;
	const attack = note.attack ?? 0.005;
	const decay = note.decay ?? 0.04;
	const sustain = note.sustain ?? 0.5;
	const sustainTime = note.sustainTime ?? 0.08;
	const release = note.release ?? 0.12;

	gain.gain.setValueAtTime(0, startTime);
	gain.gain.linearRampToValueAtTime(peak, startTime + attack);
	gain.gain.linearRampToValueAtTime(peak * sustain, startTime + attack + decay);
	gain.gain.setValueAtTime(peak * sustain, startTime + attack + decay + sustainTime);
	gain.gain.linearRampToValueAtTime(0, startTime + attack + decay + sustainTime + release);

	osc.connect(gain);
	gain.connect(_masterGain);

	const endTime = startTime + attack + decay + sustainTime + release + 0.02;
	osc.start(startTime);
	osc.stop(endTime);
	return endTime;
}

/**
 * Schedule a sequence of notes one after another. Each note's
 * timing is relative to the previous one's end. Returns the time
 * the whole sequence ends.
 */
function scheduleSequence(notes, startTime, gap = 0) {
	let cursor = startTime;
	for (const note of notes) {
		const end = scheduleNote(note, cursor);
		cursor = end + gap;
	}
	return cursor;
}

/**
 * Play a named cue. Looks the cue up in SOUND_CUES; cues are either
 * a single note object, an array of notes (played in sequence), or
 * a function that takes the audio context's current time and
 * schedules its own notes (for cues that need parallel layers or
 * frequency sweeps too complex for the ADSR envelope).
 *
 * @param {string} cueName
 * @param {Object} [opts]
 * @param {number} [opts.gain] - Multiplies the cue's natural gain.
 */
export function playSound(cueName, opts = {}) {
	if (_muted) return;
	const cue = SOUND_CUES[cueName];
	if (!cue) {
		console.warn('[soundManager] Unknown cue:', cueName);
		return;
	}
	const ctx = ensureRunning();
	if (!ctx) return;
	const start = ctx.currentTime + 0.01;

	if (typeof cue === 'function') {
		try {
			cue({ ctx, masterGain: _masterGain, startTime: start, scheduleNote, scheduleSequence, opts });
		} catch (err) {
			console.warn('[soundManager] Cue function threw:', err.message);
		}
		return;
	}

	const notes = Array.isArray(cue) ? cue : [cue];
	// Apply optional gain multiplier without mutating the cue source.
	if (Number.isFinite(opts.gain) && opts.gain !== 1) {
		const scaled = notes.map(n => ({ ...n, gain: (n.gain ?? 0.4) * opts.gain }));
		scheduleSequence(scaled, start, cue.gap || 0);
	} else {
		scheduleSequence(notes, start, cue.gap || 0);
	}
}

// Initialise eagerly so localStorage preferences are loaded. The
// AudioContext itself still waits for a user gesture inside
// `ensureRunning`.
loadPreferences();
