/**
 * Visitor-funnel counters — answers "how many people came, and how far
 * did they get?" without storing any PII (no IPs, no user agents, no ids).
 *
 * Stages:
 *   • pageViews       — index.html served (obvious bots filtered out)
 *   • newVisitors     — fresh player identities minted on socket connect
 *   • worldJoins      — players who entered the world for the first time
 *                       (home zone created)
 *   • firstPlacements — players who placed their first-ever tetromino
 *
 * Counts are kept as lifetime totals plus per-day buckets (UTC dates,
 * pruned after DAILY_RETENTION_DAYS). Persisted to `funnel.json` in the
 * data dir with a small write throttle — losing a few seconds of counts
 * on a crash is acceptable for analytics.
 *
 * Read back via `GET /api/admin/funnel` (admin-token gated, see app.js).
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Mirrors persistence.js: TETCHES_DATA_DIR lets an isolated test/dev
// instance keep its own counters away from the production file.
const DATA_DIR = process.env.TETCHES_DATA_DIR
	? path.resolve(process.env.TETCHES_DATA_DIR)
	: path.join(__dirname, '..', '..', 'data');
const FUNNEL_FILE = path.join(DATA_DIR, 'funnel.json');

const SAVE_THROTTLE_MS = 5000;
const DAILY_RETENTION_DAYS = 60;
const STAGES = Object.freeze(['pageViews', 'newVisitors', 'worldJoins', 'firstPlacements']);

// Filters the crawlers that would otherwise dominate pageViews. Real
// browsers sail through; a headless UA is counted (that's what our own
// smoke tests use, and some legitimate players run privacy browsers
// with odd UAs — over-filtering is worse than a little noise).
const BOT_UA_PATTERN = /bot|crawl|spider|slurp|curl|wget|python-requests|httpclient|facebookexternalhit|preview|monitor|pingdom|uptimerobot|lighthouse/i;

let state = null;
let saveTimer = null;

function emptyState() {
	const totals = {};
	for (const stage of STAGES) totals[stage] = 0;
	return {
		version: 1,
		since: new Date().toISOString(),
		totals,
		daily: {},
	};
}

function utcDayKey(date = new Date()) {
	return date.toISOString().slice(0, 10);
}

function loadState() {
	try {
		const raw = fs.readFileSync(FUNNEL_FILE, 'utf8');
		const parsed = JSON.parse(raw);
		if (parsed && parsed.totals && parsed.daily) {
			// Backfill any stages added after the file was written.
			for (const stage of STAGES) {
				if (typeof parsed.totals[stage] !== 'number') parsed.totals[stage] = 0;
			}
			return parsed;
		}
	} catch (_e) {
		// Missing or corrupt file — start fresh; counters are best-effort.
	}
	return emptyState();
}

function ensureState() {
	if (!state) state = loadState();
	return state;
}

function pruneOldDays(current) {
	const cutoff = utcDayKey(new Date(Date.now() - DAILY_RETENTION_DAYS * 24 * 60 * 60 * 1000));
	for (const day of Object.keys(current.daily)) {
		if (day < cutoff) delete current.daily[day];
	}
}

function scheduleSave() {
	if (saveTimer) return;
	saveTimer = setTimeout(() => {
		saveTimer = null;
		saveNow();
	}, SAVE_THROTTLE_MS);
	// Don't let a pending analytics write keep the process alive.
	if (typeof saveTimer.unref === 'function') saveTimer.unref();
}

function saveNow() {
	if (!state) return;
	try {
		fs.mkdirSync(DATA_DIR, { recursive: true });
		fs.writeFileSync(FUNNEL_FILE, JSON.stringify(state, null, '\t'));
	} catch (err) {
		console.warn('[Funnel] save failed:', err.message);
	}
}

function record(stage) {
	if (!STAGES.includes(stage)) return;
	const current = ensureState();
	current.totals[stage] += 1;
	const day = utcDayKey();
	if (!current.daily[day]) current.daily[day] = {};
	current.daily[day][stage] = (current.daily[day][stage] || 0) + 1;
	pruneOldDays(current);
	scheduleSave();
}

/**
 * A page view of the game itself (`/`, `/index.html`, `/2d`).
 * @param {string} [userAgent] - used only to skip crawlers, never stored
 */
function recordPageView(userAgent) {
	if (userAgent && BOT_UA_PATTERN.test(String(userAgent))) return;
	record('pageViews');
}

/** A brand-new player identity was minted on socket connect. */
function recordNewVisitor() {
	record('newVisitors');
}

/** A player entered the world for the first time (home zone created). */
function recordWorldJoin() {
	record('worldJoins');
}

/** A player placed their first-ever tetromino. */
function recordFirstPlacement() {
	record('firstPlacements');
}

/**
 * Snapshot for the admin endpoint: lifetime totals plus the most recent
 * daily buckets, newest first.
 *
 * @param {number} [days=14]
 * @returns {{since: string, totals: Object, days: Array<{date: string} & Object>}}
 */
function getSnapshot(days = 14) {
	const current = ensureState();
	const recent = Object.keys(current.daily)
		.sort()
		.reverse()
		.slice(0, Math.max(1, days))
		.map((date) => ({ date, ...current.daily[date] }));
	return {
		since: current.since,
		totals: { ...current.totals },
		days: recent,
	};
}

/** Test hook: drop in-memory state so the next call re-reads the file. */
function _resetForTests() {
	if (saveTimer) {
		clearTimeout(saveTimer);
		saveTimer = null;
	}
	state = null;
}

module.exports = {
	recordPageView,
	recordNewVisitor,
	recordWorldJoin,
	recordFirstPlacement,
	getSnapshot,
	saveNow,
	STAGES,
	FUNNEL_FILE,
	_resetForTests,
};
