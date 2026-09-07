const ISO_PATTERN =
  /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>\d{2}):(?<minute>\d{2})(?::(?<second>\d{2}))?(?<offset>[+-]\d{2}:\d{2})?/;

// Parses an ISO 8601 timestamp into its components. Returns null when the input does not match.
export function parseIso(value) {
  const match = ISO_PATTERN.exec(value);
  if (match === null) {
    return null;
  }
  const { year, month, day, hour, minute, second, offset } = match.groups;
  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    second: second === undefined ? 0 : Number(second),
    offset: offset ?? null,
  };
}
