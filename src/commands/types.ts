import type {
  AutocompleteInteraction,
  ButtonInteraction,
  ChatInputCommandInteraction,
  ModalSubmitInteraction,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from 'discord.js';
import type { DatabaseHandle } from '../db/client.js';
import type { RoleScope } from '../db/types.js';

export type CommandVisibility = 'everyone' | 'admin' | 'manager';

export type CommandContext = {
  env: import('../app/env.js').AppEnv;
  logger: import('pino').Logger;
  db: DatabaseHandle;
  client: import('discord.js').Client<true> | import('discord.js').Client;
  services: import('../app/context.js').AppServices;
  commands: CommandDefinition[];
};

export type CommandMetadata = {
  name: string;
  summary: string;
  usage: string;
  visibility: CommandVisibility;
  scopes?: RoleScope[];
};

export type CommandDefinition = {
  data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder;
  meta: CommandMetadata;
  execute: (ctx: CommandContext, interaction: ChatInputCommandInteraction) => Promise<void>;
  autocomplete?: (ctx: CommandContext, interaction: AutocompleteInteraction) => Promise<boolean>;
  handleModal?: (ctx: CommandContext, interaction: ModalSubmitInteraction) => Promise<boolean>;
  handleButton?: (ctx: CommandContext, interaction: ButtonInteraction) => Promise<boolean>;
};
