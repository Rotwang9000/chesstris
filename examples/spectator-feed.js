#!/usr/bin/env node
/**
 * Spectator / activity-feed listener — the minimum viable
 * "watch the world go by" client.
 *
 * Connects to Tetches without claiming a player slot, asks for a
 * snapshot of the current activity log, then streams every live
 * event. Use this as the skeleton for fly-through cameras, Discord
 * bridges, leaderboard scrapers, etc.
 *
 * Usage:
 *
 *     node examples/spectator-feed.js
 *     SERVER=https://tetches.com node examples/spectator-feed.js
 *
 * The full protocol is documented in `docs/external-api.md`.
 */

const { io: ioClient } = require('socket.io-client');

const SERVER = process.env.SERVER || 'http://localhost:3022';

function describe(event) {
	const { type, payload = {}, t } = event;
	const time = new Date(t).toISOString().slice(11, 19);
	switch (type) {
		case 'tetromino_placed':
			return `[${time}] ${payload.playerName || payload.playerId} placed ${payload.pieceType} (${payload.cellCount} cells)`;
		case 'chess_move':
			return `[${time}] ${payload.playerName || payload.playerId} ${payload.pieceType} → (${payload.to?.x},${payload.to?.z})${payload.captured ? ` ⚔ ${payload.captured}` : ''}`;
		case 'rows_cleared':
			return `[${time}] ${payload.playerName || 'someone'} cleared ${payload.rowCount} row(s)${payload.iteration ? ` (chain ×${payload.iteration + 1})` : ''}`;
		case 'player_joined':
			return `[${time}] ${payload.playerName || payload.playerId} joined`;
		case 'player_left':
		case 'player_reaped':
			return `[${time}] ${payload.playerName || payload.playerId} left`;
		case 'powerup_spawned':
			return `[${time}] ${payload.piece} orb spawned`;
		case 'powerup_claimed':
			return `[${time}] ${payload.playerName || payload.playerId} claimed ${payload.piece} orb`;
		case 'chess_piece_captured':
			return `[${time}] ${payload.attackerName || payload.attackerId} captured ${payload.pieceType}`;
		default:
			return `[${time}] ${type} ${JSON.stringify(payload).slice(0, 80)}`;
	}
}

const socket = ioClient(SERVER, {
	query: { playerName: `Spectator-${Math.random().toString(36).slice(2, 6)}` },
	transports: ['websocket'],
});

socket.on('connect', () => {
	console.log(`[spectator] connected (${socket.id}) on ${SERVER}`);
	// `get_activity_log` returns the rolling buffer (last ~200
	// events). We register the live listener BEFORE asking for the
	// snapshot so we don't miss anything in between.
	socket.emit('get_activity_log', {}, (resp) => {
		if (!resp || !resp.success) {
			console.warn('[spectator] activity snapshot failed', resp);
			return;
		}
		console.log(`[spectator] backlog: ${resp.events.length} event(s)`);
		for (const ev of resp.events) console.log(describe(ev));
	});
});

socket.on('activity_event', (ev) => {
	if (!ev || !ev.type) return;
	console.log(describe(ev));
});

socket.on('game_update', (update) => {
	// Pretty-print one line per state delta so you can verify the
	// stream is alive even when nothing exciting is happening in
	// the activity log.
	const players = update?.players ? Object.keys(update.players).length : '?';
	const cells = update?.board?.cells ? Object.keys(update.board.cells).length : '?';
	console.log(`[spectator] state: players=${players} cells=${cells} full=${!!update?.fullUpdate}`);
});

socket.on('disconnect', (reason) => {
	console.log(`[spectator] disconnected (${reason})`);
});

process.on('SIGINT', () => {
	console.log('\n[spectator] shutting down');
	try { socket.disconnect(); } catch (_e) { /* socket already closed */ }
	process.exit(0);
});
