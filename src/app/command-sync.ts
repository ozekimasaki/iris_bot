import { once } from 'node:events';
import {
  Client,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
} from 'discord.js';
import { loadEnv } from './env.js';
import { createLogger } from './logger.js';
import { buildCommands } from '../commands/index.js';

function parseArgs(argv: string[]) {
  const guildIndex = argv.indexOf('--guild');
  const global = argv.includes('--global');
  return {
    guildId: guildIndex >= 0 ? argv[guildIndex + 1] : undefined,
    global,
  };
}

async function resolveInstalledGuildIds(token: string) {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  try {
    const readyPromise = once(client, Events.ClientReady);
    await client.login(token);
    await readyPromise;
    const guilds = await client.guilds.fetch();
    return guilds.map((guild) => guild.id);
  } finally {
    client.destroy();
  }
}

async function main() {
  const env = loadEnv();
  const logger = createLogger(env);
  const args = parseArgs(process.argv.slice(2));
  const commands = buildCommands().map((command) => command.data.toJSON());
  const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);

  if (args.global) {
    await rest.put(
      Routes.applicationCommands(env.DISCORD_APPLICATION_ID),
      { body: commands },
    );
    logger.info('synced commands globally');
    return;
  }

  if (args.guildId) {
    await rest.put(
      Routes.applicationGuildCommands(env.DISCORD_APPLICATION_ID, args.guildId),
      { body: commands },
    );
    logger.info({ guildId: args.guildId }, 'synced commands to guild');
    return;
  }

  const installedGuildIds = await resolveInstalledGuildIds(env.DISCORD_TOKEN);
  if (installedGuildIds.length === 0) {
    throw new Error('The bot is not installed in any guilds yet. Use --global or invite the bot first.');
  }

  for (const guildId of installedGuildIds) {
    await rest.put(
      Routes.applicationGuildCommands(env.DISCORD_APPLICATION_ID, guildId),
      { body: commands },
    );
    logger.info({ guildId }, 'synced commands to guild');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
