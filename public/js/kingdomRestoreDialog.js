/**
 * Dialog shown when a returning player's kingdom was stowed after long idle.
 */
import * as NetworkManager from './utils/networkManager.js';
import { showToastMessage } from './showToastMessage.js';

function el(tag, css = '', text = '') {
	const node = document.createElement(tag);
	if (css) node.style.cssText = css;
	if (text) node.textContent = text;
	return node;
}

/**
 * @param {Object} summary `{ cellCount, pieceCount, stowedAt }`
 * @param {{ onComplete?: (response: Object) => void }} [options]
 */
export function showKingdomRestoreDialog(summary, options = {}) {
	let overlay = document.getElementById('kingdom-restore-dialog');
	if (!overlay) {
		overlay = el('div',
			'position:fixed;inset:0;z-index:12000;display:flex;justify-content:center;'
			+ 'align-items:center;background:rgba(0,0,0,0.72);');
		overlay.id = 'kingdom-restore-dialog';
		document.body.appendChild(overlay);
	}
	overlay.innerHTML = '';
	const card = el('div',
		'background:#222;border:2px solid #ffcc00;border-radius:8px;padding:24px;'
		+ 'max-width:440px;color:#ffcc00;font-family:serif;text-align:center;');
	card.appendChild(el('h2', 'margin:0 0 8px 0;', 'Welcome back'));
	const cells = summary?.cellCount ?? 0;
	const pieces = summary?.pieceCount ?? 0;
	card.appendChild(el('p', 'color:#ccc;font-size:13px;line-height:1.5;margin:0 0 16px 0;',
		`Your kingdom was resting in stasis (${cells} cells, ${pieces} pieces). `
		+ 'Restore it near other players, or start fresh?'));

	const relocateBtn = el('button',
		'width:100%;padding:11px;margin-bottom:8px;font-size:15px;font-weight:bold;'
		+ 'background:#ffcc00;color:#000;border:none;border-radius:4px;cursor:pointer;font-family:inherit;',
		'↩ Restore nearby');
	const freshBtn = el('button',
		'width:100%;padding:10px;font-size:14px;background:#333;color:#ffcc00;'
		+ 'border:1px solid #ffcc00;border-radius:4px;cursor:pointer;font-family:inherit;',
		'✦ Start fresh');

	const finish = async (mode) => {
		relocateBtn.disabled = true;
		freshBtn.disabled = true;
		try {
			const socket = NetworkManager.getSocket();
			const response = await new Promise((resolve, reject) => {
				socket.emit('restore_kingdom', { mode }, (ack) => {
					if (ack?.success) resolve(ack);
					else reject(new Error(ack?.error || 'restore_failed'));
				});
			});
			overlay.style.display = 'none';
			if (response.relocateFallback) {
				showToastMessage('Could not fit your old board — started fresh instead', { variant: 'alert' });
			} else if (mode === 'relocate') {
				showToastMessage('Kingdom restored near the action');
			} else {
				showToastMessage('Fresh kingdom spawned');
			}
			if (typeof options.onComplete === 'function') options.onComplete(response);
		} catch (err) {
			relocateBtn.disabled = false;
			freshBtn.disabled = false;
			showToastMessage(err?.message || 'Could not restore kingdom', { variant: 'alert' });
		}
	};
	relocateBtn.addEventListener('click', () => finish('relocate'));
	freshBtn.addEventListener('click', () => finish('fresh'));
	card.appendChild(relocateBtn);
	card.appendChild(freshBtn);
	overlay.appendChild(card);
	overlay.style.display = 'flex';
}
