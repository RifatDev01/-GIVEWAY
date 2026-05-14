# Telegram Giveaway Bot

A Node.js Telegram bot that manages a referral-based giveaway with a real-time leaderboard in a channel.

## Features
- Real-time Leaderboard with Progress Bars.
- Referral system via `?start=refID`.
- SQLite database for persistent storage.
- Admin command to initialize the leaderboard post.

## Setup Instructions

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Configure Environment Variables**:
   Edit the `.env` file and fill in your details:
   - `BOT_TOKEN`: Get this from [@BotFather](https://t.me/BotFather).
   - `CHANNEL_ID`: The ID of your Telegram channel (e.g., `-100123456789`). The bot must be an **admin** in this channel.
   - `ADMIN_ID`: Your Telegram User ID (to run the `/init` command).

3. **Start the Bot**:
   ```bash
   node bot.js
   ```

4. **Initialize Leaderboard**:
   - Add the bot to your channel as an administrator.
   - Go to the bot and send `/init`.
   - The bot will post the leaderboard in the channel and start updating it whenever someone refers a friend.

## How it Works
- When a user starts the bot using a referral link (`t.me/YourBot?start=ref12345`), the referrer gets +1 point.
- The leaderboard in the channel is edited in real-time.
- If the leaderboard post is deleted, the bot will create a new one on the next update.
