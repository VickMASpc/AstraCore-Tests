import type { Command } from "./command.types.js";

const placeholderCommands: readonly Command[] = [
  {
    name: "ping",
    aliases: [],
    mode: "system",
    description: "Check whether the router is responsive.",
    rateLimitKey: "system.ping",
    handler: () => ({ ok: true, reply: "pong" })
  },
  {
    name: "help",
    aliases: ["commands"],
    mode: "system",
    description: "List available commands grouped by mode.",
    rateLimitKey: "system.help",
    handler: () => ({ ok: true, reply: "" })
  }
] as const;

export function createCommandRegistry(extraCommands: readonly Command[] = []): Command[] {
  const commands = [...placeholderCommands, ...extraCommands];
  const helpCommand = commands.find((command) => command.name === "help");

  if (helpCommand) {
    helpCommand.handler = () => ({
      ok: true,
      reply: buildHelpText(commands)
    });
  }

  return commands;
}

function buildHelpText(commands: readonly Command[]): string {
  const grouped = new Map<string, string[]>();

  for (const command of commands) {
    const names = grouped.get(command.mode) ?? [];
    names.push(`!${command.name}`);
    grouped.set(command.mode, names);
  }

  return ["system", "profile", "ai", "rpg"]
    .map((mode) => {
      const names = grouped.get(mode) ?? [];
      return names.length === 0 ? null : `${mode}:\n${names.join("\n")}`;
    })
    .filter((value): value is string => value !== null)
    .join("\n\n");
}
