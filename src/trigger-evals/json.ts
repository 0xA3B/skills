export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// One JSONL event iterator shared by the Claude and Codex stream parsers so event framing cannot
// drift between the two agents.
export function parseJsonlEvents(stdout: string): unknown[] {
  const events: unknown[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.startsWith("{")) {
      continue;
    }

    try {
      events.push(JSON.parse(line));
    } catch {
      // Ignore non-event output.
    }
  }

  return events;
}
