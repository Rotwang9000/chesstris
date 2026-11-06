// Offline: no Sentry.
'use strict';
const noop = () => {};
module.exports = {
	initSentry: noop,
	isEnabled: () => false,
	captureException: noop,
	wrapSocketHandler: (handler) => handler,
	wireSentryRequestHandler: noop,
	wireSentryErrorHandler: noop,
	installProcessHandlers: noop,
};
