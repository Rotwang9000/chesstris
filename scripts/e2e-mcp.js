/**
 * MCP end-to-end smoke test — drives the LIVE /mcp endpoint exactly
 * like an external agent would: initialize a session, list tools,
 * join the world, read state, place a tetromino, then run a battle
 * lobby round-trip.
 *
 *   node scripts/e2e-mcp.js http://localhost:3670
 *   E2E_URL=https://tetches.com node scripts/e2e-mcp.js
 */

'use strict';

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');

const SERVER_URL = process.argv[2] || process.env.E2E_URL || 'http://localhost:3670';

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
	if (condition) {
		passed++;
		console.log(`  ✓ ${label}`);
	} else {
		failed++;
		console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
	}
}

function parseToolJson(result) {
	const text = result?.content?.find(c => c.type === 'text')?.text || '';
	try { return JSON.parse(text); } catch (_e) { return { _raw: text }; }
}

async function main() {
	console.log(`[e2e-mcp] target: ${SERVER_URL}/mcp`);

	const client = new Client({ name: 'tetches-e2e', version: '1.0.0' });
	const transport = new StreamableHTTPClientTransport(new URL('/mcp', SERVER_URL));
	await client.connect(transport);
	check('session initialised', true);

	// ── Tool discovery ────────────────────────────────────────────────
	const tools = await client.listTools();
	const names = tools.tools.map(t => t.name);
	for (const expected of [
		'how_to_play', 'join_world', 'get_state', 'place_tetromino', 'move_piece',
		'create_battle', 'join_battle', 'start_battle', 'battle_state', 'leave_battle',
	]) {
		check(`tool registered: ${expected}`, names.includes(expected));
	}

	// ── Rules ─────────────────────────────────────────────────────────
	const rules = await client.callTool({ name: 'how_to_play', arguments: {} });
	const rulesText = rules?.content?.[0]?.text || '';
	check('how_to_play returns the rules', rulesText.includes('TETCHES') && rulesText.includes('Cooldowns'));

	// ── Join the shared world ─────────────────────────────────────────
	const joined = parseToolJson(await client.callTool({
		name: 'join_world', arguments: { playerName: 'E2E MCP' },
	}));
	check('join_world succeeds', joined.success === true, JSON.stringify(joined).slice(0, 200));
	check('join_world reports a playerId', typeof joined.playerId === 'string' && joined.playerId.length > 0);

	// ── Read state ────────────────────────────────────────────────────
	const state = parseToolJson(await client.callTool({
		name: 'get_state', arguments: { radius: 15 },
	}));
	check('get_state succeeds', state.success === true);
	check('get_state sees own pieces', Array.isArray(state.myPieces) && state.myPieces.length >= 16,
		`got ${state.myPieces?.length}`);
	check('get_state includes nearby cells', Array.isArray(state.cells) && state.cells.length > 0);
	const king = state.myPieces?.find(p => String(p.type).toUpperCase() === 'KING');
	check('king visible in state', !!king);

	// ── Place a tetromino next to own territory ───────────────────────
	// Probe positions around own cells until the server accepts one —
	// exactly what a real agent would do with the ack feedback.
	const own = state.cells.filter(c => c.owner === state.actingAs || c.home === state.actingAs);
	let placedOk = false;
	let lastError = '';
	outer:
	for (const cell of own) {
		for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2], [1, 2], [-1, -2]]) {
			const ack = parseToolJson(await client.callTool({
				name: 'place_tetromino',
				arguments: { pieceType: 'O', rotation: 0, x: cell.x + dx, z: cell.z + dz },
			}));
			if (ack.success) { placedOk = true; break outer; }
			lastError = ack.error || ack.reason || 'unknown';
			// Respect the placement cooldown between probes.
			await new Promise(r => setTimeout(r, 900));
		}
	}
	check('place_tetromino lands a piece', placedOk, lastError);

	// ── Battle round-trip ─────────────────────────────────────────────
	const battle = parseToolJson(await client.callTool({
		name: 'create_battle', arguments: { seats: 2 },
	}));
	check('create_battle returns a code', battle.success === true && /^[A-Z2-9]{6}$/.test(battle.battle?.code || ''),
		JSON.stringify(battle).slice(0, 200));

	const battleState = parseToolJson(await client.callTool({ name: 'battle_state', arguments: {} }));
	check('battle_state sees the lobby', battleState.battle?.status === 'lobby');

	const left = parseToolJson(await client.callTool({ name: 'leave_battle', arguments: {} }));
	check('leave_battle cancels the lobby', left.success === true);

	await transport.terminateSession().catch(() => { /* server may not support DELETE */ });
	await client.close();

	console.log(`\n[e2e-mcp] ${passed} passed, ${failed} failed`);
	process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
	console.error('[e2e-mcp] fatal:', err);
	process.exit(1);
});
