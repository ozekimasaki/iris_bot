# Iris

Iris is a reusable Discord operations bot designed for multi-guild deployments on Ubuntu. All configuration is stored per guild in SQLite, so a single running instance can serve many guilds with independent settings.

## Features

- Guild-scoped setup through slash commands
- Timezone-aware reminders (one-shot and repeating)
- Forum thread watch notifications with startup reconciliation and manual `/forum resync`
- Allow-list based grantable role management
- Scheduled role cleanup with confirmation and restore
- Event channel creation and archive workflow
- Honeypot channel that silently bans posters
- Member export as CSV
- Localization for `en`, `ja`, and `zh-CN`

## Tech stack

- [Bun](https://bun.sh) runtime (1.3+)
- TypeScript
- [discord.js](https://discord.js.org) v14
- `bun:sqlite` for local SQLite storage (no external database server)
- [luxon](https://moment.github.io/luxon/) for timezone-aware date handling
- [pino](https://getpino.io) for logging
- [zod](https://zod.dev) for environment validation

## Requirements

- Bun 1.3+ (`packageManager` is pinned to `bun@1.3.10`)
- A Discord application with the bot invited to target guilds

## Environment variables

Copy `.env.example` and fill in the values:

```bash
cp .env.example .env
```

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `DISCORD_TOKEN` | yes | — | Bot token |
| `DISCORD_APPLICATION_ID` | yes | — | Discord application ID |
| `DATABASE_PATH` | no | `./data/iris.db` | SQLite file path |
| `LOG_LEVEL` | no | `info` | One of `trace`, `debug`, `info`, `warn`, `error` |

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

- [`mise.toml`](./mise.toml) pins Bun for [`mise`](https://mise.jdx.dev). Run `mise trust` once after cloning so `mise.toml` is accepted.
- [`.prototools`](./.prototools) pins Bun for [`proto`](https://moonrepo.dev/proto).

## Scripts

| Command | Description |
| --- | --- |
| `bun run dev` | Start the bot with file watching |
| `bun run start` | Start the bot once |
| `bun run build` | Type-check the project (`tsc --noEmit`) |
| `bun run test` | Run the smoke test suite |
| `bun run db:migrate` | Apply pending SQL migrations |
| `bun run commands:sync` | Sync slash commands to Discord |

## Project structure

```
src/
  index.ts              # App bootstrap and login
  app/                  # Runtime wiring, context, env, logger, command sync
  commands/             # Slash command definitions
  domain/               # Business logic services
  db/                   # SQLite client, migration runner, repositories
  lib/                  # i18n, time, csv, discord helpers
  test/smoke.ts         # Smoke tests
migrations/             # Numbered SQL migration files
systemd/                # Ubuntu systemd unit and operations docs
```

## Slash commands

- `/help [topic]`
- `/setup role add|remove|list`
- `/setup honeypot set|clear|list`
- `/setup event_categories`
- `/setup timezone`
- `/setup language`
- `/setup show|validate`
- `/remind timezone|set|list|delete`
- `/forum watch|unwatch|list|resync`
- `/role grant|revoke`
- `/role allow add|remove|list`
- `/role cleanup start|list|cancel|restore|retry`
- `/event create|archive|list`
- `/member export`

## Discord application requirements

Required gateway intents:

- `Guilds`
- `GuildMembers`
- `GuildMessages`
- `Message Content` (required when the honeypot is used; enable it in the Discord Developer Portal)

The bot role must be positioned above any roles Iris is expected to grant.

## Production on Ubuntu

Recommended paths:

- App: `/opt/iris-bot`
- Environment file: `/etc/iris-bot/iris-bot.env`
- Database: `/var/lib/iris-bot/iris.db`

Ubuntu deployment assumes `proto` and the bundled [`.prototools`](./.prototools). An example service file is available at [`systemd/iris-bot.service`](./systemd/iris-bot.service). See [`systemd/README.md`](./systemd/README.md) for full setup and [`systemd/UPDATE.md`](./systemd/UPDATE.md) for updates.

## Setup flow

1. Invite the bot with `bot` and `applications.commands`.
2. Sync commands globally or per guild.
3. In Discord, run `/setup role add` to configure admin and manager roles.
4. Run `/setup event_categories`, `/setup timezone`, and `/setup language`.
5. Start using `/remind`, `/forum`, `/role`, `/event`, and `/member`.

## License

This is a private project (`"private": true` in `package.json`). No license file is included, so all rights are reserved by default.
