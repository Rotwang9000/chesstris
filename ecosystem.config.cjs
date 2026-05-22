/**
 * PM2 Ecosystem Configuration
 *
 * Manages Tetches processes for staging and production.
 *
 * Usage:
 *   pm2 start ecosystem.config.cjs --only tetches-staging
 *   pm2 start ecosystem.config.cjs --only tetches-production
 *   pm2 restart tetches-staging
 *   pm2 logs tetches-staging
 */

module.exports = {
	apps: [
		{
			name: 'tetches-staging',
			script: 'server.js',
			cwd: '/var/www/tetches.staging',
			env: {
				NODE_ENV: 'staging',
				PORT: 3661,
				ALLOWED_ORIGIN: 'https://staging.tetches.com',
			},
			instances: 1,
			autorestart: true,
			watch: false,
			max_memory_restart: '512M',
			error_file: '/var/www/tetches.staging/logs/err.log',
			out_file: '/var/www/tetches.staging/logs/out.log',
			merge_logs: true,
			log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
		},
		{
			name: 'tetches-production',
			script: 'server.js',
			cwd: '/var/www/tetches.live',
			// Secrets (SENDGRID_API_KEY, SENTRY_DSN, AUTH0_API_KEY)
			// live in /var/www/tetches.live/.env which PM2 picks up
			// automatically because the server's bootstrap calls
			// dotenv.config() at startup. NODE_ENV and PORT stay
			// here so they're version-controlled with the deploy.
			env: {
				NODE_ENV: 'production',
				PORT: 3666,
				ALLOWED_ORIGIN: 'https://tetches.com,https://www.tetches.com',
			},
			instances: 1,
			autorestart: true,
			watch: false,
			max_memory_restart: '1G',
			error_file: '/var/www/tetches.live/logs/err.log',
			out_file: '/var/www/tetches.live/logs/out.log',
			merge_logs: true,
			log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
		},
	],
};
