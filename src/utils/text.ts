export type ParsedCommand = {
  name: string;
  args: string[];
  rawArgs: string;
};

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeCommandName(input: string): string {
  return stripAccents(input).trim().toLowerCase();
}

export function truncateText(value: string, maxLength: number): string {
  if (maxLength < 1) {
    throw new RangeError("maxLength must be greater than 0");
  }

  if (value.length <= maxLength) {
    return value;
  }

  if (maxLength <= 3) {
    return value.slice(0, maxLength);
  }

  return `${value.slice(0, maxLength - 3)}...`;
}

export function splitCommand(rawText: string, prefix: string): ParsedCommand | null {
  if (prefix.trim().length === 0) {
    throw new RangeError("prefix must not be empty");
  }

  if (!rawText.startsWith(prefix)) {
    return null;
  }

  const withoutPrefix = rawText.slice(prefix.length);
  const trimmedStart = withoutPrefix.trimStart();

  if (trimmedStart.length === 0) {
    return null;
  }

  const firstWhitespaceIndex = trimmedStart.search(/\s/);
  const rawName =
    firstWhitespaceIndex === -1 ? trimmedStart : trimmedStart.slice(0, firstWhitespaceIndex);
  const rawArgs = firstWhitespaceIndex === -1 ? "" : trimmedStart.slice(firstWhitespaceIndex + 1);
  const normalizedRawArgs = rawArgs.replace(/^\s+/, "");

  return {
    name: normalizeCommandName(rawName),
    args:
      normalizedRawArgs.length === 0
        ? []
        : normalizedRawArgs.split(/\s+/).filter((value) => value.length > 0),
    rawArgs: normalizedRawArgs
  };
}
