/**
 * Prometheus metrics for Tetches.
 *
 * Exposes:
 *   • Default Node process metrics (event-loop lag, RSS, etc.)
 *   • `tetches_players_total`          gauge - human/AI players online
 *   • `tetches_world_cells_total`      gauge - cells currently occupied
 *   • `tetches_world_chess_pieces_total` gauge - chess pieces on board
 *   • `tetches_socket_connections`     gauge - live socket connections
 *   • `tetches_socket_events_total`    counter - events received, label `event`
 *   • `tetches_api_requests_total`     counter - REST hits, labels method, route, status
 *   • `tetches_persistence_saves_total` counter - successful world saves
 *   • `tetches_persistence_save_errors_total` counter - failed saves
 *
 * The collectors are populated from a background tick that asks the
 * World singleton for its current shape. Hot-path code only has to
 * call the cheap `inc*` helpers.
 */

'use strict';

const client = require('prom-client');

const register = new client.Registry();
register.setDefaultLabels({ service: 'tetches' });
client.collectDefaultMetrics({ register });

const playersGauge = new client.Gauge({
	name: 'tetches_players_total',
	help: 'Total players in the world, by category',
	labelNames: ['kind'], // human | ai | eliminated
	registers: [register],
});

const cellsGauge = new client.Gauge({
	name: 'tetches_world_cells_total',
	help: 'Occupied board cells',
	registers: [register],
});

const piecesGauge = new client.Gauge({
	name: 'tetches_world_chess_pieces_total',
	help: 'Chess pieces currently on the board',
	registers: [register],
});

const socketsGauge = new client.Gauge({
	name: 'tetches_socket_connections',
	help: 'Live Socket.IO connections',
	registers: [register],
});

const socketEventsCounter = new client.Counter({
	name: 'tetches_socket_events_total',
	help: 'Socket events received from clients',
	labelNames: ['event'],
	registers: [register],
});

const apiRequestsCounter = new client.Counter({
	name: 'tetches_api_requests_total',
	help: 'REST API requests',
	labelNames: ['method', 'route', 'status'],
	registers: [register],
});

const persistenceSavesCounter = new client.Counter({
	name: 'tetches_persistence_saves_total',
	help: 'Successful world saves',
	registers: [register],
});

const persistenceSaveErrorsCounter = new client.Counter({
	name: 'tetches_persistence_save_errors_total',
	help: 'Failed world saves',
	registers: [register],
});

/**
 * Refresh world-shape gauges from the singleton. Cheap enough to
 * call once per scrape; we don't compute it on every event.
 *
 * @param {Object} worldSnapshot - From `World.getWorld()`
 */
function refreshWorldGauges(worldSnapshot) {
	if (!worldSnapshot) return;
	const players = Object.values(worldSnapshot.players || {});
	let human = 0, ai = 0, eliminated = 0;
	for (const p of players) {
		if (p.eliminated) eliminated += 1;
		if (p.isComputer) ai += 1;
		else human += 1;
	}
	playersGauge.set({ kind: 'human' }, human);
	playersGauge.set({ kind: 'ai' }, ai);
	playersGauge.set({ kind: 'eliminated' }, eliminated);
	cellsGauge.set(Object.keys(worldSnapshot.board?.cells || {}).length);
	piecesGauge.set((worldSnapshot.chessPieces || []).length);
}

function incSocketEvent(event) {
	if (!event) return;
	socketEventsCounter.inc({ event });
}

function incApiRequest(method, route, status) {
	apiRequestsCounter.inc({
		method: String(method || 'GET'),
		route: route || 'unknown',
		status: String(status || 200),
	});
}

function setSocketCount(n) {
	socketsGauge.set(Number(n) || 0);
}

function recordSaveResult(success) {
	if (success) persistenceSavesCounter.inc();
	else persistenceSaveErrorsCounter.inc();
}

async function renderMetrics() {
	return register.metrics();
}

module.exports = {
	register,
	refreshWorldGauges,
	incSocketEvent,
	incApiRequest,
	setSocketCount,
	recordSaveResult,
	renderMetrics,
};
