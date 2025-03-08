import React, { useState, useEffect } from 'react';
import updateService from '../services/updateService';
import './UpdateNotification.css';

/**
 * Component to display update notifications
 */
const UpdateNotification = () => {
	const [updateData, setUpdateData] = useState(null);
	const [restartData, setRestartData] = useState(null);
	const [visible, setVisible] = useState(false);
	
	useEffect(() => {
		// Subscribe to update notifications
		const unsubscribeUpdate = updateService.onUpdate((data) => {
			setUpdateData(data);
			setVisible(true);
		});
		
		// Subscribe to restart notifications
		const unsubscribeRestart = updateService.onServerRestart((data) => {
			setRestartData(data);
			setVisible(true);
			setUpdateData(null); // Clear update data when restart is initiated
		});
		
		// Manually check for updates
		updateService.checkForUpdates();
		
		// Clean up subscriptions
		return () => {
			unsubscribeUpdate();
			unsubscribeRestart();
		};
	}, []);
	
	// Don't render if nothing to show
	if (!visible || (!updateData && !restartData)) {
		return null;
	}
	
	// Handle dismissing the notification
	const handleDismiss = () => {
		// Only allow dismissing non-critical notifications
		if (restartData || (updateData && updateData.imminent) || (updateData && updateData.critical)) {
			// Cannot dismiss critical or imminent updates, or restart notifications
			return;
		}
		
		setVisible(false);
	};
	
	// Render restart notification
	if (restartData) {
		return (
			<div className={`update-notification restart ${restartData.complete ? 'success' : 'warning'}`}>
				<div className="update-content">
					<h3>{restartData.complete ? 'Update Complete' : 'Server Restarting'}</h3>
					<p>{restartData.message}</p>
					{restartData.reconnecting && (
						<div className="reconnecting-indicator">
							<div className="spinner"></div>
							<span>Reconnecting...</span>
						</div>
					)}
					{restartData.complete && (
						<p className="reload-message">
							The page will reload automatically in a few seconds...
						</p>
					)}
				</div>
			</div>
		);
	}
	
	// Render update notification
	return (
		<div className={`update-notification ${updateData.critical ? 'critical' : updateData.imminent ? 'warning' : 'info'}`}>
			<div className="update-content">
				<h3>
					{updateData.imminent 
						? 'Update Imminent' 
						: updateData.critical 
							? 'Critical Update Available' 
							: 'Update Available'}
				</h3>
				
				{updateData.version && (
					<p className="version-info">Version {updateData.version} is available</p>
				)}
				
				{updateData.releaseNotes && (
					<div className="release-notes">
						<p>{updateData.releaseNotes}</p>
					</div>
				)}
				
				{updateData.imminent && updateData.timeRemaining && (
					<div className="countdown">
						<p>{updateData.message || `Server will update in ${updateData.timeRemaining} seconds`}</p>
						<div className="progress-bar">
							<div 
								className="progress" 
								style={{ width: `${Math.min(100, (updateData.timeRemaining / 300) * 100)}%` }} 
							/>
						</div>
					</div>
				)}
				
				{!updateData.imminent && (
					<div className="update-actions">
						{updateData.updateUrl && (
							<a 
								href={updateData.updateUrl} 
								target="_blank" 
								rel="noopener noreferrer"
								className="update-button"
							>
								Learn More
							</a>
						)}
						<button 
							className="dismiss-button"
							onClick={handleDismiss}
							disabled={updateData.critical}
						>
							Dismiss
						</button>
					</div>
				)}
			</div>
		</div>
	);
};

export default UpdateNotification; 