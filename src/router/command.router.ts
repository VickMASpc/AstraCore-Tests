import { normalizeCommandName, splitCommand } from "../utils/text.js";
import { enforceCommandPermissions } from "./permissions.js";
import type { Command, CommandRouteResult, IncomingMessageContext } from "./command.types.js";
import type { RateLimiter } from "./rateLimits.js";

export class CommandRouter {
  private readonly commands: readonly Command[];
  private readonly prefix: string;
  private readonly rateLimiter: RateLimiter;

  public constructor(options: {
    commands: readonly Command[];
    prefix: string;
    rateLimiter: RateLimiter;
  }) {
    this.commands = options.commands;
    this.prefix = options.prefix;
    this.rateLimiter = options.rateLimiter;
  }

  public async route(context: IncomingMessageContext): Promise<CommandRouteResult> {
    const parsed = splitCommand(context.commandText, this.prefix);

    if (!parsed) {
      return {
        ok: false,
        status: "ignored",
        reason: "Message does not match the configured command prefix."
      };
    }

    const command = this.resolveCommand(parsed.name);

    if (!command) {
      return {
        ok: false,
        status: "unknown_command",
        reason: `Unknown command: ${parsed.name}`
      };
    }

    const normalizedContext: IncomingMessageContext = {
      ...context,
      commandName: command.name,
      args: parsed.args,
      rawArgs: parsed.rawArgs
    };

    const permissionFailure = enforceCommandPermissions(command, normalizedContext);

    if (permissionFailure) {
      return permissionFailure;
    }

    const rateLimitDecision = this.rateLimiter.check(command.rateLimitKey, normalizedContext);

    if (!rateLimitDecision.allowed) {
      return {
        ok: false,
        status: "rate_limited",
        reason: rateLimitDecision.reason
      };
    }

    const result = await command.handler(normalizedContext);

    return {
      ok: true,
      status: "handled",
      command,
      result
    };
  }

  private resolveCommand(input: string): Command | undefined {
    const normalizedInput = normalizeCommandName(input);

    return this.commands.find((command) => {
      if (normalizeCommandName(command.name) === normalizedInput) {
        return true;
      }

      return command.aliases.some((alias) => normalizeCommandName(alias) === normalizedInput);
    });
  }
}
