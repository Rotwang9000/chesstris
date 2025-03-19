import React from 'react';
import PropTypes from 'prop-types';
import './PawnPromotionModal.css';

/**
 * Component for displaying pawn promotion options
 */
const PawnPromotionModal = ({ pawn, options, onSelect }) => {
	// Handle piece selection
	const handleSelect = (pieceType) => {
		onSelect(pieceType);
	};
	
	return (
		<div className="pawn-promotion-overlay">
			<div className="pawn-promotion-modal">
				<h3>Promote Pawn</h3>
				<p>Select a piece to promote your pawn to:</p>
				
				<div className="promotion-options">
					{options.map((option) => (
						<button
							key={option.type}
							className="promotion-option"
							onClick={() => handleSelect(option.type)}
							aria-label={`Promote to ${option.label}`}
						>
							<div className="promotion-piece">
								<span className={`piece-icon ${option.type}`}></span>
							</div>
							<span className="promotion-label">{option.label}</span>
						</button>
					))}
				</div>
				
				<div className="promotion-info">
					<p>
						<strong>Pawn at:</strong> ({pawn.position.x}, {pawn.position.y})
					</p>
					<p>
						<small>Promotion will happen automatically in 5 seconds if no selection is made.</small>
					</p>
				</div>
			</div>
		</div>
	);
};

PawnPromotionModal.propTypes = {
	pawn: PropTypes.shape({
		id: PropTypes.string.isRequired,
		position: PropTypes.shape({
			x: PropTypes.number.isRequired,
			y: PropTypes.number.isRequired
		}).isRequired
	}).isRequired,
	options: PropTypes.arrayOf(
		PropTypes.shape({
			type: PropTypes.string.isRequired,
			label: PropTypes.string.isRequired
		})
	).isRequired,
	onSelect: PropTypes.func.isRequired
};

export default PawnPromotionModal; 