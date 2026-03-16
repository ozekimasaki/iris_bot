import {
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  type Interaction,
} from 'discord.js';
import type { AppEnv } from './env.js';
import type { Logger } from 'pino';
import { createRuntimeContext } from './context.js';
import { buildCommands } from '../commands/index.js';
import { t } from '../lib/i18n.js';

const REMINDER_INTERVAL_MS = 60_000;

type RuntimeWithCommands = ReturnType<typeof createRuntimeContext> & {
  commands: ReturnType<typeof buildCommands>;
};

async function handleInteraction(runtime: RuntimeWithCommands, interaction: Interaction) {
  const commands = runtime.commands;
  const ctx = {
    ...runtime,
    commands,
  };

  if (interaction.isAutocomplete()) {
    const command = commands.find((item) => item.meta.name === interaction.commandName);
    if (command?.autocomplete) {
      const handled = await command.autocomplete(ctx, interaction);
      if (!handled) {
        await interaction.respond([]);
      }
      return;
    }

    await interaction.respond([]);
    return;
  }

  if (interaction.isModalSubmit()) {
    for (const command of commands) {
      if (command.handleModal && await command.handleModal(ctx, interaction)) {
        return;
      }
    }
    return;
  }

  if (interaction.isButton()) {
    for (const command of commands) {
      if (command.handleButton && await command.handleButton(ctx, interaction)) {
        return;
      }
    }
    return;
  }

  if (!interaction.isChatInputCommand()) {
    return;
  }

  const command = commands.find((item) => item.meta.name === interaction.commandName);
  if (!command) {
    const locale = interaction.inGuild() ? await runtime.services.guildConfig.getLanguage(interaction.guildId!) : 'en';
    await interaction.reply({ content: t(locale, 'common.unknownCommand'), flags: MessageFlags.Ephemeral });
    return;
  }

  await command.execute(ctx, interaction);
}

async function processReminderJobs(runtime: ReturnType<typeof createRuntimeContext>) {
  const dueReminders = await runtime.services.reminders.getDueReminders();
  for (const reminder of dueReminders) {
    try {
      const channel = await runtime.client.channels.fetch(reminder.channelId);
      if (!channel || !('send' in channel)) {
        runtime.logger.warn({ reminderId: reminder.id }, 'reminder channel missing');
        await runtime.services.reminders.completeReminder(reminder.id);
        continue;
      }

      const mentions = [
        reminder.targetUserId ? `<@${reminder.targetUserId}>` : null,
        reminder.targetRoleId ? `<@&${reminder.targetRoleId}>` : null,
      ].filter(Boolean).join(' ');

      await channel.send({
        content: [mentions, reminder.content].filter(Boolean).join('\n'),
        allowedMentions: {
          users: reminder.targetUserId ? [reminder.targetUserId] : [],
          roles: reminder.targetRoleId ? [reminder.targetRoleId] : [],
        },
      });

      if (reminder.repeatDays) {
        await runtime.services.reminders.rescheduleReminder(
          reminder.id,
          reminder.nextRunAt,
          reminder.timezone,
          reminder.repeatDays,
        );
      } else {
        await runtime.services.reminders.completeReminder(reminder.id);
      }
    } catch (error) {
      runtime.logger.error({ err: error, reminderId: reminder.id }, 'reminder dispatch failed');
    }
  }
}

async function processRoleCleanupJobs(runtime: ReturnType<typeof createRuntimeContext>) {
  await runtime.services.roleCleanup.processDueJobs(runtime.client);
}

export function createBot(env: AppEnv, logger: Logger) {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
    ],
  });

  const runtime = createRuntimeContext(env, logger, client);
  const commands = buildCommands();
  const runtimeWithCommands: RuntimeWithCommands = { ...runtime, commands };

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      await handleInteraction(runtimeWithCommands, interaction);
    } catch (error) {
      logger.error({ err: error }, 'interaction handling failed');
      if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
        const locale = interaction.inGuild() ? await runtime.services.guildConfig.getLanguage(interaction.guildId!) : 'en';
        await interaction.reply({ content: t(locale, 'common.unexpectedError'), flags: MessageFlags.Ephemeral });
      }
    }
  });

  client.on(Events.ThreadCreate, async (thread, newlyCreated) => {
    if (!newlyCreated) {
      return;
    }

    try {
      await runtime.services.forums.handleThreadCreate(thread);
    } catch (error) {
      logger.error({ err: error, threadId: thread.id }, 'forum thread handler failed');
    }
  });

  client.once(Events.ClientReady, async () => {
    logger.info({ user: client.user?.tag }, 'Iris is ready');

    runtime.services.forums.reconcileMissedThreads(client).catch((error) => {
      logger.error({ err: error }, 'forum startup reconciliation failed');
    });

    setInterval(() => {
      processReminderJobs(runtime)
        .then(() => processRoleCleanupJobs(runtime))
        .catch((error) => logger.error({ err: error }, 'background job failed'));
    }, REMINDER_INTERVAL_MS);
  });

  return client;
}
