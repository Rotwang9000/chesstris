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
	// Look: the shared `.tx-*` UI theme in index.html.
	input.className = 'tx-field';
	input.setAttribute('aria-label', placeholder);
	Object.assign(input.style, { width: '100%', marginBottom: '12px' });
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
		zIndex: '12000',
		display: 'flex',
		justifyContent: 'center',
		alignItems: 'center',
	});
	overlay.className = 'tx-scrim';

	const card = document.createElement('div');
	card.className = 'tx-panel tx-dialog tx-dialog--sm';
	card.setAttribute('role', 'dialog');
	card.setAttribute('aria-label', 'Log in / Create account');

	const heading = document.createElement('h3');
	heading.textContent = 'Log in / Create account';
	heading.className = 'tx-title';

	const help = document.createElement('p');
	help.textContent = 'Saves your kingdom so you can play from any device. No email needed — your passphrase never leaves this browser. Keep it safe: it is the only way back into your account.';
	help.className = 'tx-text';

	const usernameInput = styledInput('text', 'Username', 'username');
	usernameInput.value = options.prefillUsername || '';
	const passphraseInput = styledInput('password', 'Passphrase', 'current-password');

	const status = document.createElement('p');
	status.className = 'tx-error';
	status.style.display = 'none';

	const buttonRow = document.createElement('div');
	buttonRow.className = 'tx-actions';

	const cancelBtn = document.createElement('button');
	cancelBtn.textContent = 'Cancel';
	cancelBtn.type = 'button';
	cancelBtn.className = 'tx-btn';

	const loginBtn = document.createElement('button');
	loginBtn.textContent = 'Log in';
	loginBtn.type = 'button';
	loginBtn.className = 'tx-btn tx-btn--primary';

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
