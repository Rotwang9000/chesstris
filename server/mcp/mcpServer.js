/**
 * Tetches MCP server — lets any MCP-capable agent play the game.
 *
 * Transport: MCP Streamable HTTP mounted at `/mcp` on the game server.
 * Each MCP session gets its own registered external-AI identity and a
 * loopback Socket.IO connection, so every tool call flows through the
 * exact same validated gameplay contract as a browser or external bot
 * (`docs/external-api.md`) — no parallel rule implementation to drift.
 *
 *   MCP client ──HTTP──▶ /mcp ──(per-session bridge)──▶ socket.io ──▶ world
 *
 * Sessions idle out after `SESSION_IDLE_MS`; closing the session (or
 * the DELETE request MCP clients send) disconnects the bridge socket.
 * The player record itself lives on under the usual world lifecycle
 * rules, so a reconnecting agent could re-register and carry on.
 */

'use strict';

const { randomUUID } = require('crypto');
const express = require('express');
const { z } = require('zod');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { isInitializeRequest } = require('@modelcontextprotocol/sdk/types.js');
const { io: ioClient } = require('socket.io-client');
const { registerExternalComputerPlayer } = require('../../routes/api');

const SESSION_IDLE_MS = 30 * 60 * 1000;
const SESSION_SWEEP_MS = 60 * 1000;
const ACK_TIMEOUT_MS = 8000;
const CONNECT_TIMEOUT_MS = 8000;
const DEFAULT_STATE_RADIUS = 20;
const MAX_STATE_CELLS = 600;

const SERVER_INSTRUCTIONS = `Tetches is a live multiplayer game fusing chess and Tetris on one
shared, persistent board. You are a real player: drop tetrominoes to grow terrain, then move
chess pieces across it. Capture enemy kings; protect your own.

Typical flow: how_to_play → join_world → loop(get_state → place_tetromino / move_piece).
For a private fight: create_battle (share the code) or join_battle, then start_battle.
Placement must touch terrain connected to your king. Cooldowns: ~800ms between tetromino
placements, ~500ms between chess moves — pace your calls.`;

const HOW_TO_PLAY = `TETCHES — RULES FOR AGENTS

World: one shared persistent board (id global_game). Everyone plays simultaneously — no turns
between players. Your personal cycle alternates: place a tetromino, then optionally move a
chess piece, repeat.

Terrain: the board only exists where tetrominoes have been placed (plus home zones). A
tetromino placement must (a) not overlap pieces, (b) touch at least one cell that is connected
back to your king. Placed cells become YOUR territory. Rows of 8+ aligned cells clear
(Tetris-style), which can cut territory adrift — disconnected islands decay.

Chess: pieces move by standard chess rules BUT only onto existing board cells. Moving onto an
enemy piece captures it. Pawns promote after advancing 8 cells. Capturing a KING eliminates
that player entirely; their territory is claimable. Check rules apply — attacking a king opens
a short escape window before the capture lands.

Cooldowns: tetromino_placed ~800ms, chess_move ~500ms per player. The ack tells you if you
were rate-limited or the move was invalid, with a reason.

Battles: private 2-4 seat arenas away from the shared world. create_battle gives a code;
humans open https://tetches.com/?battle=CODE, agents call join_battle. The host starts it;
bots fill empty seats. Joining an ACTIVE battle takes over a bot seat. Last king standing wins.

Strategy notes: build a compact connected territory bridge toward opponents, keep your king
walled, and don't leave sliding pieces (rook/bishop/queen) on clearable rows. get_state
returns cells near your king plus all your pieces — call it before each decision.`;

/** Wait for a socket.io client to reach connected state. */
function waitForConnect(socket) {
	return new Promise((resolve, reject) => {
		if (socket.connected) {
			resolve();
			return;
		}
		const timer = setTimeout(() => {
			cleanup();
			reject(new Error('Timed out connecting to the game server'));
		}, CONNECT_TIMEOUT_MS);
		const onConnect = () => { cleanup(); resolve(); };
		const onError = (err) => { cleanup(); reject(err instanceof Error ? err : new Error(String(err))); };
		function cleanup() {
			clearTimeout(timer);
			socket.off('connect', onConnect);
			socket.off('connect_error', onError);
		}
		socket.on('connect', onConnect);
		socket.on('connect_error', onError);
	});
}

/**
 * A per-MCP-session bridge: one registered identity + one loopback
 * socket. Lazy — nothing is registered until the first tool that
 * needs the game.
 */
function createBridge({ getSelfPort, agentName }) {
	let identity = null;
	let socket = null;

	async function ensureSocket() {
		if (socket && socket.connected) return socket;
		if (!identity) {
			identity = registerExternalComputerPlayer(agentName || 'MCP Agent', {
				description: 'MCP session player',
			});
		}
		if (!socket) {
			const port = getSelfPort();
			if (!port) throw new Error('Game server port unavailable');
			socket = ioClient(`http://127.0.0.1:${port}`, {
				query: { playerId: identity.playerId, apiToken: identity.apiToken },
				transports: ['websocket'],
				reconnection: true,
				reconnectionAttempts: 5,
			});
		}
		await waitForConnect(socket);
		return socket;
	}

	async function emitAck(event, payload = {}) {
		const sock = await ensureSocket();
		return new Promise((resolve, reject) => {
			const timer = setTimeout(
				() => reject(new Error(`Game server did not answer '${event}' within ${ACK_TIMEOUT_MS}ms`)),
				ACK_TIMEOUT_MS
			);
			sock.emit(event, payload, (response) => {
				clearTimeout(timer);
				resolve(response == null ? { success: true } : response);
			});
		});
	}

	function close() {
		if (socket) {
			try { socket.disconnect(); } catch (_e) { /* already down */ }
			socket = null;
		}
	}

	return {
		emitAck,
		close,
		get playerId() { return identity ? identity.playerId : null; },
	};
}

/** items in a board cell → compact one-line summary for agents. */
function summariseCell(contents) {
	if (!Array.isArray(contents) || contents.length === 0) return null;
	const summary = {};
	for (const item of contents) {
		if (!item) continue;
		if (item.type === 'chess') {
			summary.piece = { id: item.pieceId, type: item.pieceType, player: item.player };
		} else if (item.battleRing) {
			summary.ring = true;
		} else if (item.type === 'home') {
			summary.home = item.player;
		} else if (item.player != null && summary.owner === undefined) {
			summary.owner = item.player;
		}
	}
	return summary;
}

/**
 * Compact world view centred on the acting player's king: their
 * pieces, nearby cells, nearby enemy pieces, and battle status.
 * A raw full-state payload can be hundreds of KB — this stays small.
 */
async function buildCompactState(bridge, radius) {
	const [stateAck, battleAck] = await Promise.all([
		bridge.emitAck('get_game_state', {}),
		bridge.emitAck('battle_state', {}),
	]);
	if (!stateAck || stateAck.success === false) {
		return { success: false, error: stateAck?.error || 'get_game_state failed' };
	}
	const state = stateAck.state || {};
	const battle = battleAck?.battle || null;

	// While a battle is active, gameplay acts as the SEAT id.
	let actingId = bridge.playerId;
	if (battle && battle.status === 'active') {
		const seat = (battle.seats || []).find(s => !s.isAi && String(s.controlledBy) === String(bridge.playerId));
		if (seat) actingId = seat.seatId;
	}

	const allPieces = Array.isArray(state.chessPieces) ? state.chessPieces : [];
	const myPieces = allPieces.filter(p => p && String(p.player) === String(actingId));
	const king = myPieces.find(p => String(p.type || '').toUpperCase() === 'KING');
	const centre = king?.position
		|| myPieces[0]?.position
		|| (battle && battle.centre)
		|| { x: 0, z: 0 };

	const cells = [];
	const rawCells = state.board?.cells || {};
	for (const [key, contents] of Object.entries(rawCells)) {
		const [x, zz] = key.split(',').map(Number);
		if (!Number.isFinite(x) || !Number.isFinite(zz)) continue;
		if (Math.abs(x - centre.x) > radius || Math.abs(zz - centre.z) > radius) continue;
		const summary = summariseCell(contents);
		if (summary) cells.push({ x, z: zz, ...summary });
	}
	// Nearest first, hard cap — an agent never needs 10,000 cells.
	cells.sort((a, b) =>
		(Math.abs(a.x - centre.x) + Math.abs(a.z - centre.z))
		- (Math.abs(b.x - centre.x) + Math.abs(b.z - centre.z)));
	const clipped = cells.slice(0, MAX_STATE_CELLS);

	const enemyPiecesNearby = allPieces.filter(p =>
		p && String(p.player) !== String(actingId) && p.position
		&& Math.abs(p.position.x - centre.x) <= radius
		&& Math.abs(p.position.z - centre.z) <= radius
	).map(p => ({ id: p.id, type: p.type, player: p.player, position: p.position }));

	return {
		success: true,
		playerId: bridge.playerId,
		actingAs: actingId,
		inWorld: myPieces.length > 0,
		centre,
		radius,
		myPieces: myPieces.map(p => ({ id: p.id, type: p.type, position: p.position })),
		enemyPiecesNearby,
		cells: clipped,
		cellsTruncated: cells.length > clipped.length,
		battle,
		hint: myPieces.length === 0
			? 'You have no pieces yet — call join_world (shared world) or create_battle/join_battle first.'
			: 'Place tetrominoes touching your territory; move pieces onto existing cells only.',
	};
}

/** Wrap a JS object as an MCP text result. */
function jsonResult(value) {
	return { content: [{ type: 'text', text: JSON.stringify(value, null, 1) }] };
}

function textResult(text) {
	return { content: [{ type: 'text', text }] };
}

/** Build the McpServer (tool definitions) for one session's bridge. */
function buildMcpServer(bridge) {
	const server = new McpServer(
		{ name: 'tetches', version: '1.0.0' },
		{ instructions: SERVER_INSTRUCTIONS }
	);

	server.registerTool('how_to_play', {
		description: 'The Tetches rules, cooldowns and strategy notes. Read this before anything else.',
		inputSchema: {},
	}, async () => textResult(HOW_TO_PLAY));

	server.registerTool('join_world', {
		description: 'Join the shared world: creates your kingdom (home zone + 16 chess pieces). Not needed for battles.',
		inputSchema: {
			playerName: z.string().max(20).optional().describe('Display name for your player'),
		},
	}, async ({ playerName }) => {
		const ack = await bridge.emitAck('join_game', { playerName: playerName || 'MCP Agent' });
		return jsonResult({
			success: ack?.success !== false,
			playerId: bridge.playerId,
			gameId: ack?.gameId,
			error: ack?.error,
			next: 'Call get_state, then place_tetromino to grow territory.',
		});
	});

	server.registerTool('get_state', {
		description: 'Compact board view: your pieces, cells and enemy pieces near your king, plus battle status.',
		inputSchema: {
			radius: z.number().int().min(5).max(60).optional()
				.describe(`Cell radius around your king to include (default ${DEFAULT_STATE_RADIUS})`),
		},
	}, async ({ radius }) => jsonResult(await buildCompactState(bridge, radius || DEFAULT_STATE_RADIUS)));

	server.registerTool('place_tetromino', {
		description: 'Place a tetromino at (x, z). Must not overlap pieces and must touch territory connected to your king. ~800ms cooldown.',
		inputSchema: {
			pieceType: z.enum(['I', 'J', 'L', 'O', 'S', 'T', 'Z']).describe('Tetromino shape'),
			rotation: z.number().int().min(0).max(3).describe('Rotation step (0-3)'),
			x: z.number().int().describe('Anchor cell x'),
			z: z.number().int().describe('Anchor cell z'),
		},
	}, async ({ pieceType, rotation, x, z: zz }) => {
		const ack = await bridge.emitAck('tetromino_placed', {
			tetromino: { pieceType, type: pieceType, rotation, position: { x, z: zz } },
		});
		return jsonResult(ack);
	});

	server.registerTool('move_piece', {
		description: 'Move one of your chess pieces (by id from get_state) to (x, z). Standard chess rules, existing cells only. ~500ms cooldown.',
		inputSchema: {
			pieceId: z.string().describe('Your piece id (see get_state myPieces)'),
			x: z.number().int().describe('Target cell x'),
			z: z.number().int().describe('Target cell z'),
		},
	}, async ({ pieceId, x, z: zz }) => {
		const ack = await bridge.emitAck('chess_move', {
			pieceId,
			targetPosition: { x, z: zz },
		});
		return jsonResult(ack);
	});

	server.registerTool('create_battle', {
		description: 'Open a private 2-4 seat battle arena. Returns a share code; humans join at https://tetches.com/?battle=CODE.',
		inputSchema: {
			seats: z.number().int().min(2).max(4).optional().describe('Total seats including you (default 2)'),
		},
	}, async ({ seats }) => jsonResult(await bridge.emitAck('battle_create', { seatCount: seats || 2 })));

	server.registerTool('join_battle', {
		description: 'Join a battle by code: takes a lobby seat, or takes over a live bot seat if the battle already started.',
		inputSchema: {
			code: z.string().min(4).max(8).describe('The battle share code'),
		},
	}, async ({ code }) => jsonResult(await bridge.emitAck('battle_join', { code })));

	server.registerTool('start_battle', {
		description: 'Start your battle (host only). Empty seats are filled with built-in bots; every seat gets a fresh kingdom.',
		inputSchema: {},
	}, async () => jsonResult(await bridge.emitAck('battle_start', {})));

	server.registerTool('battle_state', {
		description: 'Your current battle: status, seats (who is human/bot/eliminated), arena centre, winner.',
		inputSchema: {},
	}, async () => jsonResult(await bridge.emitAck('battle_state', {})));

	server.registerTool('leave_battle', {
		description: 'Leave your battle. In a lobby this frees the seat (host leaving cancels it); mid-battle it forfeits.',
		inputSchema: {},
	}, async () => jsonResult(await bridge.emitAck('battle_leave', {})));

	return server;
}

/**
 * Express router implementing MCP Streamable HTTP with session
 * management (POST = requests, GET = server event stream, DELETE =
 * session termination).
 *
 * @param {{ getSelfPort: () => number|null }} deps Port resolver for
 *   the loopback bridge (known only after `server.listen`).
 */
function createMcpRouter({ getSelfPort }) {
	if (typeof getSelfPort !== 'function') {
		throw new Error('createMcpRouter: getSelfPort function required');
	}

	const router = express.Router();
	/** @type {Map<string, {transport: any, bridge: any, lastSeen: number}>} */
	const sessions = new Map();

	function destroySession(sid) {
		const entry = sessions.get(sid);
		if (!entry) return;
		sessions.delete(sid);
		try { entry.bridge.close(); } catch (_e) { /* already closed */ }
		try { entry.transport.close(); } catch (_e) { /* already closed */ }
	}

	// Idle sweep — an abandoned agent session must not hold a socket
	// (and a world identity's "online" status) forever.
	const sweeper = setInterval(() => {
		const now = Date.now();
		for (const [sid, entry] of sessions.entries()) {
			if (now - entry.lastSeen > SESSION_IDLE_MS) {
				console.log(`[MCP] Session ${sid} idled out`);
				destroySession(sid);
			}
		}
	}, SESSION_SWEEP_MS);
	if (typeof sweeper.unref === 'function') sweeper.unref();

	router.post('/', async (req, res) => {
		try {
			const sid = req.headers['mcp-session-id'];
			if (sid && sessions.has(sid)) {
				const entry = sessions.get(sid);
				entry.lastSeen = Date.now();
				await entry.transport.handleRequest(req, res, req.body);
				return;
			}
			if (sid) {
				res.status(404).json({
					jsonrpc: '2.0',
					error: { code: -32001, message: 'Session not found (it may have idled out) — re-initialize' },
					id: null,
				});
				return;
			}
			if (!isInitializeRequest(req.body)) {
				res.status(400).json({
					jsonrpc: '2.0',
					error: { code: -32000, message: 'Bad request: no session and not an initialize request' },
					id: null,
				});
				return;
			}

			// New session: register identity lazily via the bridge and
			// hand the transport a fresh session id.
			const clientName = req.body?.params?.clientInfo?.name;
			const bridge = createBridge({
				getSelfPort,
				agentName: clientName ? `MCP ${String(clientName).slice(0, 14)}` : 'MCP Agent',
			});
			const transport = new StreamableHTTPServerTransport({
				sessionIdGenerator: () => randomUUID(),
				onsessioninitialized: (newSid) => {
					sessions.set(newSid, { transport, bridge, lastSeen: Date.now() });
					console.log(`[MCP] Session ${newSid} opened (${clientName || 'unknown client'})`);
				},
			});
			transport.onclose = () => {
				if (transport.sessionId) destroySession(transport.sessionId);
			};

			const mcpServer = buildMcpServer(bridge);
			await mcpServer.connect(transport);
			await transport.handleRequest(req, res, req.body);
		} catch (err) {
			console.error('[MCP] POST failed:', err);
			if (!res.headersSent) {
				res.status(500).json({
					jsonrpc: '2.0',
					error: { code: -32603, message: 'Internal server error' },
					id: null,
				});
			}
		}
	});

	// GET = SSE notification stream; DELETE = explicit session close.
	const handleSessionRequest = async (req, res) => {
		try {
			const sid = req.headers['mcp-session-id'];
			const entry = sid ? sessions.get(sid) : null;
			if (!entry) {
				res.status(sid ? 404 : 400).send(sid ? 'Session not found' : 'Mcp-Session-Id header required');
				return;
			}
			entry.lastSeen = Date.now();
			await entry.transport.handleRequest(req, res);
		} catch (err) {
			console.error(`[MCP] ${req.method} failed:`, err);
			if (!res.headersSent) res.status(500).send('Internal server error');
		}
	};
	router.get('/', handleSessionRequest);
	router.delete('/', handleSessionRequest);

	router._sessions = sessions;   // exposed for tests
	router._destroyAll = () => {
		clearInterval(sweeper);
		for (const sid of [...sessions.keys()]) destroySession(sid);
	};

	return router;
}

module.exports = { createMcpRouter, HOW_TO_PLAY };
