/**
 * Jenkins init script — auto-creates the Tetches multibranch pipeline.
 * Placed in $JENKINS_HOME/init.groovy.d/ and runs once on startup.
 * Deletes itself after successful execution so it only runs once.
 */

import jenkins.model.*
import org.jenkinsci.plugins.workflow.multibranch.*
import jenkins.branch.*
import jenkins.plugins.git.*
import com.cloudbees.hudson.plugins.folder.computed.*

def jenkins = Jenkins.instance

if (jenkins.getItem('tetches') != null) {
	println '[init] tetches job already exists — skipping'
	return
}

println '[init] Creating tetches multibranch pipeline...'

try {
	def mbp = jenkins.createProject(
		org.jenkinsci.plugins.workflow.multibranch.WorkflowMultiBranchProject,
		'tetches'
	)

	def gitSource = new GitSCMSource(
		'tetches-git',
		'https://github.com/Rotwang9000/tetches.git',
		'',
		'*',
		'',
		false
	)

	def branchSource = new BranchSource(gitSource)
	mbp.getSourcesList().add(branchSource)

	// Scan every 2 minutes for branch changes
	def trigger = new PeriodicFolderTrigger('2m')
	mbp.addTrigger(trigger)

	mbp.save()

	// Trigger initial scan
	mbp.scheduleBuild2(0)

	println '[init] tetches multibranch pipeline created and scan triggered'
} catch (Exception e) {
	println "[init] Could not create pipeline automatically: ${e.message}"
	println '[init] This may be because required plugins are not yet installed.'
	println '[init] Please create the job manually via the Jenkins UI.'
}

// Delete this init script so it does not run again
try {
	def initDir = new File(Jenkins.instance.rootDir, 'init.groovy.d')
	def thisScript = new File(initDir, 'create-pipeline-job.groovy')
	if (thisScript.exists()) {
		thisScript.delete()
		println '[init] Init script deleted (one-time run)'
	}
} catch (Exception e) {
	println "[init] Could not delete init script: ${e.message}"
}
