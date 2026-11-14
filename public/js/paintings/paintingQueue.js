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
 *     STALE_MS; ship scenes SHIP_STALE_MS) is let go rather than shown
 *     late. Only the time it COULD have been shown counts: while another
 *     card is on screen (or being prepared) the moments behind it do not
 *     age, so a slow device or a long card never costs the next one its
 *     turn. Whatever the count, nothing surfaces more than MAX_AGE_MS
 *     after it happened;
 *   • a longship's set-sail within EMBARK_MERGE_MS of its voyage's
 *     embark, while the embark still waits, becomes one card ("…embarks
 *     and sets sail") in the embark's place in line.
 *
 * No DOM, no timers: the caller passes `now` (ms), so it is tested
 * directly (tests/ui/paintings.test.js) and paintingDirector.js drives it.
 */

export const COALESCE_MS = 1500;
export const MAX_QUEUED = 3;
export const DEDUPE_TTL_MS = 15000;
export const STALE_MS = 20000;
/** Nothing is shown later than this after it happened, however it waited. */
export const MAX_AGE_MS = 30000;
/** A set-sail this soon after its embark (still waiting) joins it. */
export const EMBARK_MERGE_MS = 2000;

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
		maxAgeMs = MAX_AGE_MS, mergeMs = EMBARK_MERGE_MS,
	} = {}) {
		this.coalesceMs = coalesceMs;
		this.maxQueued = maxQueued;
		this.dedupeTtlMs = dedupeTtlMs;
		this.staleMs = staleMs;
		this.maxAgeMs = maxAgeMs;
		this.mergeMs = mergeMs;
		// Time a card has held the screen (from next() to finish()): the
		// moments waiting behind it don't age meanwhile.
		this.busySince = null;
		this.busyTotal = 0;
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
	 * @returns {'duplicate'|'throttled'|'merged'|'merged-current'|'merged-embark'|'queued'|'dropped'}
	 *   'merged-current' means the painting on screen gained a capture,
	 *   so its caption wants refreshing; 'merged-embark' that a set-sail
	 *   took its waiting embark's place (one card). A 'throttled' moment leaves no
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

		if (this.mergeEmbark(moment, now)) return 'merged-embark';

		const entry = { ...moment, extra: moment.extra || 0, at: now, busyAt: this.busyClock(now), seq: this.seq++ };
		this.waiting.push(entry);
		if (this.waiting.length > this.maxQueued) {
			const victim = this.lowest();
			this.waiting = this.waiting.filter(m => m !== victim);
			if (victim === entry) return 'dropped';
		}
		return 'queued';
	}

	/**
	 * A set-sail whose embark (same `voyageKey`) is still waiting, and
	 * came at most `mergeMs` before it: the two are told as one card —
	 * the set-sail, captioned "…embarks and sets sail" — in the embark's
	 * place in line. The embark's scene counts as told.
	 */
	mergeEmbark(moment, now) {
		if (moment.kind !== 'ship' || moment.scene !== 'setsail' || !moment.voyageKey) return false;
		const embark = this.waiting.find(m => m.kind === 'ship' && m.scene === 'embark'
			&& m.voyageKey === moment.voyageKey && now - m.at <= this.mergeMs);
		if (!embark) return false;
		if (embark.throttleKey) this.spent.add(embark.throttleKey);
		const merged = {
			...moment, embarked: true, extra: 0, at: embark.at, busyAt: embark.busyAt, seq: embark.seq,
		};
		this.waiting = this.waiting.map(m => (m === embark ? merged : m));
		return true;
	}

	/** Total ms a card has held the screen, up to `now`. */
	busyClock(now) {
		const running = this.busySince != null && Number.isFinite(now) ? Math.max(0, now - this.busySince) : 0;
		return this.busyTotal + running;
	}

	/**
	 * How long `m` has waited while it could have been shown: since it
	 * arrived, less the time another card held the screen.
	 */
	waitedFor(m, now) {
		if (!Number.isFinite(now)) return 0;
		const busy = this.busyClock(now) - (Number.isFinite(m.busyAt) ? m.busyAt : 0);
		return Math.max(0, now - m.at - busy);
	}

	/** Has `m` waited past its `staleMs`, or is it older than `maxAgeMs`? */
	isStale(m, now) {
		if (!Number.isFinite(now)) return false;
		if (now - m.at > this.maxAgeMs) return true;
		return this.waitedFor(m, now) > (Number.isFinite(m.staleMs) ? m.staleMs : this.staleMs);
	}

	/**
	 * Is a short-lived moment (one with its own `staleMs`, the ship
	 * scenes) waiting that ranks at least `rank`? The card on screen
	 * then makes way early: these are moments of the voyage, told while
	 * the ship is still where they happened.
	 */
	hasUrgent(rank, now) {
		return this.waiting.some(m => Number.isFinite(m.staleMs)
			&& priorityOf(m) >= rank
			&& !this.isStale(m, now));
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
	 * Given `now`, moments that waited past their `staleMs` are let go,
	 * and the screen counts as busy from `now` until finish().
	 */
	next(now) {
		if (Number.isFinite(now)) {
			this.waiting = this.waiting.filter(m => !this.isStale(m, now));
		}
		if (this.waiting.length === 0) return null;
		let best = this.waiting[0];
		for (const m of this.waiting) {
			if (priorityOf(m) > priorityOf(best)) best = m;
		}
		this.waiting = this.waiting.filter(m => m !== best);
		this.current = best;
		if (best.throttleKey) this.spent.add(best.throttleKey);
		if (this.busySince == null && Number.isFinite(now)) this.busySince = now;
		return best;
	}

	/**
	 * The painting on screen has gone (or is going): the moments behind
	 * it can be shown, and age, from `now`. Without `now` the time it was
	 * up is not credited to them (they age as if it never was).
	 */
	finish(now) {
		this.current = null;
		if (this.busySince == null) return;
		if (Number.isFinite(now)) this.busyTotal += Math.max(0, now - this.busySince);
		this.busySince = null;
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
