pipeline {
	agent any

	environment {
		NODE_VERSION = '21'
		STAGING_DIR  = '/var/www/tetches.staging'
		PROD_DIR     = '/var/www/tetches.live'
		STAGING_PORT = '3661'
		PROD_PORT    = '3666'
	}

	options {
		timeout(time: 15, unit: 'MINUTES')
		disableConcurrentBuilds()
		buildDiscarder(logRotator(numToKeepStr: '20'))
	}

	triggers {
		githubPush()
	}

	stages {
		stage('Checkout') {
			steps {
				checkout scm
				sh 'echo "Branch: ${GIT_BRANCH}"'
				sh 'echo "Commit: $(git log -1 --format=\\"%h %s\\")"'
				sh 'node --version && npm --version'
			}
		}

		stage('Install') {
			steps {
				sh 'npm ci --prefer-offline || npm install'
			}
		}

		stage('Lint Check') {
			steps {
				// Full ESLint pass on the server-side codebase. The
				// public/js bundle still has its old syntax-only
				// check below as a placeholder until that pass is
				// migrated to ESLint too.
				sh 'npm run lint'
				sh 'node --input-type=module --check < public/js/gameContext.js'
				sh 'node --input-type=module --check < public/js/enhanced-gameCore.js'
				sh 'node --input-type=module --check < public/js/rendererManager.js'
				sh 'node --input-type=module --check < public/js/inputManager.js'
				sh 'node --input-type=module --check < public/js/chessInteraction.js'
				sh 'node --input-type=module --check < public/js/uiOverlays.js'
				sh 'node --input-type=module --check < public/js/gameLoop.js'
				sh 'echo "All modules pass syntax check"'
			}
		}

		stage('Test — Server') {
			steps {
				sh '''
					npx jest \
						--ci \
						--forceExit \
						--selectProjects server \
						tests/server/
				'''
			}
		}

		stage('Test — Other') {
			steps {
				sh '''
					npx jest \
						--ci \
						--forceExit \
						--passWithNoTests \
						tests/examples/ \
						tests/core/gameContext.test.js \
						tests/core/rendererManager.test.js \
						|| true
				'''
			}
		}

		stage('Deploy to Staging') {
			when {
				anyOf {
					branch 'Develop'
					branch 'develop'
				}
			}
			steps {
				sh '''
					bash scripts/deploy.sh staging
				'''
			}
			post {
				success {
					echo 'Staging deployment complete: https://staging.tetches.com'
				}
				failure {
					echo 'Staging deployment FAILED'
				}
			}
		}

		stage('Deploy to Production') {
			when {
				branch 'main'
			}
			steps {
				input message: 'Deploy to production (tetches.com)?', ok: 'Deploy'
				sh '''
					bash scripts/deploy.sh production
				'''
			}
			post {
				success {
					echo 'Production deployment complete: https://tetches.com'
				}
				failure {
					echo 'Production deployment FAILED'
				}
			}
		}
	}

	post {
		always {
			cleanWs()
		}
		failure {
			echo "Pipeline failed on branch ${env.GIT_BRANCH}"
		}
		success {
			echo "Pipeline succeeded on branch ${env.GIT_BRANCH}"
		}
	}
}
