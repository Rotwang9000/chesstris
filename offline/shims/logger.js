// Offline logger: pino's call shape, quiet below warn.
'use strict';
function make() {
	const log = (fn) => (obj, msg) => fn('[offline]', msg !== undefined ? msg : obj, msg !== undefined ? obj : '');
	const logger = {
		trace() {},
		debug() {},
		info() {},
		warn: log(console.warn),
		error: log(console.error),
		fatal: log(console.error),
		child: () => make(),
	};
	return logger;
}
const logger = make();
module.exports = logger;
module.exports.child = () => make();
