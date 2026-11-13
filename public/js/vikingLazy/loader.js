/**
 * The way to a Viking-only module, unbundled (dev pages and tests).
 *
 * Here the Viking code is ordinary ES modules, so this is a plain
 * dynamic import. In the production bundle scripts/build-client.js
 * swaps this file for runtime.js, which fetches dist/viking.bundle.js —
 * every Viking-only module in one file, loaded only when the Viking
 * edition or a Viking battle needs it.
 */

const MODULES = {
	paintingDirector: () => import('../paintings/paintingDirector.js'),
};

/** Is the Viking code here? (Always, unbundled.) */
export function vikingLoaded() {
	return true;
}

/** The chunk's address, for the offline cache: none unbundled. */
export function vikingChunkUrl() {
	return null;
}

/** Ask for the Viking code now (a no-op unbundled). */
export function loadViking() {
	return Promise.resolve(null);
}

/**
 * One Viking module's namespace, or null when it can't be had.
 * @param {'paintingDirector'} name
 * @returns {Promise<Object|null>}
 */
export function loadVikingModule(name) {
	const load = MODULES[name];
	return load ? load() : Promise.resolve(null);
}
