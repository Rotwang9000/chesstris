/**
 * Entry of dist/viking.bundle.js (scripts/build-client.js): the longship
 * builder on its own, loaded on demand by longshipLazy.js in Viking
 * battles. It publishes the builder on window; nothing else.
 */
import { buildLongship } from './longship.js';

if (typeof window !== 'undefined') {
	window.__tetchesLongship = { buildLongship };
	try { window.dispatchEvent(new CustomEvent('tetches:longship-ready')); } catch (_e) { /* old browser */ }
}
