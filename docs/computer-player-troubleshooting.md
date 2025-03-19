# Shaktris Computer Player API Troubleshooting Guide

This document provides solutions to common issues encountered when working with the Shaktris Computer Player API.

## API Connection Issues

### 404 Not Found Errors

If you're receiving 404 errors when trying to access API endpoints:

1. **Check the server is running**: Ensure the Shaktris server is running with `npm run dev`
2. **Verify API URL**: Make sure you're using the correct API URL (default: `http://localhost:3020/api`)
3. **Check endpoint paths**: Verify that you're using the correct endpoint paths as documented in `docs/computer-player-api.md`
4. **API routes loaded**: Ensure the API routes are properly loaded in the server.js file

To test if the API is working correctly, run:

```
npm run test:api-simple
```

### Authentication Errors

If you're receiving 401 Unauthorized errors:

1. **Check API token**: Ensure you're using the correct API token received during registration
2. **Token expiration**: API tokens may expire after a certain period; try re-registering your computer player
3. **Header format**: Verify that you're sending the API token in the correct format

## Game Interaction Issues

### Cannot Join Game

If your computer player cannot join a game:

1. **Game existence**: Verify that the game ID exists
2. **Game capacity**: Check if the game is already full
3. **Player already in game**: Ensure your computer player isn't already in the game
4. **Registration**: Confirm that your computer player is properly registered

### Move Validation Failures

If your moves are being rejected:

1. **Turn order**: Verify it's your computer player's turn
2. **Move type**: Ensure you're making the correct type of move (tetromino or chess)
3. **Valid moves**: Check that your moves follow the game rules
4. **Rate limiting**: Respect the 10-second minimum delay between moves

## Callback Server Issues

If your callback server isn't receiving events:

1. **Endpoint accessibility**: Ensure your callback server is accessible from the game server
2. **Correct URL**: Verify that you provided the correct callback URL during registration
3. **Server running**: Make sure your callback server is running
4. **Error handling**: Implement proper error handling in your callback server

## Testing Your Setup

To diagnose issues with your computer player setup:

1. **Run the API test**:
   ```
   npm run test:api
   ```

2. **Test with the example computer player**:
   ```
   npm run run:simple-player
   ```

3. **Test with the callback server**:
   ```
   npm run run:callback-server
   ```

4. **Check server logs**: Monitor the server logs for error messages

## Common Error Messages and Solutions

| Error Message | Possible Cause | Solution |
|---------------|----------------|----------|
| `Cannot POST /api/games` | API routes not properly configured | Check server.js and routes/api.js |
| `Invalid API token` | Wrong or expired token | Re-register your computer player |
| `Not your turn` | Attempting to move out of turn | Wait for your turn notification |
| `Expected tetromino move, got chess` | Wrong move type | Check the current move type in the game state |
| `Game not found` | Invalid game ID | Get a list of available games first |
| `Player not in game` | Player hasn't joined the game | Join the game before making moves |

## Debugging Tools

1. **API Endpoint Test**:
   ```
   npm run test:api
   ```

2. **Simple API Test**:
   ```
   npm run test:api-simple
   ```

3. **Computer Player Test**:
   ```
   npm run test:computer-players
   ```

## Fixing the 404 Error for `/api/games`

If you're encountering a 404 error when trying to access `/api/games`, follow these steps:

1. **Check routes directory**:
   Ensure the `routes` directory exists and contains `api.js`

2. **Verify server.js**:
   Make sure server.js includes:
   ```javascript
   const apiRoutes = require('./routes/api');
   app.use('/api', apiRoutes);
   ```

3. **Restart the server**:
   Stop and restart the server with `npm run dev`

4. **Test API root**:
   Try accessing `http://localhost:3020/api` in your browser or with curl:
   ```
   curl http://localhost:3020/api
   ```

5. **Check for errors in server logs**:
   Look for any error messages in the server console

## Getting Help

If you continue to experience issues after trying these troubleshooting steps:

1. Check the GitHub repository issues section
2. Join our Discord community for real-time support
3. Contact support@shaktris.com with details of your issue

Remember to include:
- Error messages
- Steps to reproduce the issue
- Your computer player code (if relevant)
- Server logs 