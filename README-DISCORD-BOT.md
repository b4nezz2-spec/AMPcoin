# AMPcoin Assistant Discord Bot

A comprehensive Discord moderation bot with advanced features for server management.

## Features

- **Ban System**: Ban users with automatic DM notifications and persistent bans
- **Mute System**: Temporarily mute users with configurable durations
- **Timeout System**: Apply temporary timeouts to users
- **Role Management**: Add, remove, and delete roles
- **Logging**: Automatic logging of moderation actions
- **Appeal System**: Dedicated appeal channel for banned users
- **Persistent Bans**: Users remain banned even if they rejoin

## Setup Instructions

### Prerequisites

- Python 3.8 or higher
- Discord Bot Token (get it from [Discord Developer Portal](https://discord.com/developers/applications))

### Installation

1. Install the required dependencies:
   ```bash
   pip install -r requirements.txt
   ```

2. Invite your bot to your server with the necessary permissions:
   - View Channels
   - Manage Channels
   - Manage Roles
   - Ban Members
   - Kick Members
   - Manage Messages
   - Read Message History
   - Send Messages
   - Embed Links
   - Moderate Members (for timeout feature)

### Running the Bot

1. Set your bot token as an environment variable:
   ```bash
   export DISCORD_BOT_TOKEN="your_bot_token_here"
   ```
   
   Or run the script directly and enter your token when prompted.

2. Start the bot:
   ```bash
   python bot.py
   ```

## Commands

### Moderation Commands

- `/ban <user> [reason]` - Ban a user from the server
- `/unban <user_id>` - Unban a user from the server
- `/mute <user> [duration] [reason]` - Mute a user (duration in minutes)
- `/unmute <user>` - Unmute a user
- `/timeout <user> [duration] [reason]` - Timeout a user (duration in minutes)
- `/untimeout <user>` - Remove timeout from a user

### Role Management Commands

- `/giverole <user> <role>` - Give a role to a user
- `/addrole <user> <role>` - Alias for giverole
- `/removerole <user> <role>` - Remove a role from a user
- `/deleterole <role>` - Delete a role from the server

### Configuration Commands

- `/setlogs <channel>` - Set the logs channel for moderation actions
- `/setappeal <channel>` - Set the appeal channel for banned users

### Utility Commands

- `/help` - Show help information

## How It Works

### Ban System
When a user is banned:
1. They receive a DM with ban details (moderator, reason, appeal channel)
2. A log entry is created in the configured logs channel
3. If they attempt to rejoin, they are automatically kicked again

### Mute System
When a user is muted:
1. The bot creates or uses an existing "Muted" role with restricted permissions
2. The role is applied to the user
3. After the specified duration, the mute is automatically removed
4. A log entry is created in the configured logs channel

### Timeout System
Timeouts are Discord's built-in feature that restricts a user's ability to:
- Send messages
- Join voice channels
- Interact with threads
- React to messages

## Configuration

The bot saves server-specific configuration in `discord_config.json`:
- Logs channel ID
- Appeal channel ID

These settings persist between bot restarts.

## Important Notes

- Make sure your bot has the "Moderate Members" permission for timeout functionality
- The bot automatically creates a "Muted" role if one doesn't exist
- Banned users will be kicked again if they attempt to rejoin
- All moderation actions are logged in the configured logs channel