import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';

export function buildErrorEmbed(title: string, description: string) {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(0xed4245)
    .setTimestamp();
}

export function buildInfoEmbed(title: string, description: string) {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(0x5865f2)
    .setTimestamp();
}

export function buildConfirmRow(
  confirmId: string,
  cancelId: string,
  labels?: {
    confirm: string;
    cancel: string;
  },
) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(confirmId)
      .setLabel(labels?.confirm ?? 'Confirm')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(cancelId)
      .setLabel(labels?.cancel ?? 'Cancel')
      .setStyle(ButtonStyle.Secondary),
  );
}

export function makeOpaqueId(prefix?: string) {
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return prefix ? `${prefix}_${id}` : id;
}

export function makeReminderId() {
  return makeOpaqueId();
}
