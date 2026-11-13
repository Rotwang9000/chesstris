/**
 * The painting queue: which moment is shown next, and what is let go.
 *
 * One painting is on screen at a time, so a skirmish needs rules:
 *   • a moment already painted (same dedupe key, within DEDUPE_TTL_MS)
 *     is ignored — `chess_capture` and `chess_move` both report a capture;
 *   • captures within COALESCE_MS of the first in a run become one
 *     painting, "…and 2 more", whether that painting is waiting or
 *     already on screen;
 *   • the king's fall outranks a queen's arrival, which outranks the
 *     rest; equal ranks keep their order;
 *   • at most MAX_QUEUED wait — when full, the lowest-ranked (oldest
 *     first) is dropped, which may be the newcomer;
 *   • a moment with a `throttleKey` (the longship scenes, keyed by
 *     battle and painting) is shown once: another with the same key is
 *     turned away while one waits, is on screen, or has been shown;
 *   • a moment that waited longer than its `staleMs` (default
 *     STALE_MS; ship scenes 3 s) is let go rather than shown late.
 *
 * No DOM, no timers: the caller passes `now` (ms), so it is tested
 * directly (tests/ui/paintings.test.js) and paintingDirector.js drives it.
 */

export const COALESCE_MS = 1500;
export const MAX_QUEUED = 3;
export const DEDUPE_TTL_MS = 15000;
export const STALE_MS = 20000;

const RANK = { kingfall: 3, arrival: 2, ship: 1.5 };

/**
 * King > queen > a longship scene > everything else (captures): the
 * ship scenes are the edition's own moments, painted once a battle and
 * short-lived, so a capture card makes way for them.
 */
export function priorityOf(moment) {
	if (!moment) return 0;
	if (moment.kind === 'kingfall') return RANK.kingfall;
	if (moment.kind === 'arrival' && moment.pieceType === 'queen') return RANK.arrival;
	if (moment.kind === 'ship') return RANK.ship;
	return 1;
}

/** How long a painting stays up: longer for the great moments. */
export function durationFor(moment) {
	if (!moment) return 4000;
	if (moment.kind === 'kingfall' || moment.kind === 'arrival') return 6000;
	if (moment.kind === 'battle' && moment.outcome === 'victory') return 6000;
	if (moment.kind === 'ship') return 5000;
	return 4000;
}

export class PaintingQueue {
	constructor({
		coalesceMs = COALESCE_MS, maxQueued = MAX_QUEUED, dedupeTtlMs = DEDUPE_TTL_MS, staleMs = STALE_MS,
	} = {}) {
		this.coalesceMs = coalesceMs;
		this.maxQueued = maxQueued;
		this.dedupeTtlMs = dedupeTtlMs;
		this.staleMs = staleMs;
		this.waiting = [];
		this.current = null;
		this.seen = new Map();   // dedupeKey → time first seen
		this.spent = new Set();  // throttleKeys already shown
		this.seq = 0;
	}

	get size() {
		return this.waiting.length;
	}

	/**
	 * Offer a moment.
	 * @returns {'duplicate'|'throttled'|'merged'|'merged-current'|'queued'|'dropped'}
	 *   'merged-current' means the painting on screen gained a capture,
	 *   so its caption wants refreshing. A 'throttled' moment leaves no
	 *   dedupe mark, so the same blow may still be painted another way
	 *   (a raid's capture as an ordinary capture).
	 */
	push(moment, now) {
		if (!moment) return 'dropped';
		this.forgetOld(now);
		if (this.isThrottled(moment)) return 'throttled';
		if (moment.dedupeKey) {
			if (this.seen.has(moment.dedupeKey)) return 'duplicate';
			this.seen.set(moment.dedupeKey, now);
		}

		if (moment.kind === 'capture') {
			const run = this.findRun(now);
			if (run) {
				run.extra = (run.extra || 0) + 1 + (moment.extra || 0);
				return run === this.current ? 'merged-current' : 'merged';
			}
		}

		const entry = { ...moment, extra: moment.extra || 0, at: now, seq: this.seq++ };
		this.waiting.push(entry);
		if (this.waiting.length > this.maxQueued) {
			const victim = this.lowest();
			this.waiting = this.waiting.filter(m => m !== victim);
			if (victim === entry) return 'dropped';
		}
		return 'queued';
	}

	/**
	 * Is a short-lived moment (one with its own `staleMs`, the ship
	 * scenes) waiting that ranks at least `rank`? The card on screen
	 * then makes way early, or the moment would expire unseen.
	 */
	hasUrgent(rank, now) {
		return this.waiting.some(m => Number.isFinite(m.staleMs)
			&& priorityOf(m) >= rank
			&& (!Number.isFinite(now) || now - m.at <= m.staleMs));
	}

	/** Is a moment with this one's throttleKey waiting, showing or shown? */
	isThrottled(moment) {
		const key = moment?.throttleKey;
		if (!key) return false;
		if (this.spent.has(key)) return true;
		if (this.current && this.current.throttleKey === key) return true;
		return this.waiting.some(m => m.throttleKey === key);
	}

	/**
	 * Take the next moment to show (it becomes `current`), or null.
	 * Given `now`, moments that waited past their `staleMs` are let go.
	 */
	next(now) {
		if (Number.isFinite(now)) {
			this.waiting = this.waiting.filter(m => now - m.at <= (Number.isFinite(m.staleMs) ? m.staleMs : this.staleMs));
		}
		if (this.waiting.length === 0) return null;
		let best = this.waiting[0];
		for (const m of this.waiting) {
			if (priorityOf(m) > priorityOf(best)) best = m;
		}
		this.waiting = this.waiting.filter(m => m !== best);
		this.current = best;
		if (best.throttleKey) this.spent.add(best.throttleKey);
		return best;
	}

	/** The painting on screen has gone. */
	finish() {
		this.current = null;
	}

	/** Drop everything waiting (the setting was turned off). */
	clear() {
		this.waiting = [];
	}

	/** A capture run still open for merging: on screen or waiting. */
	findRun(now) {
		const open = (m) => m && m.kind === 'capture' && now - m.at <= this.coalesceMs;
		if (open(this.current)) return this.current;
		for (let i = this.waiting.length - 1; i >= 0; i--) {
			if (open(this.waiting[i])) return this.waiting[i];
		}
		return null;
	}

	lowest() {
		let low = null;
		for (const m of this.waiting) {
			if (!low || priorityOf(m) < priorityOf(low)
				|| (priorityOf(m) === priorityOf(low) && m.seq < low.seq)) low = m;
		}
		return low;
	}

	forgetOld(now) {
		for (const [key, at] of this.seen) {
			if (now - at > this.dedupeTtlMs) this.seen.delete(key);
		}
	}
}
