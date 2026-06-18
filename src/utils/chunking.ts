function findChunkBoundary(text: string, maxChars: number): number {
  const candidate = text.slice(0, maxChars);
  const paragraphBreak = candidate.lastIndexOf("\n\n");

  if (paragraphBreak > 0) {
    return paragraphBreak + 2;
  }

  const newlineBreak = candidate.lastIndexOf("\n");

  if (newlineBreak > 0) {
    return newlineBreak + 1;
  }

  const spaceBreak = candidate.lastIndexOf(" ");

  if (spaceBreak > 0) {
    return spaceBreak + 1;
  }

  return maxChars;
}

export function chunkText(value: string, maxChunkLength: number): string[] {
  if (maxChunkLength < 1) {
    throw new RangeError("maxChunkLength must be greater than 0");
  }

  if (value.length === 0) {
    return [];
  }

  const chunks: string[] = [];
  let remaining = value;

  while (remaining.length > maxChunkLength) {
    const splitIndex = findChunkBoundary(remaining, maxChunkLength);
    chunks.push(remaining.slice(0, splitIndex));
    remaining = remaining.slice(splitIndex);
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}

export function chunkWhatsAppText(text: string, maxChars: number): string[] {
  return chunkText(text, maxChars);
}
