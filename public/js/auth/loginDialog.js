/**
 * Account login / create dialog (username + passphrase).
 *
 * A small themed modal mirroring renameDialog.js. It delegates the actual
 * work to ./kingdomKey.js — deriving a stable key locally (the passphrase
 * never leaves the browser), storing it, and reloading so the socket
 * reconnects under the account identity. The server then resumes the
 * account, or migrates the current guest kingdom onto it on first login.
 */

import { loginWithPassphrase } from './kingdomKey.js';

const DIALOG_ID = 'tetches-login-dialog';

function styledInput(type, placeholder, autocomplete) {
	const input = document.createElement('input');
	input.type = type;
	input.placeholder = placeholder;
	input.autocomplete = autocomplete;
	Object.assign(input.style, {
		width: '100%',
		padding: '8px',
		fontSize: '16px',
		backgroundColor: '#111',
		color: '#ffcc00',
		border: '1px solid #ffcc00',
		borderRadius: '4px',
		marginBottom: '12px',
		boxSizing: 'border-box',
		fontFamily: 'inherit',
	});
	return input;
}

/**
 * Show the login / create-account dialog.
 * @param {{ prefillUsername?: string }} [options]
 */
export function showLoginDialog(options = {}) {
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
	heading.textContent = 'Log in / Create account';
	Object.assign(heading.style, { margin: '0 0 12px 0', fontSize: '20px' });

	const help = document.createElement('p');
	help.textContent = 'Saves your kingdom so you can play from any device. No email needed — your passphrase never leaves this browser. Keep it safe: it is the only way back into your account.';
	Object.assign(help.style, { margin: '0 0 16px 0', fontSize: '12px', color: '#ccc', lineHeight: '1.5' });

	const usernameInput = styledInput('text', 'Username', 'username');
	usernameInput.value = options.prefillUsername || '';
	const passphraseInput = styledInput('password', 'Passphrase', 'current-password');

	const status = document.createElement('p');
	Object.assign(status.style, { margin: '0 0 12px 0', fontSize: '12px', color: '#ff6666', display: 'none' });

	const buttonRow = document.createElement('div');
	Object.assign(buttonRow.style, { display: 'flex', gap: '8px', justifyContent: 'flex-end' });

	const cancelBtn = document.createElement('button');
	cancelBtn.textContent = 'Cancel';
	Object.assign(cancelBtn.style, {
		padding: '8px 16px', backgroundColor: '#333', color: '#ccc',
		border: '1px solid #555', borderRadius: '4px', cursor: 'pointer',
		fontFamily: 'inherit', fontSize: '14px',
	});

	const loginBtn = document.createElement('button');
	loginBtn.textContent = 'Log in';
	Object.assign(loginBtn.style, {
		padding: '8px 16px', backgroundColor: '#ffcc00', color: '#000',
		border: '1px solid #ffcc00', borderRadius: '4px', cursor: 'pointer',
		fontFamily: 'inherit', fontSize: '14px', fontWeight: 'bold',
	});

	function close() {
		try { document.body.removeChild(overlay); } catch (_e) { /* already gone */ }
	}

	function setStatus(text) {
		status.textContent = text || '';
		status.style.display = text ? 'block' : 'none';
	}

	async function submit() {
		setStatus('');
		loginBtn.disabled = true;
		const original = loginBtn.textContent;
		loginBtn.textContent = 'Logging in…';
		try {
			// Resolves just before the page reload that rebinds identity.
			await loginWithPassphrase(usernameInput.value, passphraseInput.value);
		} catch (error) {
			console.error('[auth] login failed:', error);
			setStatus(error.message || 'Could not log in. Please try again.');
			loginBtn.disabled = false;
			loginBtn.textContent = original;
		}
	}

	cancelBtn.addEventListener('click', close);
	loginBtn.addEventListener('click', submit);
	[usernameInput, passphraseInput].forEach((el) => {
		el.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') submit();
			if (e.key === 'Escape') close();
		});
	});
	overlay.addEventListener('click', (e) => {
		if (e.target === overlay) close();
	});

	buttonRow.appendChild(cancelBtn);
	buttonRow.appendChild(loginBtn);
	card.appendChild(heading);
	card.appendChild(help);
	card.appendChild(usernameInput);
	card.appendChild(passphraseInput);
	card.appendChild(status);
	card.appendChild(buttonRow);
	overlay.appendChild(card);
	document.body.appendChild(overlay);

	setTimeout(() => {
		const focusEl = usernameInput.value ? passphraseInput : usernameInput;
		focusEl.focus();
	}, 0);
}
