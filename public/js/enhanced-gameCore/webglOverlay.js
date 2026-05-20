/**
 * Full-screen overlay shown when the renderer can't acquire a WebGL
 * context (no hardware acceleration, blocked by browser, etc).
 *
 * Replaces the old 2D-mode redirect with a clean, informative panel
 * and a Retry button.
 */

export function showWebglUnavailableOverlay(reason = '') {
	if (typeof document === 'undefined') return;
	if (document.getElementById('webgl-unavailable-overlay')) return;

	const overlay = document.createElement('div');
	overlay.id = 'webgl-unavailable-overlay';
	Object.assign(overlay.style, {
		position: 'fixed', inset: '0',
		background: 'rgba(8, 8, 16, 0.92)',
		color: '#ffcc00',
		display: 'grid', placeItems: 'center',
		zIndex: '20000', padding: '24px',
		fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
		textAlign: 'center',
	});

	overlay.innerHTML = `
		<div style="max-width: 560px; border: 1px solid rgba(255, 204, 0, 0.4);
			border-radius: 12px; padding: 22px 24px; background: rgba(0,0,0,0.5);">
			<h2 style="margin: 0 0 12px;">WebGL is unavailable</h2>
			<p style="margin: 0 0 12px;">
				Shaktris needs WebGL (3D acceleration) to run. Your browser couldn't
				create a WebGL context, usually because hardware acceleration is
				disabled at the system or browser level.
			</p>
			<p style="margin: 0 0 12px; opacity: 0.85;">
				<strong>Quick fixes</strong>: enable hardware acceleration in your
				browser settings, update your graphics driver, or try a different
				browser (Chrome, Firefox, Edge).
			</p>
			<p style="margin: 0 0 16px; opacity: 0.6; font-size: 12px;">
				Details: ${reason || 'no additional information'}
			</p>
			<button id="webgl-retry" style="background: #ffcc00; color: #111;
				border: none; border-radius: 6px; padding: 8px 16px; cursor: pointer;
				font-weight: 600;">Retry</button>
		</div>
	`;
	document.body.appendChild(overlay);
	const retry = overlay.querySelector('#webgl-retry');
	if (retry) retry.addEventListener('click', () => window.location.reload());
}
