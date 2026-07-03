/**
 * Battle bot pacing — pure helpers, no world state.
 *
 * Battles carry a `botDifficulty` chosen at creation:
 *
 *   • 'easy' | 'medium' | 'hard' — fixed cadence + strategy from the
 *     shared AI difficulty profiles (see server/ai/strategy.js).
 *   • 'auto' (default) — bots mirror the humans' recent tempo. The
 *     BattleManager sweep samples the humans' cumulative move count on
 *     a rolling window and retunes every bot's `minMoveInterval`, so a
 *     deliberate player gets deliberate bots and a speed-runner gets a
 *     proper race — always with a slight handicap in the human's
 *     favour.
 */

'use strict';

const BOT_PACE = Object.freeze({
	AUTO: 'auto',
	/** Rolling window over which human tempo is measured. */
	WINDOW_MS: 60 * 1000,
	/** Auto bots never act faster than this (hard-bot floor)... */
	MIN_INTERVAL_MS: 5000,
	/** ...nor slower than this, so battles keep moving. */
	MAX_INTERVAL_MS: 18000,
	/** Bots run this much slower than the humans they mirror. */
	HANDICAP: 1.15,
	/** Tempo assumed before the humans have made any moves. */
	DEFAULT_INTERVAL_MS: 12000,
});

/** Accepted `botDifficulty` values on battle_create. */
const BOT_DIFFICULTY_CHOICES = Object.freeze(['auto', 'easy', 'medium', 'hard']);

/** Coerce an untrusted client value to a valid choice (default auto). */
function normaliseBotDifficulty(value) {
	const v = String(value || '').trim().toLowerCase();
	return BOT_DIFFICULTY_CHOICES.includes(v) ? v : BOT_PACE.AUTO;
}

/**
 * Append a tempo sample (cumulative human move count at time `t`) and
 * evict samples that fell out of the window. Mutates and returns the
 * list so callers can do `battle.paceSamples = pushPaceSample(...)`.
 *
 * @param {Array<{t:number, moves:number}>|undefined} samples
 * @param {{t:number, moves:number}} sample
 */
function pushPaceSample(samples, sample) {
	const list = Array.isArray(samples) ? samples : [];
	list.push({ t: Number(sample.t) || 0, moves: Number(sample.moves) || 0 });
	const cutoff = list[list.length - 1].t - BOT_PACE.WINDOW_MS;
	while (list.length > 1 && list[0].t < cutoff) list.shift();
	return list;
}

/**
 * Bot move interval derived from the sampled human tempo.
 *
 * Fewer than two samples (battle just started) → the default tempo.
 * No human moves inside the window (thinking / away) → bots ease off
 * to the ceiling rather than steamrolling an idle player.
 *
 * @param {Array<{t:number, moves:number}>} samples
 * @returns {number} Milliseconds between bot actions.
 */
function adaptiveBotIntervalMs(samples) {
	if (!Array.isArray(samples) || samples.length < 2) return BOT_PACE.DEFAULT_INTERVAL_MS;
	const first = samples[0];
	const last = samples[samples.length - 1];
	const moves = Math.max(0, (last.moves || 0) - (first.moves || 0));
	if (moves === 0) return BOT_PACE.MAX_INTERVAL_MS;
	const spanMs = Math.max(1, (last.t || 0) - (first.t || 0));
	const target = (spanMs / moves) * BOT_PACE.HANDICAP;
	return Math.round(Math.min(BOT_PACE.MAX_INTERVAL_MS, Math.max(BOT_PACE.MIN_INTERVAL_MS, target)));
}

module.exports = {
	BOT_PACE,
	BOT_DIFFICULTY_CHOICES,
	normaliseBotDifficulty,
	pushPaceSample,
	adaptiveBotIntervalMs,
};
