/**
 * In-place rename dialog. Replaces the old "clear localStorage and
 * reload" flow that reliably landed users back as `Guest` because
 * the page-reload race-condition discarded their typed name.
 *
 * Sends a `change_name` socket event to the server. The server
 * updates the existing player record + broadcasts a
 * `player_renamed` event so every connected client refreshes its
 * UI without needing a full game_update.
 */

import * as NetworkManager from './utils/networkManager.js';
import { showToastMessage } from './showToastMessage.js';

const MAX_NAME_LENGTH = 32;
const DIALOG_ID = 'tetches-rename-dialog';

/**
 * Show a modal dialog with a text input. On submit, persist to
 * localStorage and fire a `change_name` socket event. The local
 * UI updates from the server's `player_renamed` broadcast (so we
 * don't have to keep the dialog open while the server confirms).
 *
 * @param {string} currentName
 */
export function promptInlineRename(currentName = '') {
	if (document.getElementById(DIALOG_ID)) return;

	const overlay = document.createElement('div');
	overlay.id = DIALOG_ID;
	Object.assign(overlay.style, {
		position: 'fixed',
		top: '0',
		left: '0',
		width: '100%',
		height: '100%',
		backgroundColor: 'rgba(0, 0, 0, 0.7)',
		zIndex: '12000',
		display: 'flex',
		justifyContent: 'center',
		alignItems: 'center',
		fontFamily: 'serif',
	});

	const card = document.createElement('div');
	Object.assign(card.style, {
		backgroundColor: '#222',
		border: '2px solid #ffcc00',
		borderRadius: '8px',
		padding: '24px',
		minWidth: '320px',
		maxWidth: '90%',
		color: '#ffcc00',
		boxShadow: '0 0 30px rgba(255, 204, 0, 0.3)',
	});

	const heading = document.createElement('h3');
	heading.textContent = 'Change your name';
	Object.assign(heading.style, {
		margin: '0 0 12px 0',
		fontSize: '20px',
	});

	const help = document.createElement('p');
	help.textContent = 'Visible to everyone in the world. Max 32 characters.';
	Object.assign(help.style, {
		margin: '0 0 16px 0',
		fontSize: '12px',
		color: '#ccc',
	});

	const input = document.createElement('input');
	input.type = 'text';
	input.value = currentName || '';
	input.placeholder = 'Your name';
	input.maxLength = MAX_NAME_LENGTH;
	Object.assign(input.style, {
		width: '100%',
		padding: '8px',
		fontSize: '16px',
		backgroundColor: '#111',
		color: '#ffcc00',
		border: '1px solid #ffcc00',
		borderRadius: '4px',
		marginBottom: '16px',
		boxSizing: 'border-box',
	});

	const buttonRow = document.createElement('div');
	Object.assign(buttonRow.style, {
		display: 'flex',
		gap: '8px',
		justifyContent: 'flex-end',
	});

	const cancelBtn = document.createElement('button');
	cancelBtn.textContent = 'Cancel';
	Object.assign(cancelBtn.style, {
		padding: '8px 16px',
		backgroundColor: '#333',
		color: '#ccc',
		border: '1px solid #555',
		borderRadius: '4px',
		cursor: 'pointer',
		fontFamily: 'inherit',
		fontSize: '14px',
	});

	const saveBtn = document.createElement('button');
	saveBtn.textContent = 'Save';
	Object.assign(saveBtn.style, {
		padding: '8px 16px',
		backgroundColor: '#ffcc00',
		color: '#000',
		border: '1px solid #ffcc00',
		borderRadius: '4px',
		cursor: 'pointer',
		fontFamily: 'inherit',
		fontSize: '14px',
		fontWeight: 'bold',
	});

	function close() {
		try { document.body.removeChild(overlay); } catch (_e) { /* already gone */ }
	}

	function submit() {
		const newName = (input.value || '').trim().slice(0, MAX_NAME_LENGTH);
		if (!newName) {
			input.focus();
			input.style.borderColor = '#f44';
			return;
		}
		// Update localStorage immediately so a page reload (e.g.
		// the dev's nodemon kick) still picks up the new name even
		// before the server confirms.
		try { localStorage.setItem('playerName', newName); } catch (_e) { /* ignore */ }
		saveBtn.disabled = true;
		saveBtn.textContent = 'Saving...';
		const socket = NetworkManager.getSocket && NetworkManager.getSocket();
		if (!socket || !socket.emit) {
			showToastMessage('Not connected — name will apply on next join.', 3000);
			close();
			return;
		}
		socket.emit('change_name', { playerName: newName }, (response) => {
			if (response && response.success) {
				showToastMessage(`Name updated to ${response.playerName}.`, 2500);
			} else {
				showToastMessage(
					(response && response.error) ? `Rename failed: ${response.error}` : 'Rename failed.',
					4000
				);
			}
			close();
		});
		// Failsafe — if the server never acks, close after 4s.
		setTimeout(close, 4000);
	}

	cancelBtn.addEventListener('click', close);
	saveBtn.addEventListener('click', submit);
	input.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') submit();
		if (e.key === 'Escape') close();
	});
	overlay.addEventListener('click', (e) => {
		if (e.target === overlay) close();
	});

	buttonRow.appendChild(cancelBtn);
	buttonRow.appendChild(saveBtn);
	card.appendChild(heading);
	card.appendChild(help);
	card.appendChild(input);
	card.appendChild(buttonRow);
	overlay.appendChild(card);
	document.body.appendChild(overlay);

	// Focus + select for quick over-type.
	setTimeout(() => { input.focus(); input.select(); }, 0);
}
