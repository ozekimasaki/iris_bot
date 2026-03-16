# Iris Implementation Notes

This file summarizes the current implementation state of `iris-bot` so future changes can start from the actual codebase instead of assumptions.

## Project Summary

- Bot name: `Iris`
- Goal: reusable Discord operations bot for multi-guild deployments
- Runtime target: `Ubuntu` in production, `Windows` also supported for local testing
- Legacy code from `x-post-get-bot/` is not reused

## Tech Stack

- `Bun 1.3+`
- `TypeScript`
- `discord.js v14`
- `bun:sqlite` for local SQLite storage
- `luxon` for timezone-aware date handling
- `pino` for logging
- `zod` for env validation

## Entry Points

- App bootstrap: `src/index.ts`
- Runtime wiring: `src/app/runtime.ts`
- Service/repository composition: `src/app/context.ts`
- Command sync CLI: `src/app/command-sync.ts`
- SQL migration runner: `src/db/migrations.ts`

## Current Slash Commands

- `/help [topic]`
- `/setup role add|remove|list`
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

Command registration is built from `src/commands/index.ts`.

## Guild-Scoped Configuration Model

All configuration is stored per guild in SQLite. There are no repo-tracked JSON config files.

- Admin roles: multiple allowed
- Manager roles: multiple allowed
- Forum notice roles: multiple allowed
- Event category and archive category: one each per guild
- Default timezone: one per guild
- Language: one per guild

Role scopes are:

- `admin`
- `manager`
- `forum_notice`

Permission checks combine Discord permissions and configured role scopes.

## Current Runtime Behavior

### Reminders

- User timezones are optional
- If a user timezone is not set, Iris falls back to the guild default timezone
- Reminder dispatch runs every minute in-process
- One-shot reminders are completed after send
- Repeating reminders are rescheduled in local timezone context

### Forum Notifications

- Forum notifications are event-driven via `threadCreate`
- Startup reconciliation is implemented
  - On bot ready, Iris scans configured forum watches
  - It checks active and archived threads newer than `last_seen_thread_ts`
  - Missed threads are notified in ascending creation order
- `last_seen_thread_ts` is updated after a successful notification
- Duplicate sends are guarded in-process with an `inFlightThreads` set
- `/forum resync` can manually replay missed threads for a watched forum within a bounded lookback window

### Events

- `/event create` creates:
  - one text channel under the configured event category
  - one companion role
  - one active grantable-role record
- `/event archive` moves the channel to the archive category and deactivates the related grantable role
- `/event list` shows active event records and marks missing channel or role references as stale

### Role Cleanup

- Role cleanup jobs are stored in SQLite and processed by the same in-process minute scheduler used for reminders
- `/role cleanup start` snapshots current role holders, posts a reaction prompt, and later removes the role from members who did not confirm
- `/role cleanup restore` re-grants only members removed by that cleanup job
- `/role cleanup retry` requeues pending or failed removals for the next scheduler pass

## Localization

Supported guild languages:

- `en`
- `ja`
- `zh-CN`

Current localization coverage:

- Runtime replies and embeds for major commands
- Confirmation button labels
- Forum notification embed text
- Slash command descriptions via `setDescriptionLocalizations`

Current localization limits:

- Slash command names are not localized
- Localizations are focused on bot-visible UX, not arbitrary internal error strings

Localization utilities live in:

- `src/lib/i18n.ts`
- `src/lib/command-localizations.ts`

## Database

Database access uses `bun:sqlite` with a thin repository layer. No ORM is used.

Migration model:

- SQL files live in `migrations/`
- Applied migrations are tracked in `_migrations`
- Migrations are applied both by `bun run db:migrate` and normal startup

Main tables:

- `guild_settings`
- `guild_role_bindings`
- `grantable_roles`
- `forum_watches`
- `user_timezones`
- `reminders`
- `event_channels`
- `role_cleanup_jobs`
- `role_cleanup_members`

## Operational Commands

- `bun run dev`
- `bun run build`
- `bun run start`
- `bun run test`
- `bun run db:migrate`
- `bun run commands:sync`

Command sync behavior:

- `bun run commands:sync` syncs to every guild the bot is currently installed in
- `bun run commands:sync -- --guild <guild-id>` targets a single guild
- `bun run commands:sync -- --global` registers global application commands

## Environment Variables

- `DISCORD_TOKEN`
- `DISCORD_APPLICATION_ID`
- `DATABASE_PATH`
- `LOG_LEVEL`

## Discord App Requirements

- Required gateway intents:
  - `Guilds`
  - `GuildMembers`
- `Message Content` intent is not required
- Bot role must be above roles that Iris is expected to grant

## UX Decisions That Should Be Preserved

- Prefer `/setup event_categories` in all new UX and docs
- Role granting is allow-list based
  - Iris does not support unrestricted arbitrary role assignment
- Forum notifications mention only configured `forum_notice` roles via `allowedMentions`
- Help output is permission-aware

## Known Constraints

- The bot assumes a single-process runtime
- There is no distributed job locking
- Forum backfill is automatic on startup and manual via `/forum resync`, but only for watched forums
- If the bot is offline for a long time, startup reconciliation depends on Discord thread fetch coverage
- Engine target is `Bun 1.3+`
  - Use `mise trust` after cloning on Windows if `mise.toml` is not yet trusted

## Recommended Files To Read Before Changing Behavior

- `src/app/runtime.ts`
- `src/app/context.ts`
- `src/commands/setup.ts`
- `src/commands/event.ts`
- `src/commands/forum.ts`
- `src/commands/remind.ts`
- `src/domain/guild-config-service.ts`
- `src/domain/guild-health-service.ts`
- `src/domain/forum-watch-service.ts`
- `src/domain/event-service.ts`
- `src/domain/role-cleanup-service.ts`
- `src/lib/i18n.ts`

## Verification Status

The current implementation has been verified with:

- `bun run build`
- `bun run test`
- `bun run db:migrate`
