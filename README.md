# Discord Moderation Bot (discord.js v14)

A clean, modern slash-command moderation bot built for ERLC / Michigan State Roleplay.

---

## 🚀 Features
- `/ping` – latency check  
- `/purge` – bulk delete messages  
- `/kick`, `/ban`, `/timeout` – moderation actions  
- `/role_add`, `/role_remove` – role management  
- `/warn`, `/infractions` – warning + logging system (saved to `data/infractions.json`)

---

## ⚙️ Setup

### 1️⃣ Create a Discord Application
- Go to [Discord Developer Portal](https://discord.com/developers/applications)
- **Create Application → Bot → Reset Token** (copy it)
- Turn on **Server Members Intent**
- Under **OAuth2 → URL Generator**
  - Scopes: `bot` + `applications.commands`
  - Permissions: Kick, Ban, Manage Roles, Moderate Members, Manage Messages, Send Messages, etc.
- Invite the bot using the generated link.

---

### 2️⃣ Local Setup
Clone your repository:
```bash
git clone https://github.com/YOUR_USERNAME/msrp-discord-bot.git
cd msrp-discord-bot
