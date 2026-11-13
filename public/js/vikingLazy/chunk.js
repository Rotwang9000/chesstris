/**
 * Entry of dist/viking.bundle.js (scripts/build-client.js): every
 * Viking-only module, fetched by runtime.js the first time the Viking
 * edition or a Viking battle needs it. Imports of the app's own modules
 * resolve to the copies already running in dist/app.bundle.js (the
 * build's host shims), so there is one gameState, one toast, one socket.
 *
 * It publishes the modules the app bundle's stubs forward to, then
 * redraws what was drawn the standard way while it was on its way.
 */
import * as shipRenderer from '../viking/shipRenderer.js';
import * as theme from '../viking/theme.js';
import * as landDress from '../viking/landDress.js';
import * as runeStone from '../viking/runeStone.js';
import * as pieceFinish from '../viking/pieceFinish.js';
import * as shipLayout from '../viking/shipLayout.js';
import * as shipRulesClient from '../viking/shipRulesClient.js';
import * as shipEnv from '../longships/shipEnv.js';
import * as shipControls from '../longships/shipControls.js';
import * as paintingDirector from '../paintings/paintingDirector.js';
import { disposePowerUpVisuals } from '../powerUpRenderer.js';

if (typeof window !== 'undefined' && !window.__tetchesViking) {
	window.__tetchesViking = {
		shipRenderer, theme, landDress, runeStone, pieceFinish, shipLayout, shipRulesClient,
		shipEnv, shipControls, paintingDirector,
	};
	// The board, pieces and orbs drawn the standard way while the chunk
	// was on its way get their Viking dress (the orbs are rebuilt as rune
	// stones on the next frame's sync).
	try { if (typeof window.updateBoardVisuals === 'function') window.updateBoardVisuals(); } catch (err) {
		console.warn('[viking] redraw failed:', err?.message || err);
	}
	try { disposePowerUpVisuals(); } catch (_e) { /* rebuilt on the next sync anyway */ }
}
