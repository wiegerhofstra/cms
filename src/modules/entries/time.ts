// Local wall-clock time; deliberately excludes dates, seconds and UTC offsets.
export const timePattern = "^([01][0-9]|2[0-3]):[0-5][0-9]$";
const timeRegex = new RegExp(timePattern);

export function isValidTimeValue(value: unknown): boolean {
  return value === undefined || value === null || value === "" ||
    (typeof value === "string" && value.length === 5 && timeRegex.test(value));
}
