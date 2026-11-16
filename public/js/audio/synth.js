/**
 * Small Web Audio voices for the Viking sound set (see vikingCues.js).
 *
 * The standard set is pure-wave beeps (cues.js). The Viking set wants
 * timber, water, iron and horn, so it needs a little more: filtered
 * noise (water, wood, breath), inharmonic partials (blades, bells), a
 * brassy filtered horn, a skin drum, a plucked lyre string, and a hall
 * reverb they all share. Everything is synthesised: nothing to license
 * or download, and it works offline.
 *
 * createSynth(ctx, destination) builds the shared chain once:
 *
 *   voices ─┬─ dry ──────────────┐
 *           └─ send → reverb ────┴─ compressor → destination
 *
 * Every voice takes a start time `t` (AudioContext seconds) and an
 * options object, schedules itself, stops its sources when done, and
 * returns its end time.
 */

function impulse(ctx, seconds, decay) {
	const rate = ctx.sampleRate;
	const len = Math.max(1, Math.floor(rate * seconds));
	const buf = ctx.createBuffer(2, len, rate);
	for (let ch = 0; ch < 2; ch++) {
		const d = buf.getChannelData(ch);
		for (let i = 0; i < len; i++) {
			// early reflections thin out into a smooth tail (a timber hall
			// by a fjord: warm, not cathedral)
			d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
		}
	}
	return buf;
}

function whiteNoise(ctx, seconds) {
	const len = Math.floor(ctx.sampleRate * seconds);
	const buf = ctx.createBuffer(1, len, ctx.sampleRate);
	const d = buf.getChannelData(0);
	for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
	return buf;
}

/** Brown(ish) noise: the low roll of the sea. */
export function brownNoise(ctx, seconds) {
	const len = Math.floor(ctx.sampleRate * seconds);
	const buf = ctx.createBuffer(1, len, ctx.sampleRate);
	const d = buf.getChannelData(0);
	let last = 0;
	for (let i = 0; i < len; i++) {
		last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
		d[i] = last * 3.5;
	}
	return buf;
}

const TINY = 0.0001;

export function createSynth(ctx, destination) {
	const comp = ctx.createDynamicsCompressor();
	comp.threshold.value = -16;
	comp.knee.value = 12;
	comp.ratio.value = 4;
	comp.attack.value = 0.004;
	comp.release.value = 0.25;
	comp.connect(destination);

	const dry = ctx.createGain();
	dry.connect(comp);
	const reverb = ctx.createConvolver();
	reverb.buffer = impulse(ctx, 2.4, 3.2);
	const wet = ctx.createGain();
	wet.gain.value = 0.8;
	reverb.connect(wet);
	wet.connect(comp);

	const noiseBuf = whiteNoise(ctx, 2);

	/** Route a voice's output: dry, plus a reverb send, optionally panned. */
	function out(node, { reverb: rev = 0.15, pan = 0 } = {}) {
		let n = node;
		if (pan && typeof ctx.createStereoPanner === 'function') {
			const p = ctx.createStereoPanner();
			p.pan.value = Math.max(-1, Math.min(1, pan));
			n.connect(p);
			n = p;
		}
		n.connect(dry);
		if (rev > 0) {
			const s = ctx.createGain();
			s.gain.value = rev;
			n.connect(s);
			s.connect(reverb);
		}
	}

	/** Attack to `peak`, hold, then an exponential fall. Returns the end time. */
	function envelope(param, t, { attack = 0.005, hold = 0, decay = 0.2, peak = 0.5 }) {
		const p = Math.max(TINY * 2, peak);
		param.setValueAtTime(TINY, t);
		param.linearRampToValueAtTime(p, t + Math.max(0.001, attack));
		param.setValueAtTime(p, t + attack + hold);
		param.exponentialRampToValueAtTime(TINY, t + attack + hold + Math.max(0.01, decay));
		return t + attack + hold + decay;
	}

	function sweep(param, t, from, to, dur) {
		param.setValueAtTime(from, t);
		if (to != null && to !== from) param.exponentialRampToValueAtTime(Math.max(1, to), t + Math.max(0.01, dur));
	}

	/**
	 * Filtered noise: water, wood, breath, wind.
	 * { attack, hold, decay, gain, filter, freq, freqEnd, q, reverb, pan }
	 */
	function noise(t, o = {}) {
		const src = ctx.createBufferSource();
		src.buffer = noiseBuf;
		const f = ctx.createBiquadFilter();
		f.type = o.filter || 'bandpass';
		f.Q.value = o.q ?? 1;
		const dur = (o.attack ?? 0.005) + (o.hold ?? 0) + (o.decay ?? 0.2);
		sweep(f.frequency, t, o.freq ?? 1000, o.freqEnd, dur);
		const g = ctx.createGain();
		const end = envelope(g.gain, t, { attack: o.attack ?? 0.005, hold: o.hold ?? 0, decay: o.decay ?? 0.2, peak: o.gain ?? 0.3 });
		src.connect(f);
		f.connect(g);
		out(g, o);
		src.start(t, Math.random() * 1.5);
		src.stop(end + 0.05);
		return end;
	}

	/**
	 * One oscillator, enveloped, optionally filtered, swept and wobbled.
	 * { freq, freqEnd, type, attack, hold, decay, gain, filterFreq,
	 *   filterEnd, q, vibrato: {rate, cents, delay}, detune, reverb, pan }
	 */
	function tone(t, o = {}) {
		const osc = ctx.createOscillator();
		osc.type = o.type || 'sine';
		if (Number.isFinite(o.detune)) osc.detune.value = o.detune;
		const dur = (o.attack ?? 0.005) + (o.hold ?? 0) + (o.decay ?? 0.2);
		sweep(osc.frequency, t, o.freq ?? 440, o.freqEnd, dur);
		let tail = osc;
		const extra = [];
		if (o.vibrato) {
			const lfo = ctx.createOscillator();
			lfo.frequency.value = o.vibrato.rate ?? 5;
			const depth = ctx.createGain();
			depth.gain.setValueAtTime(0, t);
			depth.gain.linearRampToValueAtTime(o.vibrato.cents ?? 10, t + (o.vibrato.delay ?? 0.1) + 0.05);
			lfo.connect(depth);
			depth.connect(osc.detune);
			extra.push(lfo);
		}
		if (o.filterFreq) {
			const f = ctx.createBiquadFilter();
			f.type = o.filterType || 'lowpass';
			f.Q.value = o.q ?? 0.8;
			sweep(f.frequency, t, o.filterFreq, o.filterEnd, dur);
			tail.connect(f);
			tail = f;
		}
		const g = ctx.createGain();
		const end = envelope(g.gain, t, { attack: o.attack ?? 0.005, hold: o.hold ?? 0, decay: o.decay ?? 0.2, peak: o.gain ?? 0.3 });
		tail.connect(g);
		out(g, o);
		for (const s of [osc, ...extra]) { s.start(t); s.stop(end + 0.05); }
		return end;
	}

	/** Struck metal: inharmonic partials, higher ones dying first. */
	function bell(t, o = {}) {
		const partials = o.partials || [1, 2.76, 5.4, 8.93];
		const base = o.freq ?? 880;
		let end = t;
		partials.forEach((ratio, i) => {
			end = Math.max(end, tone(t, {
				freq: base * ratio,
				type: 'sine',
				attack: 0.001,
				decay: (o.decay ?? 0.8) / (1 + i * 0.6),
				gain: (o.gain ?? 0.2) / (1 + i * 0.7),
				reverb: o.reverb ?? 0.3,
				pan: o.pan,
			}));
		});
		return end;
	}

	/** A skin drum: a pitch-dropping thump and the slap of the hide. */
	function drum(t, o = {}) {
		const end = tone(t, {
			freq: o.freq ?? 95, freqEnd: o.freqEnd ?? 50, type: 'sine',
			attack: 0.002, decay: o.decay ?? 0.4, gain: o.gain ?? 0.6,
			reverb: o.reverb ?? 0.25, pan: o.pan,
		});
		noise(t, {
			filter: 'bandpass', freq: o.slapFreq ?? 900, q: 0.9,
			attack: 0.001, decay: 0.06, gain: (o.gain ?? 0.6) * (o.skin ?? 0.35),
			reverb: o.reverb ?? 0.25, pan: o.pan,
		});
		return end;
	}

	/** A plucked lyre string: bright, then the filter closes as it rings. */
	function pluck(t, o = {}) {
		const f = o.freq ?? 293.66;
		const end = tone(t, {
			freq: f, type: 'sawtooth', attack: 0.002, decay: o.decay ?? 0.9,
			gain: (o.gain ?? 0.18) * 0.7, filterFreq: f * 8, filterEnd: f * 1.2, q: 1.5,
			reverb: o.reverb ?? 0.35, pan: o.pan,
		});
		tone(t, {
			freq: f, type: 'triangle', attack: 0.002, decay: (o.decay ?? 0.9) * 1.2,
			gain: (o.gain ?? 0.18) * 0.5, reverb: o.reverb ?? 0.35, pan: o.pan,
		});
		return end;
	}

	/**
	 * A horn (a lur, a cow horn): two detuned saws through a lowpass that
	 * opens as the player blows, a slow swell, a little wobble, breath.
	 * { freq, dur, gain, bend (cents by the end), reverb, pan }
	 */
	function horn(t, o = {}) {
		const f = o.freq ?? 146.83;
		const dur = o.dur ?? 0.8;
		const gain = o.gain ?? 0.25;
		const attack = Math.min(0.12, dur * 0.25);
		const hold = Math.max(0, dur - attack - 0.05);
		const decay = o.release ?? 0.3;
		const fEnd = o.bend ? f * Math.pow(2, o.bend / 1200) : f;
		let end = t;
		for (const det of [-7, 7]) {
			end = tone(t, {
				freq: f, freqEnd: fEnd, type: 'sawtooth', detune: det,
				attack, hold, decay, gain: gain * 0.55,
				filterFreq: f * 2, filterEnd: f * (o.bright ?? 7), q: 1.2,
				vibrato: { rate: 4.6, cents: 9, delay: 0.25 },
				reverb: o.reverb ?? 0.45, pan: o.pan,
			});
		}
		tone(t, {
			freq: f / 2, freqEnd: fEnd / 2, type: 'triangle',
			attack, hold, decay, gain: gain * 0.35, reverb: o.reverb ?? 0.45, pan: o.pan,
		});
		noise(t, {
			filter: 'bandpass', freq: f * 3, q: 2, attack: attack * 0.6, hold: hold * 0.5, decay: 0.2,
			gain: gain * 0.08, reverb: o.reverb ?? 0.45, pan: o.pan,
		});
		return end;
	}

	return { ctx, out, envelope, noise, tone, bell, drum, pluck, horn, input: dry, reverbIn: reverb };
}
