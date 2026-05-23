/**
 * Tetches REST API
 *
 * The single authoritative game state lives in `server/world/World.js`
 * and gameplay flows through Socket.IO.  This thin REST surface only
 * provides:
 *
 *   • A health/ping endpoint.
 *   • Registration for external AI bots (issues an API token).
 *   • Read-only world summary endpoints for spectators and bots.
 *
 * Older versions of this file kept their own parallel `games` Map plus
 * a stub 2D-array board with separate (broken) move handlers.  That
 * sandbox has been removed — there is one world, and gameplay actions
 * must go through sockets so the world remains authoritative.
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

const World = require('../server/world/World');
const boardVisualization = require('../server/utils/boardVisualization');

const router = express.Router();

// External AI directory (process-local; bots re-register on restart).
const externalComputerPlayers = {};
const externalApiTokens = {};

function generateApiToken() {
	return crypto.randomBytes(32).toString('hex');
}

function validateApiToken(playerId, token) {
	return !!token && externalApiTokens[playerId] === token;
}

router.get('/', (_req, res) => {
	res.json({
		success: true,
		message: 'Tetches API is running',
		version: '2.0.0',
		world: {
			id: World.getWorldId(),
			players: World.playerCount(),
		},
		endpoints: [
			'GET  /',
			'GET  /health',
			'GET  /world',
			'GET  /world/visualization',
			'POST /computer-players/register',
			'GET  /computer-players',
		],
	});
});

// Liveness / readiness probe used by Docker HEALTHCHECK, nginx
// upstream checks, and uptime monitors. Intentionally cheap — does
// not touch the persistence layer; only confirms the process is up
// and the singleton world is initialised.
router.get('/health', (_req, res) => {
	const w = World.getWorld();
	if (!w) {
		return res.status(503).json({ status: 'starting' });
	}
	res.json({
		status: 'ok',
		worldId: w.id,
		players: World.playerCount(),
		uptimeSec: Math.round(process.uptime()),
		memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
	});
});

/**
 * Read-only summary of the single authoritative world.  Useful for
 * external AI bots to inspect the state before deciding their next
 * action.
 */
router.get('/world', (_req, res) => {
	const w = World.getWorld();
	res.json({
		success: true,
		world: {
			id: w.id,
			status: w.status,
			updatedAt: w.updatedAt,
			maxPlayers: w.maxPlayers,
			homeZoneDistance: w.homeZoneDistance,
			gameMode: w.gameMode,
			boardBounds: {
				minX: w.board.minX,
				maxX: w.board.maxX,
				minZ: w.board.minZ,
				maxZ: w.board.maxZ,
			},
			cellCount: Object.keys(w.board.cells || {}).length,
			chessPieces: w.chessPieces.length,
			players: Object.values(w.players).map(p => ({
				id: p.id,
				name: p.name,
				isComputer: !!p.isComputer,
				eliminated: !!p.eliminated,
			})),
		},
	});
});

router.get('/world/visualization', (req, res) => {
	try {
		const playerId = req.query.playerId;
		const options = {
			centerX: req.query.centerX ? parseInt(req.query.centerX, 10) : undefined,
			centerY: req.query.centerY ? parseInt(req.query.centerY, 10) : undefined,
			highlightX: req.query.highlightX ? parseInt(req.query.highlightX, 10) : undefined,
			highlightY: req.query.highlightY ? parseInt(req.query.highlightY, 10) : undefined,
			viewSize: req.query.viewSize ? parseInt(req.query.viewSize, 10) : 20,
			showCoordinates: req.query.showCoordinates !== 'false',
			focusPlayerId: playerId,
		};
		const world = World.getWorld();
		const visualization = boardVisualization.visualizeBoard(world, options);
		const homeZoneVisualization = playerId && world.players[playerId]
			? boardVisualization.visualizePlayerHomeZone(world, playerId)
			: null;
		const gameSummary = boardVisualization.generateGameSummary(world);
		res.json({
			success: true,
			visualization,
			homeZoneVisualization,
			gameSummary,
		});
	} catch (err) {
		console.error('Error generating world visualization:', err);
		res.status(500).json({ success: false, message: err.message });
	}
});

router.post('/computer-players/register', (req, res) => {
	const { name, apiEndpoint, description } = req.body || {};
	if (!name) {
		return res.status(400).json({ success: false, message: 'Name is required' });
	}

	const playerId = `ext-ai-${uuidv4().substring(0, 8)}`;
	const apiToken = generateApiToken();
	externalComputerPlayers[playerId] = {
		id: playerId,
		name,
		apiEndpoint,
		description,
		createdAt: new Date().toISOString(),
	};
	externalApiTokens[playerId] = apiToken;

	// Seed a real player record so the playerId is recognised by
	// the socket layer the moment the bot connects. Without this
	// step `connection.js` rejected the cookie-bound id as
	// "unknown" and minted a fresh UUID, throwing the token away.
	try {
		World.upsertPlayer(playerId, {
			name: String(name).slice(0, 32),
			isComputer: true,
			external: true,
			lastActiveAt: Date.now(),
		});
	} catch (err) {
		console.warn('[API] Failed to seed World record for external AI:', err.message);
	}

	res.json({
		success: true,
		message: 'External computer player registered. Connect to Socket.IO with the playerId + apiToken in the handshake query (or cookies) to claim this identity.',
		playerId,
		apiToken,
		socketHandshake: {
			query: { playerId, apiToken },
			cookies: { tetches_player_id: playerId, tetches_api_token: apiToken },
		},
	});
});

router.get('/computer-players', (_req, res) => {
	res.json({
		success: true,
		computerPlayers: Object.values(externalComputerPlayers).map(p => ({
			id: p.id,
			name: p.name,
			description: p.description,
			createdAt: p.createdAt,
		})),
	});
});

module.exports = router;
module.exports.validateApiToken = validateApiToken;
