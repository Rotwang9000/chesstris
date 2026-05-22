/**
 * UI Overlays Module
 *
 * Full-screen overlays for pawn promotion, king capture battles,
 * and the King's Duel mini-game.
 */

import * as NetworkManager from './utils/networkManager.js';
import { getGameState } from './gameContext.js';
import { showToastMessage } from './showToastMessage.js';

// ── Promotion Redeem (spend a credit + captured piece to deploy) ───────────

/**
 * Show a dialog letting the local player spend a banked promotion
 * credit. They pick one of their captured pieces; the server deploys
 * it at the credit's original cell (or nearest-to-king if the cell
 * is gone). Pawns that complete the promotion walk become credits;
 * credits are NOT free Queens — they have to be redeemed against a
 * captured piece (or, later, a piece bought from the shop).
 *
 * @param {Object} [opts]
 * @param {Object} [opts.summary]  Aggregated `{ QUEEN: n, ROOK: n, ... }`
 *                                 from the local player's basket. If
 *                                 omitted we read it from `gameState`.
 * @param {Array}  [opts.credits]  Local player's credit list.
 */
export function showPromotionRedeemDialog(opts = {}) {
	const choices = ['QUEEN', 'ROOK', 'BISHOP', 'KNIGHT'];
	const SYMBOLS = { QUEEN: '\u265B', ROOK: '\u265C', BISHOP: '\u265D', KNIGHT: '\u265E' };
	const gameState = getGameState();
	const credits = Array.isArray(opts.credits)
		? opts.credits
		: (Array.isArray(gameState?.promotionCredits) ? gameState.promotionCredits : []);
	if (credits.length === 0) {
		showToastMessage('No promotion credits to redeem yet. Walk a pawn 9 cells forward first.', 3500);
		return;
	}
	let summary = opts.summary;
	if (!summary) {
		const basket = Array.isArray(gameState?.capturedBasket) ? gameState.capturedBasket : [];
		summary = basket.reduce((acc, item) => {
			const t = String(item?.type || '').toUpperCase();
			if (choices.includes(t)) acc[t] = (acc[t] || 0) + 1;
			return acc;
		}, {});
	}
	const available = choices.filter(t => Number(summary?.[t] || 0) > 0);

	const overlay = document.createElement('div');
	overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:10000;display:flex;align-items:center;justify-content:center;';
	overlay.addEventListener('click', (e) => {
		if (e.target === overlay) overlay.remove();
	});

	const dialog = document.createElement('div');
	dialog.style.cssText = 'background:#1a1a2e;border:2px solid #d4af37;border-radius:12px;padding:24px;text-align:center;color:#fff;font-family:"Playfair Display",serif;min-width:340px;max-width:460px;';

	const oldest = credits[0];
	const oldestPos = (Number.isFinite(oldest.originalX) && Number.isFinite(oldest.originalZ))
		? `(${oldest.originalX}, ${oldest.originalZ})`
		: 'an unrecorded cell';
	dialog.innerHTML = `
		<h3 style="margin:0 0 6px;color:#d4af37;">Redeem Promotion</h3>
		<p style="margin:0 0 12px;font-size:13px;opacity:0.85;">
			${credits.length} credit${credits.length === 1 ? '' : 's'} ready. The oldest deploys at ${oldestPos}
			(or nearest cell to your king if it's gone).
		</p>
	`;

	if (available.length === 0) {
		const note = document.createElement('div');
		note.textContent = 'No captured pieces in basket yet. Capture a rook, bishop, knight or queen and the credit will be ready to spend.';
		note.style.cssText = 'padding:14px;font-size:13px;color:#ffd97a;border:1px dashed rgba(212,175,55,0.4);border-radius:6px;';
		dialog.appendChild(note);
	} else {
		const row = document.createElement('div');
		row.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin-bottom:12px;';
		available.forEach(type => {
			const count = Number(summary[type] || 0);
			const btn = document.createElement('button');
			btn.textContent = `${SYMBOLS[type]} ${type} \u00D7${count}`;
			btn.style.cssText = 'padding:10px 16px;background:#1a3e2a;color:#a8e6a3;border:1px solid #4caf50;border-radius:6px;cursor:pointer;font-size:15px;font-family:inherit;';
			btn.addEventListener('mouseenter', () => { btn.style.background = '#244e34'; });
			btn.addEventListener('mouseleave', () => { btn.style.background = '#1a3e2a'; });
			btn.addEventListener('click', () => {
				btn.disabled = true;
				btn.style.opacity = '0.6';
				NetworkManager.redeemPromotion(type, oldest.id, (result) => {
					if (result && result.success) {
						overlay.remove();
					} else {
						const err = (result && result.error) || 'Redeem failed';
						showToastMessage(`Redeem failed: ${err}`, 3000);
						btn.disabled = false;
						btn.style.opacity = '1';
					}
				});
			});
			row.appendChild(btn);
		});
		dialog.appendChild(row);
	}

	const cancel = document.createElement('button');
	cancel.textContent = 'Close';
	cancel.style.cssText = 'padding:6px 14px;background:transparent;color:#ccc;border:1px solid #555;border-radius:6px;cursor:pointer;font-size:13px;font-family:inherit;';
	cancel.addEventListener('click', () => overlay.remove());
	dialog.appendChild(cancel);

	overlay.appendChild(dialog);
	document.body.appendChild(overlay);
}

// ── King Battle ─────────────────────────────────────────────────────────────

export function showKingBattleOverlay(captorId, captorName, defeatedId, defeatedName, _defeatedColor, inheritedPawnCount) {
	const gameState = getGameState();
	const isLocal = captorId === gameState.localPlayerId;
	const isDefeated = defeatedId === gameState.localPlayerId;

	const overlay = document.createElement('div');
	overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:10000;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.5s;';

	const container = document.createElement('div');
	container.style.cssText = 'text-align:center;color:#fff;font-family:"Playfair Display",serif;max-width:500px;padding:40px;';

	const crownHTML = '<span style="font-size:64px;display:block;margin-bottom:16px;">\u2694\uFE0F</span>';

	let title, subtitle, detail;
	if (isLocal) {
		title = 'VICTORY!';
		subtitle = `You have captured ${defeatedName || 'an enemy'}'s King!`;
		detail = `Their forces kneel before you. ${inheritedPawnCount || 0} enemy pawns will now self-destruct...`;
	} else if (isDefeated) {
		title = 'DEFEATED';
		subtitle = `${captorName || 'An enemy'} has captured your King!`;
		detail = 'Your remaining forces have been claimed by the victor.';
	} else {
		title = 'A KING HAS FALLEN';
		subtitle = `${captorName || 'A player'} captured ${defeatedName || 'an enemy'}'s King!`;
		detail = `The victor inherits their forces. ${inheritedPawnCount || 0} pawns will self-destruct.`;
	}

	container.innerHTML = `
		${crownHTML}
		<h1 style="margin:0 0 12px;font-size:36px;color:#d4af37;text-shadow:0 0 20px rgba(212,175,55,0.5);">${title}</h1>
		<p style="margin:0 0 8px;font-size:18px;opacity:0.9;">${subtitle}</p>
		<p style="margin:0;font-size:14px;opacity:0.7;">${detail}</p>
	`;

	overlay.appendChild(container);
	document.body.appendChild(overlay);

	setTimeout(() => {
		overlay.style.opacity = '0';
		overlay.style.transition = 'opacity 1s';
		setTimeout(() => overlay.remove(), 1000);
	}, 5000);
}

// ── King's Duel ─────────────────────────────────────────────────────────────

let activeDuel = null;

export function getActiveDuel() { return activeDuel; }

export function showKingDuelOverlay(duelId, gridCols, gridRows, opponentName) {
	const stale = document.getElementById('king-duel-overlay');
	if (stale) stale.remove();

	const totalCells = gridCols * gridRows;
	const overlay = document.createElement('div');
	overlay.id = 'king-duel-overlay';
	overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:10001;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.3s;';

	const panel = document.createElement('div');
	panel.style.cssText = 'text-align:center;color:#fff;font-family:"Playfair Display",serif;max-width:420px;padding:32px;';

	const titleEl = document.createElement('h2');
	titleEl.style.cssText = 'margin:0 0 8px;font-size:28px;color:#d4af37;text-shadow:0 0 12px rgba(212,175,55,0.4);';
	titleEl.textContent = "King's Duel!";

	const subtitleEl = document.createElement('p');
	subtitleEl.style.cssText = 'margin:0 0 4px;font-size:14px;opacity:0.8;';
	subtitleEl.textContent = `Both you and ${opponentName} captured each other's king!`;

	const roundEl = document.createElement('p');
	roundEl.style.cssText = 'margin:0 0 4px;font-size:12px;opacity:0.5;';
	roundEl.textContent = 'Round 1';

	const instructionEl = document.createElement('p');
	instructionEl.style.cssText = 'margin:0 0 16px;font-size:16px;color:#d4af37;';
	instructionEl.textContent = 'Hide your knight on the grid:';

	const timerEl = document.createElement('div');
	timerEl.style.cssText = 'margin:0 0 12px;font-size:13px;opacity:0.6;';

	const gridContainer = document.createElement('div');
	gridContainer.style.cssText = `display:grid;grid-template-columns:repeat(${gridCols},1fr);gap:6px;margin:0 auto 16px;max-width:320px;`;

	const cells = [];
	for (let i = 0; i < totalCells; i++) {
		const cell = document.createElement('button');
		cell.style.cssText = 'width:100%;aspect-ratio:1;background:#1a1a2e;border:2px solid #3a3a5e;border-radius:8px;cursor:pointer;font-size:24px;color:#d4af37;transition:all 0.15s;';
		cell.addEventListener('mouseenter', () => {
			if (cell.dataset.selected !== 'true') cell.style.borderColor = '#d4af37';
		});
		cell.addEventListener('mouseleave', () => {
			if (cell.dataset.selected !== 'true') cell.style.borderColor = '#3a3a5e';
		});
		cell.addEventListener('click', () => handleCellClick(i));
		cells.push(cell);
		gridContainer.appendChild(cell);
	}

	panel.appendChild(titleEl);
	panel.appendChild(subtitleEl);
	panel.appendChild(roundEl);
	panel.appendChild(instructionEl);
	panel.appendChild(timerEl);
	panel.appendChild(gridContainer);
	overlay.appendChild(panel);
	document.body.appendChild(overlay);

	activeDuel = {
		duelId, phase: 'place', placement: -1, guess: -1, round: 1,
		cells, instructionEl, timerEl, roundEl, timerInterval: null,
		overlay, panel, gridCols, gridRows, opponentName
	};
	startDuelTimer();

	function startDuelTimer() {
		if (activeDuel.timerInterval) clearInterval(activeDuel.timerInterval);
		let timeLeft = 10;
		timerEl.textContent = `${timeLeft}s remaining`;
		activeDuel.timerInterval = setInterval(() => {
			timeLeft--;
			if (timeLeft <= 0) {
				clearInterval(activeDuel.timerInterval);
				timerEl.textContent = 'Time up!';
			} else {
				timerEl.textContent = `${timeLeft}s remaining`;
			}
		}, 1000);
	}

	function handleCellClick(index) {
		if (!activeDuel || activeDuel.duelId !== duelId) return;
		if (activeDuel.phase === 'place') {
			cells.forEach(c => {
				c.dataset.selected = 'false';
				c.style.borderColor = '#3a3a5e';
				c.style.background = '#1a1a2e';
				c.textContent = '';
				c.style.opacity = '1';
			});
			cells[index].dataset.selected = 'true';
			cells[index].style.borderColor = '#d4af37';
			cells[index].style.background = '#2a1a3e';
			cells[index].textContent = '\u265E';
			activeDuel.placement = index;
			setTimeout(() => {
				if (!activeDuel || activeDuel.phase !== 'place') return;
				activeDuel.phase = 'guess';
				instructionEl.textContent = 'Now guess where your opponent hid theirs:';
				cells.forEach(c => {
					c.dataset.selected = 'false';
					c.style.borderColor = '#3a3a5e';
					c.style.background = '#1a1a2e';
					c.textContent = '';
					c.style.opacity = '1';
				});
				cells[activeDuel.placement].style.background = '#1a2a1e';
				cells[activeDuel.placement].textContent = '\u265E';
				cells[activeDuel.placement].style.opacity = '0.4';
			}, 600);
		} else if (activeDuel.phase === 'guess') {
			if (index === activeDuel.placement) return;
			activeDuel.guess = index;
			activeDuel.phase = 'waiting';
			if (activeDuel.timerInterval) clearInterval(activeDuel.timerInterval);
			instructionEl.textContent = 'Waiting for opponent\u2026';
			cells[index].style.borderColor = '#ff4444';
			cells[index].style.background = '#3a1a1e';
			cells[index].textContent = '\u2694';
			cells.forEach(c => { c.style.cursor = 'default'; });
			NetworkManager.submitDuelResponse(duelId, activeDuel.placement, activeDuel.guess);
		}
	}
}

export function handleDuelRoundResult(payload) {
	if (!activeDuel) return;
	const { player1Id, player2Id, player1Placement, player2Placement, player1Guessed, player2Guessed } = payload;
	const gameState = getGameState();
	const localId = gameState.localPlayerId;
	const isP1 = localId === player1Id;

	const theirPlacement = isP1 ? player2Placement : player1Placement;
	const iGuessed = isP1 ? player1Guessed : player2Guessed;
	const theyGuessed = isP1 ? player2Guessed : player1Guessed;

	const { cells, instructionEl } = activeDuel;

	if (iGuessed && theyGuessed) {
		instructionEl.textContent = 'You both found each other! Re-hide your knights\u2026';
	} else {
		instructionEl.textContent = 'Neither found the other. Re-hide your knights\u2026';
	}

	cells.forEach(c => {
		c.style.cursor = 'default';
		c.dataset.selected = 'false';
		c.style.opacity = '1';
		c.textContent = '';
		c.style.borderColor = '#3a3a5e';
		c.style.background = '#1a1a2e';
	});

	if (activeDuel.placement >= 0 && activeDuel.placement < cells.length) {
		cells[activeDuel.placement].style.background = '#1a2a1e';
		cells[activeDuel.placement].style.borderColor = '#4CAF50';
		cells[activeDuel.placement].textContent = '\u265E';
	}
	if (theirPlacement >= 0 && theirPlacement < cells.length) {
		cells[theirPlacement].style.background = '#2a1a1e';
		cells[theirPlacement].style.borderColor = '#f44336';
		cells[theirPlacement].textContent = '\u265E';
	}
}

export function handleDuelNewRound(payload) {
	if (!activeDuel) return;
	const { round } = payload;
	activeDuel.round = round;
	activeDuel.phase = 'place';
	activeDuel.placement = -1;
	activeDuel.guess = -1;

	const { cells, instructionEl, timerEl, roundEl } = activeDuel;
	roundEl.textContent = `Round ${round}`;
	instructionEl.textContent = 'Hide your knight on the grid:';

	cells.forEach(c => {
		c.dataset.selected = 'false';
		c.style.borderColor = '#3a3a5e';
		c.style.background = '#1a1a2e';
		c.textContent = '';
		c.style.opacity = '1';
		c.style.cursor = 'pointer';
	});

	if (activeDuel.timerInterval) clearInterval(activeDuel.timerInterval);
	let timeLeft = 10;
	timerEl.textContent = `${timeLeft}s remaining`;
	activeDuel.timerInterval = setInterval(() => {
		timeLeft--;
		if (timeLeft <= 0) {
			clearInterval(activeDuel.timerInterval);
			timerEl.textContent = 'Time up!';
		} else {
			timerEl.textContent = `${timeLeft}s remaining`;
		}
	}, 1000);
}

export function showKingDuelResult(payload) {
	const { victorId, loserId, maxRoundsReached } = payload || {};
	const gameState = getGameState();
	const localId = gameState.localPlayerId;
	const isVictor = victorId === localId;
	const isLoser = loserId === localId;
	const isParticipant = isVictor || isLoser;

	if (activeDuel && activeDuel.timerInterval) {
		clearInterval(activeDuel.timerInterval);
	}

	const existingOverlay = document.getElementById('king-duel-overlay');

	if (isParticipant && existingOverlay) {
		const panel = activeDuel?.panel || existingOverlay.querySelector('div');
		if (panel) {
			const resultText = isVictor ? 'YOUR KNIGHT TRIUMPHS!' : 'YOUR KNIGHT HAS FALLEN!';
			const colour = isVictor ? '#4CAF50' : '#f44336';
			let detail;
			if (maxRoundsReached) {
				detail = 'After many rounds, the gods grew weary and chose a victor at random.';
			} else if (isVictor) {
				detail = 'You found your opponent\'s knight \u2014 victory is yours!';
			} else {
				detail = 'Your opponent found your knight \u2014 defeat is yours.';
			}

			panel.innerHTML = `
				<span style="font-size:64px;display:block;margin-bottom:16px;">${isVictor ? '\u2694\uFE0F' : '\u2620\uFE0F'}</span>
				<h2 style="margin:0 0 12px;font-size:28px;color:${colour};">${resultText}</h2>
				<p style="margin:0 0 8px;font-size:14px;opacity:0.8;">${detail}</p>
			`;
		}
		setTimeout(() => {
			existingOverlay.style.opacity = '0';
			existingOverlay.style.transition = 'opacity 1s';
			setTimeout(() => existingOverlay.remove(), 1000);
		}, 3000);
	} else if (existingOverlay) {
		existingOverlay.remove();
	}

	activeDuel = null;

	if (!isParticipant && typeof showToastMessage === 'function') {
		const victorName = payload.victorName || victorId;
		showToastMessage(`King's Duel resolved \u2014 ${victorName} wins!`, 3000);
	}
}
