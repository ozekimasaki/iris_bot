# Iris

Iris is a reusable Discord operations bot designed for multi-guild deployments on Ubuntu.

## Features

- Guild-scoped setup through slash commands
- Timezone-aware reminders
- Forum thread watch notifications
- Grantable role management
- Event channel creation and archive workflow
- Member export as CSV

## Requirements

- Bun 1.3+
- A Discord application with the bot invited to target guilds

## Environment variables

Copy `.env.example` and fill in the values:

```bash
cp .env.example .env
```

| Variable | Description |
| --- | --- |
| `DISCORD_TOKEN` | Bot token |
| `DISCORD_APPLICATION_ID` | Discord application ID |
| `DATABASE_PATH` | SQLite file path |
| `LOG_LEVEL` | `trace`, `debug`, `info`, `warn`, `error` |

## Development

```bash
bun install
bun run db:migrate
bun run commands:sync
bun run dev
```

Iris uses `bun:sqlite`, so no extra database server or native addon toolchain is required. `db:migrate` and normal startup both apply pending SQL migrations automatically.

`commands:sync` synchronizes commands to every guild the bot is currently installed in. Use `bun run commands:sync -- --guild <guild-id>` when you want to target only one guild, or `bun run commands:sync -- --global` when you intentionally want global application commands.

If you use tool managers:

- Windows: use [`mise.toml`](/C:/Users/masam/Documents/server_admin_bot/iris-bot/mise.toml)
- Ubuntu: use [`.prototools`](/C:/Users/masam/Documents/server_admin_bot/iris-bot/.prototools) with `proto`

If you use `mise`, run `mise trust` once after cloning so `mise.toml` is accepted.

## Production on Ubuntu

Recommended paths:

- App: `/opt/iris-bot`
- Environment file: `/etc/iris-bot/iris-bot.env`
- Database: `/var/lib/iris-bot/iris.db`

Ubuntu deployment assumes `proto` and the bundled [`.prototools`](/C:/Users/masam/Documents/server_admin_bot/iris-bot/.prototools).

Example service file is available at [systemd/iris-bot.service](/C:/Users/masam/Documents/server_admin_bot/iris-bot/systemd/iris-bot.service).

## Setup flow

1. Invite the bot with `bot` and `applications.commands`.
2. Sync commands globally or per guild.
3. In Discord, run `/setup role add` to configure admin and manager roles.
4. Run `/setup event_categories`, `/setup timezone`, and `/setup language`.
5. Start using `/remind`, `/forum`, `/role`, `/event`, and `/member`.
