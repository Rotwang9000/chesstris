/**
 * Painting catalogue: which picture shows which moment.
 *
 * Every moment has a list of slot ids, most specific first, e.g. a
 * knight taking a bishop asks for `capture.knight.bishop`, then
 * `capture.knight`, then the generic `capture`. The manifest
 * (public/img/paintings/manifest.json) lists the slots that have a
 * real painting; the first one present wins. When none is — or the
 * file fails to load — the card draws a procedural woodcut instead
 * (fallbackArt.js), so the catalogue can grow one painting at a time:
 * drop in a file, add a manifest line, done.
 *
 * File names carry a version (`….v1.webp`) because nginx caches images
 * for a week; a repainted scene gets a new name rather than a stale copy.
 *
 * The slot logic is pure (tested in tests/ui/paintings.test.js); the
 * loaders at the bottom touch the network and the DOM.
 */

export const MANIFEST_URL = '/img/paintings/manifest.json';
const DEFAULT_BASE = '/img/paintings/';

const PIECE_TYPES = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];

/** 'KNIGHT' / 'knight' / 'Knight' → 'knight'; anything unknown → null. */
export function normalisePieceType(type) {
	const t = String(type || '').trim().toLowerCase();
	return PIECE_TYPES.includes(t) ? t : null;
}

/**
 * Slot ids for a moment, most specific first.
 *
 * @param {Object} moment  a queued painting event (see paintingEvents.js)
 * @returns {string[]}
 */
export function slotCandidates(moment) {
	if (!moment) return [];
	const attacker = normalisePieceType(moment.attackerType);
	const victim = normalisePieceType(moment.victimType);
	switch (moment.kind) {
		case 'capture': {
			const out = [];
			if (attacker && victim) out.push(`capture.${attacker}.${victim}`);
			if (attacker) out.push(`capture.${attacker}`);
			out.push('capture');
			return out;
		}
		case 'kingfall':
			// No blow struck (the check timer ran out): a siege scene if
			// one is ever painted, else the same fall as a direct capture.
			return moment.siege ? ['kingfall.siege', 'kingfall.blade'] : ['kingfall.blade'];
		case 'arrival': {
			const piece = normalisePieceType(moment.pieceType);
			if (!piece) return [];
			// A queen STORMING a shore from her ship (a capture as she lands)
			// is a raid, not the stately arrival on a jetty.
			if (moment.viaShip && moment.raid) return ['ship.raid', `arrival.${piece}`];
			return [`arrival.${piece}`];
		}
		case 'battle':
			return moment.outcome === 'victory' ? ['battle.victory'] : ['battle.defeat'];
		case 'ship': {
			// Longship scenes (paintingShips.js): one painting each…
			if (!SHIP_SCENE_SET.has(moment.scene)) return [];
			// …except a knight, seer or huscarl stepping ashore on an enemy
			// shore, who has an arrival of their own (a queen's landing is
			// already an `arrival` moment; pawns and kings use the scene).
			const piece = normalisePieceType(moment.pieceType);
			if (moment.scene === 'landing' && LANDING_ARRIVALS.has(piece)) {
				return [`arrival.${piece}`, 'ship.landing'];
			}
			return [`ship.${moment.scene}`];
		}
		default:
			return [];
	}
}

const SHIP_SCENE_SET = new Set([
	'embark', 'setsail', 'landing', 'raid', 'raidcheck', 'boarded',
	'seized', 'lifeboat', 'lost', 'emptysunk', 'newkeel',
]);
/** Pieces whose landing on an enemy shore is painted as their arrival. */
const LANDING_ARRIVALS = new Set(['knight', 'bishop', 'rook']);

/**
 * The first candidate slot the manifest has a painting for.
 *
 * Tolerant of a missing or malformed manifest: anything odd simply
 * means "no painting", and the woodcut fallback is drawn.
 *
 * @param {Object|null} manifest
 * @param {string[]} candidates
 * @returns {{ slot: string, src: string, alt: string }|null}
 */
export function resolvePainting(manifest, candidates) {
	const paintings = manifest && typeof manifest === 'object' ? manifest.paintings : null;
	if (!paintings || typeof paintings !== 'object') return null;
	const base = typeof manifest.base === 'string' && manifest.base ? manifest.base : DEFAULT_BASE;
	for (const slot of candidates || []) {
		if (!Object.prototype.hasOwnProperty.call(paintings, slot)) continue;
		const entry = paintings[slot];
		const file = typeof entry === 'string' ? entry : entry?.file;
		// Plain file names only: the manifest can't point us off-site.
		if (typeof file !== 'string' || !/^[\w.-]+\.(webp|avif|jpe?g|png)$/i.test(file)) continue;
		const alt = typeof entry?.alt === 'string' ? entry.alt : '';
		return { slot, src: base.replace(/\/?$/, '/') + file, alt };
	}
	return null;
}

/** Every painting file the manifest lists (for warming the cache when idle). */
export function allPaintingSources(manifest) {
	const paintings = manifest?.paintings;
	if (!paintings || typeof paintings !== 'object') return [];
	return Object.keys(paintings)
		.map(slot => resolvePainting(manifest, [slot]))
		.filter(Boolean)
		.map(p => p.src);
}

// ── Loading (browser only) ─────────────────────────────────────────────────

let manifestPromise = null;

/** The manifest, fetched once; resolves null if it can't be had. */
export function loadManifest() {
	if (manifestPromise) return manifestPromise;
	manifestPromise = (typeof fetch === 'function'
		? fetch(MANIFEST_URL, { cache: 'no-cache' })
			.then(res => (res.ok ? res.json() : null))
			.catch(() => null)
		: Promise.resolve(null))
		.then((m) => {
			// A failed fetch may be a blip: let the next moment try again.
			if (!m) manifestPromise = null;
			return m;
		});
	return manifestPromise;
}

const imageCache = new Map();

/**
 * Load and decode an image. Resolves the <img> (decoded) or rejects;
 * repeat calls share one load, and a failure is forgotten so the next
 * moment can retry.
 */
export function loadImage(src) {
	if (imageCache.has(src)) return imageCache.get(src);
	const promise = new Promise((resolve, reject) => {
		const img = new Image();
		img.decoding = 'async';
		img.onload = () => {
			const decoded = typeof img.decode === 'function' ? img.decode().catch(() => {}) : Promise.resolve();
			decoded.then(() => resolve(img));
		};
		img.onerror = () => reject(new Error(`painting failed to load: ${src}`));
		img.src = src;
	});
	promise.catch(() => imageCache.delete(src));
	imageCache.set(src, promise);
	return promise;
}

/**
 * The paintings nearly every battle shows — a voyage begun, the king's
 * fall, a queen come ashore, the battle's end — warmed first, and on a
 * phone the only ones warmed: the rest (a picture for each capture
 * pairing, ~35 in all, ~3 MB) load when their moment comes, the woodcut
 * standing in until the painting fades in over it.
 */
export const LIKELY_SLOTS = Object.freeze([
	'ship.embark', 'ship.setsail', 'kingfall.blade', 'arrival.queen', 'battle.victory', 'battle.defeat',
]);

/**
 * Which painting files to warm, in order: the likely few, then — unless
 * the device is `constrained` (a phone, Save-Data, a slow connection) —
 * everything else the manifest lists.
 */
export function preloadSources(manifest, { constrained = false } = {}) {
	const likely = LIKELY_SLOTS
		.map(slot => resolvePainting(manifest, [slot]))
		.filter(Boolean)
		.map(p => p.src);
	if (constrained) return likely;
	return likely.concat(allPaintingSources(manifest).filter(src => !likely.includes(src)));
}

/** A phone or tablet, Save-Data, or a slow connection: warm only the likely few. */
export function constrainedDevice() {
	try {
		const conn = typeof navigator !== 'undefined' ? navigator.connection : null;
		if (conn?.saveData) return true;
		if (/(^|-)(2g|3g)$/.test(String(conn?.effectiveType || ''))) return true;
		if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
			return window.matchMedia('(pointer: coarse), (max-width: 700px)').matches;
		}
	} catch (_e) { /* no way to tell: treat as a desktop */ }
	return false;
}

/**
 * Warm the browser cache with the likely paintings (preloadSources), one
 * at a time, in idle moments — so the first voyage or king's fall shows
 * the real picture rather than losing the 250 ms race to the woodcut.
 */
export function preloadPaintings(manifest, { constrained = constrainedDevice() } = {}) {
	const queue = preloadSources(manifest, { constrained });
	const idle = typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function'
		? (fn) => window.requestIdleCallback(fn, { timeout: 4000 })
		: (fn) => setTimeout(fn, 600);
	const step = () => {
		const src = queue.shift();
		if (!src) return;
		loadImage(src).catch(() => {}).then(() => idle(step));
	};
	idle(step);
}
