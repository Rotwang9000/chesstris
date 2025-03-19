/**
 * Simple API Test
 * 
 * This script tests the basic functionality of the Shaktris API.
 */

const axios = require('axios');

// Configuration
const API_URL = process.env.API_URL || 'http://localhost:3020/api';

// Run tests
async function runTests() {
	console.log('=== Shaktris API Test ===');
	console.log(`API URL: ${API_URL}`);
	console.log('========================\n');
	
	try {
		// Test API root
		console.log('Testing API root endpoint...');
		const rootResponse = await axios.get(API_URL);
		console.log('Response:', rootResponse.data);
		console.log('✅ API root endpoint is working\n');
		
		// Test player registration
		console.log('Testing player registration...');
		const regResponse = await axios.post(`${API_URL}/computer-players/register`, {
			name: 'TestPlayer',
			apiEndpoint: 'http://localhost:8080/callback',
			description: 'Test player for API testing'
		});
		console.log('Response:', regResponse.data);
		console.log('✅ Player registration is working\n');
		
		const playerId = regResponse.data.playerId;
		const apiToken = regResponse.data.apiToken;
		
		// Test game creation
		console.log('Testing game creation...');
		const gameResponse = await axios.post(`${API_URL}/games`, {
			playerId: playerId,
			username: 'TestPlayer',
			options: {
				maxPlayers: 4,
				gameMode: 'standard',
				difficulty: 'normal'
			}
		});
		console.log('Response:', gameResponse.data);
		console.log('✅ Game creation is working\n');
		
		const gameId = gameResponse.data.gameId;
		
		// Test getting available games
		console.log('Testing get available games...');
		const gamesResponse = await axios.get(`${API_URL}/games`);
		console.log('Response:', gamesResponse.data);
		console.log('✅ Getting available games is working\n');
		
		// Test getting game details
		console.log('Testing get game details...');
		const gameDetailsResponse = await axios.get(`${API_URL}/games/${gameId}`);
		console.log('Response:', gameDetailsResponse.data);
		console.log('✅ Getting game details is working\n');
		
		console.log('All tests passed! 🎉');
	} catch (error) {
		console.error('❌ Test failed:');
		console.error('Error:', error.message);
		
		if (error.response) {
			console.error('Status:', error.response.status);
			console.error('Data:', error.response.data);
		}
	}
}

// Run the tests
runTests(); 