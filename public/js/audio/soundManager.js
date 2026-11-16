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
import { VIKING_CUES } from './vikingCues.js';
import { createSynth, brownNoise } from './synth.js';
import { vikingActive } from '../edition.js';

const MUTE_STORAGE_KEY = 'tetches.audio.muted';
const VOLUME_STORAGE_KEY = 'tetches.audio.volume';
const SEA_STORAGE_KEY = 'tetches.audio.sea';

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
	if (_audioContext) { startSea(); return _audioContext; }
	if (_initAttempted && !_audioContext) return null;
	_initAttempted = true;
	loadPreferences();
loadSeaPreference();
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
	if (_audioContext) startSea();
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
	// The Viking edition has its own set (vikingCues.js), with a few cues
	// the standard game doesn't play at all (they stay silent there).
	if (vikingSoundsActive() && VIKING_CUES[cueName]) {
		playVikingCue(cueName, opts);
		return;
	}
	const cue = SOUND_CUES[cueName];
	if (!cue) {
		if (!VIKING_CUES[cueName]) console.warn('[soundManager] Unknown cue:', cueName);
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

/* ------------------------------------------------ the Viking set */

let _synth = null;
const _lastPlayed = new Map();
// The same cue twice within this window is one sound (a seizure arrives
// both as the chess move and as ship_seized; a cascade clears in bursts).
const CUE_GAP_MS = 120;
const SHIP_CUE_GAP_MS = 450;

/** Is the Viking sound set wanted now (the page edition, or a Viking battle)? */
export function vikingSoundsActive() {
	try {
		const gs = typeof window !== 'undefined' ? window.gameState : null;
		return !!vikingActive(gs);
	} catch (_e) {
		return false;
	}
}

function synth() {
	const ctx = ensureRunning();
	if (!ctx || !_masterGain) return null;
	if (!_synth || _synth.ctx !== ctx) _synth = createSynth(ctx, _masterGain);
	return _synth;
}

/** Should this cue play now, or is it the echo of one just played? */
export function cueDue(name, now, last = _lastPlayed) {
	const gap = String(name).startsWith('ship') || name === 'raidLost' ? SHIP_CUE_GAP_MS : CUE_GAP_MS;
	const prev = last.get(name);
	if (prev != null && now - prev < gap) return false;
	last.set(name, now);
	return true;
}

function playVikingCue(cueName, opts = {}) {
	if (!cueDue(cueName, Date.now())) return;
	const s = synth();
	if (!s) return;
	try {
		VIKING_CUES[cueName](s, s.ctx.currentTime + 0.01, opts);
	} catch (err) {
		console.warn('[soundManager] Viking cue threw:', err.message);
	}
	startSea();
}

/* ------------------------------------------- the sea (Viking only) */

let _sea = null;
let _seaOn = true;

function loadSeaPreference() {
	try {
		const v = localStorage.getItem(SEA_STORAGE_KEY);
		if (v !== null) _seaOn = v === '1';
	} catch (_e) { /* localStorage unavailable */ }
}

export function isSeaOn() {
	return _seaOn;
}

/**
 * The sea and the wind under a Viking game, very quiet: the roll of the
 * waves (brown noise, its swell rising and falling every ~9 s) and a
 * breath of wind (band noise whose pitch drifts). Follows the mute.
 */
export function setSeaOn(on) {
	_seaOn = !!on;
	try { localStorage.setItem(SEA_STORAGE_KEY, _seaOn ? '1' : '0'); } catch (_e) { /* ignored */ }
	if (_seaOn) startSea();
	else stopSea();
}

export function startSea() {
	if (_sea || !_seaOn || !vikingSoundsActive()) return;
	const ctx = ensureRunning();
	if (!ctx || !_masterGain) return;
	try {
		const out = ctx.createGain();
		out.gain.setValueAtTime(0.0001, ctx.currentTime);
		out.gain.linearRampToValueAtTime(0.16, ctx.currentTime + 4);
		out.connect(_masterGain);
		const nodes = [];

		const waves = ctx.createBufferSource();
		waves.buffer = brownNoise(ctx, 6);
		waves.loop = true;
		const lp = ctx.createBiquadFilter();
		lp.type = 'lowpass';
		lp.frequency.value = 520;
		const swell = ctx.createGain();
		swell.gain.value = 0.55;
		const swellLfo = ctx.createOscillator();
		swellLfo.frequency.value = 0.11;
		const swellDepth = ctx.createGain();
		swellDepth.gain.value = 0.4;
		swellLfo.connect(swellDepth);
		swellDepth.connect(swell.gain);
		waves.connect(lp);
		lp.connect(swell);
		swell.connect(out);
		nodes.push(waves, swellLfo);

		const wind = ctx.createBufferSource();
		const len = ctx.sampleRate * 4;
		const buf = ctx.createBuffer(1, len, ctx.sampleRate);
		const d = buf.getChannelData(0);
		for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
		wind.buffer = buf;
		wind.loop = true;
		const bp = ctx.createBiquadFilter();
		bp.type = 'bandpass';
		bp.frequency.value = 650;
		bp.Q.value = 0.9;
		const windLfo = ctx.createOscillator();
		windLfo.frequency.value = 0.045;
		const windDepth = ctx.createGain();
		windDepth.gain.value = 260;
		windLfo.connect(windDepth);
		windDepth.connect(bp.frequency);
		const windGain = ctx.createGain();
		windGain.gain.value = 0.05;
		wind.connect(bp);
		bp.connect(windGain);
		windGain.connect(out);
		nodes.push(wind, windLfo);

		for (const n of nodes) n.start();
		_sea = { out, nodes };
	} catch (err) {
		console.warn('[soundManager] sea failed:', err.message);
		_sea = null;
	}
}

export function stopSea() {
	if (!_sea) return;
	const { out, nodes } = _sea;
	_sea = null;
	try {
		const ctx = out.context;
		out.gain.cancelScheduledValues(ctx.currentTime);
		out.gain.setValueAtTime(out.gain.value, ctx.currentTime);
		out.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 1);
		for (const n of nodes) n.stop(ctx.currentTime + 1.1);
		setTimeout(() => { try { out.disconnect(); } catch (_e) { /* gone */ } }, 1300);
	} catch (_e) { /* best-effort */ }
}

// Initialise eagerly so localStorage preferences are loaded. The
// AudioContext itself still waits for a user gesture inside
// `ensureRunning`.
loadPreferences();
loadSeaPreference();
