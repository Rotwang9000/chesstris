/**
 * End-of-battle scene: a full-screen results card shown when the battle
 * you're watching finishes (victory / defeat / draw), or when you're
 * knocked out of a 3-4 seat battle that carries on without you.
 *
 * The server sends `results` with `battle_finished` and `battle_seat_out`
 * (see server/battle/BattleManager.js `battleResults`):
 *   { durationMs, standings: [{ seatId, name, isAi, controlledBy, alive,
 *     forfeited, knockedOutBy, moves, captures, piecesLeft, place }] }
 *
 * This module only renders; battleMode.js decides when to show it and
 * what the buttons do.
 */

const RESULTS_ID = 'tetches-battle-results';
const STYLE_ID = 'tetches-battle-results-style';
const BLOCK_COLOURS = ['#00f0f0', '#f0f000', '#a000f0', '#00f000', '#f00000', '#0060f0', '#f0a000'];

function el(tag, styles = {}, text = '') {
	const node = document.createElement(tag);
	Object.assign(node.style, styles);
	if (text) node.textContent = text;
	return node;
}

function button(label, { primary = false } = {}) {
	return el('button', {
		padding: '10px 18px',
		backgroundColor: primary ? '#ffcc00' : '#333',
		color: primary ? '#000' : '#ffcc00',
		border: '1px solid #ffcc00',
		borderRadius: '4px',
		cursor: 'pointer',
		fontFamily: 'inherit',
		fontSize: '15px',
		fontWeight: primary ? 'bold' : 'normal',
		flex: '1 1 140px',
	}, label);
}

function injectStyles() {
	if (document.getElementById(STYLE_ID)) return;
	const style = document.createElement('style');
	style.id = STYLE_ID;
	style.textContent = `
@keyframes tetchesResultsPop { 0% { transform: scale(0.6); opacity: 0; } 70% { transform: scale(1.06); opacity: 1; } 100% { transform: scale(1); } }
@keyframes tetchesBlockFall { 0% { transform: translateY(-12vh) rotate(0deg); opacity: 1; } 100% { transform: translateY(110vh) rotate(var(--spin, 180deg)); opacity: 0.9; } }
#${RESULTS_ID} .results-card { animation: tetchesResultsPop 420ms ease-out both; }
#${RESULTS_ID} .results-block { position: absolute; top: 0; width: 14px; height: 14px; border-radius: 2px;
  animation: tetchesBlockFall var(--dur, 3s) linear var(--delay, 0s) both; pointer-events: none; }
@media (prefers-reduced-motion: reduce) {
  #${RESULTS_ID} .results-card, #${RESULTS_ID} .results-block { animation: none; }
  #${RESULTS_ID} .results-block { display: none; }
}`;
	document.head.appendChild(style);
}

/** Falling tetromino-coloured blocks behind a victory card. */
function addFallingBlocks(overlay, count = 36) {
	for (let i = 0; i < count; i++) {
		const block = el('div', {
			left: `${Math.random() * 100}%`,
			backgroundColor: BLOCK_COLOURS[i % BLOCK_COLOURS.length],
		});
		block.className = 'results-block';
		block.style.setProperty('--delay', `${(Math.random() * 1.6).toFixed(2)}s`);
		block.style.setProperty('--dur', `${(2.4 + Math.random() * 2).toFixed(2)}s`);
		block.style.setProperty('--spin', `${Math.round(90 + Math.random() * 540)}deg`);
		overlay.appendChild(block);
	}
}

export function formatDuration(ms) {
	const total = Math.max(0, Math.round((Number(ms) || 0) / 1000));
	const m = Math.floor(total / 60);
	const s = total % 60;
	return m > 0 ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`;
}

function ordinal(n) {
	return ['1st', '2nd', '3rd', '4th'][n - 1] || `${n}th`;
}

/**
 * Pick the headline for this viewer.
 * @returns {{ outcome: 'victory'|'defeat'|'draw'|'out', title, subtitle }}
 */
/** Server name for a king lost to the rising sea (results.knockedOutBy). */
const SEA_NAME = 'the sea';

export function describeOutcome({ battle, results, mySeatId, mode = 'finished' }) {
	const standings = results?.standings || [];
	const mine = standings.find(r => r.seatId === mySeatId) || null;
	const place = mine?.place || null;

	const placed = place ? `You placed ${ordinal(place)}.` : '';
	const drowned = mine?.knockedOutBy === SEA_NAME;
	if (mode === 'out') {
		const how = drowned ? 'The sea took your king.'
			: `Your king fell${mine?.knockedOutBy ? ` by ${mine.knockedOutBy}` : ''}.`;
		return { outcome: 'out', title: 'Knocked out', subtitle: `${how} ${placed}`.trim() };
	}
	if (battle?.winnerSeatId && battle.winnerSeatId === mySeatId) {
		return { outcome: 'victory', title: 'Victory!', subtitle: battle.mode === 'quick' ? 'Last king above water.' : 'Last king standing.' };
	}
	if (!battle?.winnerSeatId) {
		if (results?.reason === 'timeout') {
			return { outcome: 'draw', title: 'Time’s up', subtitle: 'No single king left standing, so the table goes by pieces left.' };
		}
		return { outcome: 'draw', title: 'Swept away', subtitle: 'The last kings went under together. It’s a draw.' };
	}
	const winner = standings.find(r => r.seatId === battle.winnerSeatId);
	const how = drowned ? 'The sea took your king.' : '';
	return {
		outcome: 'defeat',
		title: 'Defeated',
		subtitle: `${how} ${winner ? `${winner.name} took the arena.` : ''} ${placed}`.replace(/\s+/g, ' ').trim(),
	};
}

function statusText(row, winnerSeatId) {
	if (row.seatId === winnerSeatId) return '👑 Winner';
	if (row.alive) return 'Still standing';
	if (row.forfeited) return 'Left the battle';
	if (row.knockedOutBy === SEA_NAME) return 'Out — 🌊 the sea';
	if (row.knockedOutBy) return `Out — ${row.knockedOutBy}`;
	return 'Out';
}

function renderStandings(results, battle, mySeatId) {
	const table = el('table', {
		width: '100%', borderCollapse: 'collapse', fontSize: '13px', margin: '14px 0 4px',
	});
	const head = document.createElement('tr');
	for (const label of ['', 'Player', '', 'Moves', 'Captures']) {
		head.appendChild(el('th', {
			textAlign: label === 'Player' || label === '' ? 'left' : 'right',
			padding: '4px 6px', color: '#998', fontWeight: 'normal', fontSize: '11px',
			borderBottom: '1px solid #554',
		}, label));
	}
	table.appendChild(head);

	for (const row of results?.standings || []) {
		const tr = document.createElement('tr');
		const isMe = row.seatId === mySeatId;
		if (isMe) tr.style.backgroundColor = 'rgba(255, 204, 0, 0.12)';
		const cell = (text, align = 'left', extra = {}) => el('td', {
			padding: '6px', textAlign: align, borderBottom: '1px solid #333', ...extra,
		}, text);
		tr.appendChild(cell(ordinal(row.place), 'left', { fontWeight: 'bold', width: '34px' }));
		tr.appendChild(cell(`${row.isAi ? '🤖 ' : ''}${row.name}${isMe ? ' (you)' : ''}`, 'left',
			{ fontWeight: isMe ? 'bold' : 'normal', color: isMe ? '#ffcc00' : '#eee' }));
		tr.appendChild(cell(statusText(row, battle?.winnerSeatId), 'left', { color: '#bbb', fontSize: '12px' }));
		tr.appendChild(cell(String(row.moves ?? 0), 'right', { color: '#eee' }));
		tr.appendChild(cell(String(row.captures ?? 0), 'right', { color: '#eee' }));
		table.appendChild(tr);
	}
	return table;
}

export function closeBattleResults() {
	const existing = document.getElementById(RESULTS_ID);
	if (existing) existing.remove();
}

/**
 * Show the results card.
 *
 * @param {Object} opts
 * @param {Object} opts.battle    publicState of the battle
 * @param {Object} opts.results   server results (may be missing on old servers)
 * @param {string} opts.mySeatId  the viewer's seat in that battle
 * @param {'finished'|'out'} [opts.mode]
 * @param {Array<{label, primary?, onClick}>} opts.actions  buttons, left to right
 * @returns {{ outcome: string }} what was shown
 */
export function showBattleResults({ battle, results, mySeatId, mode = 'finished', actions = [] }) {
	closeBattleResults();
	injectStyles();
	const { outcome, title, subtitle } = describeOutcome({ battle, results, mySeatId, mode });

	const overlay = el('div', {
		position: 'fixed', inset: '0',
		backgroundColor: outcome === 'victory' ? 'rgba(10, 8, 0, 0.62)' : 'rgba(0, 0, 0, 0.72)',
		zIndex: '12500',
		display: 'flex', justifyContent: 'center', alignItems: 'center',
		fontFamily: 'serif', overflow: 'hidden', padding: '16px', boxSizing: 'border-box',
	});
	overlay.id = RESULTS_ID;
	overlay.dataset.outcome = outcome;
	if (outcome === 'victory') addFallingBlocks(overlay);

	const accent = outcome === 'victory' ? '#ffcc00' : (outcome === 'draw' ? '#ccccaa' : '#ff8866');
	const card = el('div', {
		position: 'relative',
		backgroundColor: '#1d1d1d',
		border: `2px solid ${accent}`,
		borderRadius: '10px',
		padding: '24px',
		width: '440px', maxWidth: '100%',
		maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box',
		color: '#ffcc00', textAlign: 'center',
		boxShadow: `0 0 40px ${outcome === 'victory' ? 'rgba(255, 204, 0, 0.45)' : 'rgba(0, 0, 0, 0.6)'}`,
	});
	card.className = 'results-card';
	card.setAttribute('role', 'dialog');
	card.setAttribute('aria-label', title);

	const icon = { victory: '👑', defeat: '⚔', draw: '⏱', out: '💥' }[outcome];
	card.appendChild(el('div', { fontSize: '44px', lineHeight: '1' }, icon));
	card.appendChild(el('h2', {
		margin: '8px 0 4px', fontSize: '32px', letterSpacing: '1px', color: accent,
	}, title));
	if (subtitle) card.appendChild(el('div', { fontSize: '14px', color: '#ddd' }, subtitle));

	const meta = [];
	if (battle?.code) meta.push(`Battle ${battle.code}`);
	if (results?.durationMs) meta.push(formatDuration(results.durationMs));
	if (meta.length) card.appendChild(el('div', { fontSize: '11px', color: '#998', marginTop: '6px' }, meta.join(' · ')));

	if (results?.standings?.length) card.appendChild(renderStandings(results, battle, mySeatId));

	const row = el('div', { display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '16px' });
	for (const action of actions) {
		const btn = button(action.label, { primary: !!action.primary });
		btn.addEventListener('click', async () => {
			btn.disabled = true;
			try { await action.onClick?.(); }
			finally { btn.disabled = false; }
		});
		row.appendChild(btn);
	}
	card.appendChild(row);

	overlay.appendChild(card);
	document.body.appendChild(overlay);
	const primary = row.querySelector('button');
	try { primary?.focus({ preventScroll: true }); } catch (_e) { /* old browsers */ }
	return { outcome };
}
