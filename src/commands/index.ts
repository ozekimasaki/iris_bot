import type { CommandDefinition } from './types.js';
import { eventCommand } from './event.js';
import { forumCommand } from './forum.js';
import { helpCommand } from './help.js';
import { memberCommand } from './member.js';
import { remindCommand } from './remind.js';
import { roleCommand } from './role.js';
import { setupCommand } from './setup.js';

export function buildCommands(): CommandDefinition[] {
  return [
    helpCommand,
    setupCommand,
    remindCommand,
    forumCommand,
    roleCommand,
    eventCommand,
    memberCommand,
  ];
}
