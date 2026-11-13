

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

/** Delay before the results card's first button takes keyboard focus. */
const KEY_GRACE_MS = 1200;

const RESULTS_ID = 'tetches-battle-results';
const STYLE_ID = 'tetches-battle-results-style';
const BLOCK_COLOURS = ['#00f0f0', '#f0f000', '#a000f0', '#00f000', '#f00000', '#0060f0', '#f0a000'];

// Colours, borders and type come from the shared `.tx-*` UI theme in
// index.html (tinted per outcome there via [data-outcome]).
function el(tag, styles = {}, text = '', className = '') {
	const node = document.createElement(tag);
	Object.assign(node.style, styles);
	if (className) node.className = className;
	if (text) node.textContent = text;
	return node;
}

function button(label, { primary = false } = {}) {
	const btn = el('button', {}, label, `tx-btn${primary ? ' tx-btn--primary' : ''}`);
	btn.type = 'button';
	return btn;
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
	if (mode === 'gone') {
		// Learnt on reconnect, with no standings left to show.
		return { outcome: 'gone', title: 'Battle over', subtitle: 'This battle ended while you were offline.' };
	}
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
		// (a battle everyone left or lost the line to: the server calls it
		// off — it was announced as the sea's "Swept away" in any mode)
		if (results?.reason === 'abandoned') {
			return { outcome: 'draw', title: 'Battle called off', subtitle: 'Every player left or lost their connection, so nobody takes the arena.' };
		}
		const sea = results?.reason === 'sea' || drowned || battle?.mode === 'quick';
		return sea
			? { outcome: 'draw', title: 'Swept away', subtitle: 'The last kings went under together. It’s a draw.' }
			: { outcome: 'draw', title: 'A draw', subtitle: 'The last kings fell together. Nobody takes the arena.' };
	}
	const winner = standings.find(r => r.seatId === battle.winnerSeatId);
	const how = drowned ? 'The sea took your king.' : '';
	return {
		outcome: 'defeat',
		title: 'Defeated',
		subtitle: `${how} ${winner ? `${winner.name} took the arena.` : ''} ${placed}`.replace(/\s+/g, ' ').trim(),
	};
}

const OUT_PREFIX = 'Out — ';

function statusText(row, winnerSeatId) {
	if (row.seatId === winnerSeatId) return '👑 Winner';
	if (row.alive) return 'Still standing';
	if (row.forfeited) return 'Left the battle';
	if (row.knockedOutBy === SEA_NAME) return `${OUT_PREFIX}🌊 the sea`;
	if (row.knockedOutBy) return `${OUT_PREFIX}${row.knockedOutBy}`;
	return 'Out';
}

/**
 * A draw shares first place among the kings still standing ("=1st"):
 * numbering them 1st and 2nd under "It's a draw" read as a winner after
 * all. (On time, the table really does go by pieces left.)
 */
function placeLabel(row, results, battle) {
	const draw = !battle?.winnerSeatId && results?.reason !== 'timeout';
	if (draw && row.alive) {
		const standing = (results?.standings || []).filter(r => r.alive);
		if (standing.length > 1) return `=${ordinal(Math.min(...standing.map(r => r.place || 1)))}`;
	}
	return ordinal(row.place);
}

function renderStandings(results, battle, mySeatId) {
	const table = el('table', {}, '', 'tx-table');
	const head = document.createElement('tr');
	for (const label of ['', 'Player', '', 'Moves', 'Captures']) {
		const th = el('th', {
			textAlign: label === 'Player' || label === '' ? 'left' : 'right',
		}, label === 'Captures' ? '' : label);
		if (label === 'Captures') {
			// (phones show the short label: the long one ran off the card)
			th.appendChild(el('span', {}, 'Captures', 'tx-long'));
			th.appendChild(el('span', {}, 'Caps', 'tx-short'));
		}
		head.appendChild(th);
	}
	table.appendChild(head);

	for (const row of results?.standings || []) {
		const tr = document.createElement('tr');
		const isMe = row.seatId === mySeatId;
		if (isMe) tr.className = 'is-me';
		const cell = (text, align = 'left', className = '') => el('td', { textAlign: align }, text, className);
		tr.appendChild(cell(placeLabel(row, results, battle), 'left', 'tx-place'));
		// (your own seat, finished by the bot that took over when you
		// dropped, is still you)
		tr.appendChild(cell(`${row.isAi && !isMe ? '🤖 ' : ''}${row.name}${isMe ? ' (you)' : ''}`, 'left', 'tx-name'));
		const status = statusText(row, battle?.winnerSeatId);
		const statusCell = cell('', 'left', 'tx-status');
		if (status.startsWith(OUT_PREFIX)) {
			// (a phone drops the "Out — ": the row stays one line)
			statusCell.appendChild(el('span', {}, OUT_PREFIX, 'tx-long'));
			statusCell.appendChild(document.createTextNode(status.slice(OUT_PREFIX.length)));
		} else {
			statusCell.textContent = status;
		}
		tr.appendChild(statusCell);
		tr.appendChild(cell(String(row.moves ?? 0), 'right'));
		tr.appendChild(cell(String(row.captures ?? 0), 'right'));
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
export function showBattleResults({ battle, results, mySeatId, mode = 'finished', actions = [], subtitle: subtitleOverride = null, note = null }) {
	closeBattleResults();
	injectStyles();
	const described = describeOutcome({ battle, results, mySeatId, mode });
	const { outcome, title } = described;
	const subtitle = subtitleOverride || described.subtitle;

	const overlay = el('div', {
		position: 'fixed', inset: '0',
		zIndex: '12500',
		display: 'flex', justifyContent: 'center', alignItems: 'center',
		overflow: 'hidden', padding: '16px', boxSizing: 'border-box',
	}, '', 'tx-scrim');
	overlay.id = RESULTS_ID;
	overlay.dataset.outcome = outcome;
	if (outcome === 'victory') addFallingBlocks(overlay);

	const card = el('div', {
		maxHeight: '90vh', overflowY: 'auto',
	}, '', 'results-card tx-panel');
	card.setAttribute('role', 'dialog');
	card.setAttribute('aria-label', title);

	const icon = outcome === 'draw' && title === 'Battle called off' ? '📡'
		: outcome === 'draw' && title === 'Swept away' ? '🌊'
			: { victory: '👑', defeat: '⚔', draw: '⏱', out: '💥', gone: '📡' }[outcome];
	card.appendChild(el('div', {}, icon, 'tx-results-icon'));
	card.appendChild(el('h2', {}, title, 'tx-title'));
	if (subtitle) card.appendChild(el('div', {}, subtitle, 'tx-results-sub'));

	const meta = [];
	if (battle?.code) meta.push(`Battle ${battle.code}`);
	if (results?.durationMs) meta.push(formatDuration(results.durationMs));
	if (meta.length) card.appendChild(el('div', {}, meta.join(' · '), 'tx-results-meta'));
	if (note) card.appendChild(el('div', {}, note, 'tx-results-meta tx-results-note'));

	if (results?.standings?.length) card.appendChild(renderStandings(results, battle, mySeatId));

	const row = el('div', {}, '', 'tx-actions');
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
	// Focus the first button only after a beat: a player still hammering
	// Space to drop a piece would otherwise hit Rematch the instant the
	// card appears.
	setTimeout(() => {
		if (!primary || !primary.isConnected) return;
		const active = document.activeElement;
		if (active && active !== document.body && card.contains(active)) return;
		try { primary.focus({ preventScroll: true }); } catch (_e) { /* old browsers */ }
	}, KEY_GRACE_MS);
	return { outcome };
}
