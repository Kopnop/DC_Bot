#!/bin/bash

# Try to restart the bot using PM2. If it is not already in PM2, start it up.
echo "Restarting F1 Discord Bot..."
pm2 restart f1-discord-bot || pm2 start index.js --name "f1-discord-bot"

echo "Bot restart command triggered successfully!"
pm2 status
