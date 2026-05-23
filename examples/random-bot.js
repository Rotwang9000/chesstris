#!/usr/bin/env node
/**
 * Random-move Tetches bot — the minimum viable external player.
 *
 * Demonstrates the full external-AI loop: register over REST,
 * connect with the issued playerId + apiToken via Socket.IO, join
 * the world, react to `new_tetromino`, and submit random-but-valid
 * tetromino + chess moves.
 *
 * Usage:
 *
 *     node examples/random-bot.js                            # localhost:3022
 *     SERVER=https://tetches.com node examples/random-bot.js
 *     BOT_NAME='SwedishChef' node examples/random-bot.js
 *
 * Requires `socket.io-client` (already in this repo's deps).
 *
 * The full protocol is documented in `docs/external-api.md`.
 */

const { io: ioClient } = require('socket.io-client');

const SERVER = process.env.SERVER || 'http://localhost:3022';
const BOT_NAME = process.env.BOT_NAME || 'RandomBot';

// ── Tiny helpers ────────────────────────────────────────────────────────────

function randomFrom(arr) {
	return arr[Math.floor(Math.random() * arr.length)];
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── REST: register the bot ─────────────────────────────────────────────────

async function registerBot() {
	const res = await fetch(`${SERVER}/api/computer-players/register`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			name: BOT_NAME,
			description: 'examples/random-bot.js',
		}),
	});
	if (!res.ok) {
		throw new Error(`Register failed (${res.status}): ${await res.text()}`);
	}
	const json = await res.json();
	if (!json.success) throw new Error(`Register failed: ${JSON.stringify(json)}`);
	console.log(`[register] playerId=${json.playerId} token=${json.apiToken.slice(0, 8)}…`);
	return json;
}

// ── Socket.IO: bot main loop ───────────────────────────────────────────────

function connectSocket({ playerId, apiToken }) {
	const socket = ioClient(SERVER, {
		// Send the credentials in the handshake query — the server's
		// `connection.js` reads them there or from cookies, either works.
		query: { playerId, apiToken, playerName: BOT_NAME },
		transports: ['websocket'],
		reconnection: true,
	});
	return socket;
}

function emitWithAck(socket, event, payload) {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(`${event} timed out`)), 5000);
		socket.emit(event, payload, (response) => {
			clearTimeout(timer);
			if (response && response.error) return reject(new Error(response.error));
			resolve(response);
		});
	});
}

/**
 * Collect anchor cells we can build from — every cell we already
 * own, plus our king position as a fallback. This mirrors the
 * `collectPlacementAnchors` helper the in-process AI uses (see
 * `server/ai/actions.js`).
 */
function collectAnchors(state, ourId) {
	const anchors = [];
	const seen = new Set();
	const push = (x, z) => {
		const key = `${x},${z}`;
		if (seen.has(key)) return;
		seen.add(key);
		anchors.push({ x, z });
	};

	for (const [key, contents] of Object.entries(state.board?.cells || {})) {
		if (!Array.isArray(contents)) continue;
		if (contents.some((item) => item && String(item.player) === String(ourId))) {
			const [x, z] = key.split(',').map(Number);
			push(x, z);
		}
	}
	for (const piece of state.chessPieces || []) {
		if (String(piece.player) !== String(ourId)) continue;
		push(piece.position.x, piece.position.z);
	}
	return anchors;
}

/**
 * Try up to `maxAttempts` random anchor + offset + rotation combos
 * until the server accepts one. The server validates the actual
 * shape against the board, so we just probe candidates and rely on
 * the `invalid_placement` ack for negatives. This is the same
 * pattern the built-in AI uses (`maxAttempts = 60`,
 * `offsetRange = 4`).
 */
async function placeTetromino(socket, tetromino, state, ourId) {
	const anchors = collectAnchors(state, ourId);
	const pieceType = tetromino.pieceType || tetromino.type;
	const maxAttempts = 40;
	const offsetRange = 4;
	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		const anchor = anchors.length > 0
			? randomFrom(anchors)
			: { x: 0, z: 0 };
		const dx = Math.floor(Math.random() * (offsetRange * 2 + 1)) - offsetRange;
		const dz = Math.floor(Math.random() * (offsetRange * 2 + 1)) - offsetRange;
		const target = { x: anchor.x + dx, z: anchor.z + dz };
		const rotation = Math.floor(Math.random() * 4);
		const payload = {
			tetromino: {
				pieceType,
				type: pieceType,
				rotation,
				position: target,
			},
		};
		try {
			await emitWithAck(socket, 'tetromino_placed', payload);
			console.log(`[move] placed ${pieceType}@rot${rotation} at (${target.x},${target.z})`);
			return true;
		} catch (err) {
			if (/rate_limited/i.test(err.message)) {
				await sleep(800);
				continue;
			}
			// invalid_placement / something_else → try a different anchor.
		}
	}
	console.log(`[move] gave up after ${maxAttempts} attempts for ${pieceType}`);
	return false;
}

/**
 * Request a fresh tetromino from the server and try to place it.
 * The browser uses a client-side 7-bag for this; external bots can
 * either replicate that bag or, like this example, ask the server
 * for the next piece via `request_tetromino` each time.
 */
async function requestAndPlaceTetromino(socket, state, ourId) {
	try {
		const resp = await emitWithAck(socket, 'request_tetromino', {});
		if (!resp || !resp.success || !resp.tetromino) {
			console.log('[move] no tetromino issued — waiting');
			return false;
		}
		return await placeTetromino(socket, resp.tetromino, state, ourId);
	} catch (err) {
		console.log(`[move] request_tetromino failed — ${err.message}`);
		return false;
	}
}

/**
 * Attempt one chess move. We pick a random piece + a random
 * 1-step offset and try it. On failure we *don't* retry — the
 * server logs every rejected chess move to the public activity
 * feed, so a demo bot that probes every direction would pollute
 * the feed for everyone else. The caller is expected to call
 * this on an interval; missed turns are cheap.
 */
async function tryRandomChessMove(socket, state, ourId) {
	const ourPieces = (state.chessPieces || [])
		.filter((p) => String(p.player) === String(ourId));
	if (ourPieces.length === 0) return false;
	const piece = randomFrom(ourPieces);
	const offset = randomFrom([
		{ dx: 1, dz: 0 }, { dx: -1, dz: 0 },
		{ dx: 0, dz: 1 }, { dx: 0, dz: -1 },
		{ dx: 1, dz: 1 }, { dx: 1, dz: -1 },
		{ dx: -1, dz: 1 }, { dx: -1, dz: -1 },
	]);
	const target = { x: piece.position.x + offset.dx, z: piece.position.z + offset.dz };
	try {
		await emitWithAck(socket, 'chess_move', {
			pieceId: piece.id,
			targetPosition: target,
		});
		console.log(`[chess] ${piece.type} ${piece.id} → (${target.x},${target.z})`);
		return true;
	} catch (_err) {
		return false;
	}
}

async function main() {
	console.log(`[bot] connecting to ${SERVER} as "${BOT_NAME}"`);
	const { playerId, apiToken } = await registerBot();
	const socket = connectSocket({ playerId, apiToken });

	let currentState = null;

	socket.on('connect', async () => {
		console.log(`[bot] socket connected (${socket.id})`);
		try {
			const joinResp = await emitWithAck(socket, 'join_game', { playerName: BOT_NAME });
			currentState = joinResp?.gameState || null;
			console.log('[bot] joined world');
		} catch (err) {
			console.error('[bot] join_game failed:', err.message);
		}
	});

	socket.on('auth_error', (info) => {
		console.error(`[bot] auth_error: ${JSON.stringify(info)}`);
		process.exit(2);
	});

	socket.on('game_update', (update) => {
		// Cache the latest state so move handlers have something to work with.
		if (update?.fullUpdate || !currentState) {
			currentState = update;
		} else {
			currentState = { ...currentState, ...update };
		}
	});

	socket.on('new_tetromino', async ({ tetromino }) => {
		if (!tetromino) return;
		await sleep(200);
		await placeTetromino(socket, tetromino, currentState || {}, playerId);
	});

	socket.on('no_valid_chess_moves', async () => {
		console.log('[chess] server says no valid moves; waiting for new tetromino');
	});

	socket.on('turn_update', async (payload) => {
		if (payload?.phase === 'chess') {
			await sleep(150);
			await tryRandomChessMove(socket, currentState || {}, playerId);
		}
	});

	// Self-driving move loop. We don't rely on `new_tetromino` push
	// signals (the server only emits them in specific cases like
	// "no chess moves left after a placement") — we just request a
	// fresh piece and place it whenever we're idle. Same for chess:
	// the server has no "your turn" event for bots that already
	// placed a tetromino, so we just attempt a chess move on a
	// short interval and rely on the server to reject the move with
	// "already placed" if it's not actually our chess phase yet.
	setInterval(async () => {
		if (!socket.connected) return;
		await requestAndPlaceTetromino(socket, currentState || {}, playerId);
	}, 2500);

	setInterval(async () => {
		if (!socket.connected) return;
		await tryRandomChessMove(socket, currentState || {}, playerId);
	}, 1800);

	socket.on('disconnect', (reason) => {
		console.log(`[bot] disconnected (${reason})`);
	});

	process.on('SIGINT', () => {
		console.log('\n[bot] shutting down');
		try { socket.disconnect(); } catch (_e) { /* socket already closed */ }
		process.exit(0);
	});
}

main().catch((err) => {
	console.error('[bot] fatal:', err);
	process.exit(1);
});
