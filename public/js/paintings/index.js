/**
 * The door to the event paintings (Viking edition).
 *
 * The standard game imports only this small file. Everything else —
 * the director, the card, the woodcut, the manifest — is loaded by a
 * dynamic `import()` the first time the Viking edition needs it, so a
 * standard page never runs that code or asks for anything under
 * /img/paintings/. (esbuild inlines the import into the single bundle;
 * unbundled dev pages fetch the modules only when it fires.)
 *
 * "Viking" means the edition is switched on (`?edition=viking`) OR the
 * viewer sits in a Viking battle (`vikingActive`), so someone who joins
 * a Viking battle by its code from the standard game still gets the
 * paintings — and the standard game, outside one, does no painting
 * work and asks for no painting at all.
 *
 * Call sites stay one line: `if (vikingActive(gameState)) paintingEvent('…', payload);`
 * Nothing here ever throws into a network handler.
 */

import gameState from '../utils/gameState.js';
import { vikingActive } from '../edition.js';

let director = null;

/**
 * Does this event belong to the Viking edition? A battle's end arrives
 * after the seat is released, so it is judged by the battle itself.
 */
export function paintsFor(type, payload) {
	if (vikingActive(gameState)) return true;
	return type === 'battle_end' && payload?.battle?.edition === 'viking';
}

function loadDirector() {
	if (!director) {
		director = import('./paintingDirector.js').catch((err) => {
			console.warn('[paintings] could not load:', err?.message || err);
			director = null;
			return null;
		});
	}
	return director;
}

/**
 * Start the paintings (setting button, manifest, preloading): at boot in
 * the Viking edition, and when a Viking battle is adopted.
 */
export function startPaintings() {
	if (!vikingActive(gameState)) return;
	loadDirector().then(m => m?.initPaintings()).catch(() => { /* paintings are decoration */ });
}

/**
 * Hand a game event to the director (see paintingDirector.js for types).
 * Events keep their order: each waits on the same import.
 */
export function paintingEvent(type, payload) {
	if (!paintsFor(type, payload)) return;
	loadDirector().then(m => m?.handlePaintingEvent(type, payload)).catch((err) => {
		console.warn(`[paintings] ${type} failed:`, err?.message || err);
	});
}

/**
 * Longship events (`tetches:ship`, dispatched by networkEvents). Ships
 * exist only in Viking battles, so in the standard game this never
 * fires; repeats of an event the raw handlers already passed on are
 * ignored by the director (paintingShips.js).
 */
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
	window.addEventListener('tetches:ship', (e) => {
		try { paintingEvent('ship', e?.detail); } catch (_e) { /* paintings are decoration */ }
	});
}
