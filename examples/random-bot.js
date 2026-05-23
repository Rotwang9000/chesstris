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
 * Pick a random adjacent cell to one of our own pieces. This keeps
 * the tetromino on a path back to our king, which the server
 * requires. It's not a smart strategy — it's the simplest valid one.
 */
function chooseTetrominoPosition(state, ourId) {
	const ourCells = [];
	for (const [key, contents] of Object.entries(state.board?.cells || {})) {
		if (!Array.isArray(contents)) continue;
		const ownsCell = contents.some((item) => item && String(item.player) === String(ourId));
		if (ownsCell) {
			const [x, z] = key.split(',').map(Number);
			ourCells.push({ x, z });
		}
	}
	if (ourCells.length === 0) return null;
	const anchor = randomFrom(ourCells);
	const offset = randomFrom([
		{ dx: 1, dz: 0 }, { dx: -1, dz: 0 },
		{ dx: 0, dz: 1 }, { dx: 0, dz: -1 },
	]);
	return { x: anchor.x + offset.dx, z: anchor.z + offset.dz };
}

async function placeTetromino(socket, tetromino, state, ourId) {
	const target = chooseTetrominoPosition(state, ourId)
		|| { x: 0, z: 0 };
	const payload = {
		tetromino: {
			pieceType: tetromino.pieceType || tetromino.type,
			type: tetromino.type || tetromino.pieceType,
			rotation: Math.floor(Math.random() * 4),
			position: target,
		},
	};
	try {
		await emitWithAck(socket, 'tetromino_placed', payload);
		console.log(`[move] placed ${payload.tetromino.pieceType} at (${target.x},${target.z})`);
	} catch (err) {
		console.log(`[move] tetromino rejected — ${err.message}`);
	}
}

async function tryRandomChessMove(socket, state, ourId) {
	const ourPieces = (state.chessPieces || [])
		.filter((p) => String(p.player) === String(ourId));
	if (ourPieces.length === 0) return false;

	for (const piece of ourPieces.sort(() => Math.random() - 0.5)) {
		const offsets = [
			{ dx: 1, dz: 0 }, { dx: -1, dz: 0 },
			{ dx: 0, dz: 1 }, { dx: 0, dz: -1 },
			{ dx: 1, dz: 1 }, { dx: 1, dz: -1 },
			{ dx: -1, dz: 1 }, { dx: -1, dz: -1 },
		].sort(() => Math.random() - 0.5);
		for (const o of offsets) {
			const target = { x: piece.position.x + o.dx, z: piece.position.z + o.dz };
			try {
				await emitWithAck(socket, 'chess_move', {
					pieceId: piece.id,
					targetPosition: target,
				});
				console.log(`[chess] ${piece.type} ${piece.id} → (${target.x},${target.z})`);
				return true;
			} catch (err) {
				// Try the next direction / piece.
			}
		}
	}
	return false;
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
			// Open with one chess move to demonstrate the chess loop.
			await tryRandomChessMove(socket, currentState, playerId);
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
