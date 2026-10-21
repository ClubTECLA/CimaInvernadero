export function parsePositiveInteger(value, fallback, maximum = Infinity) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum) {
    return null;
  }

  return parsed;
}

export function isIsoDate(value) {
  if (value === undefined || value === null || value === "") return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function isIsoDateTime(value) {
  if (value === undefined || value === null || value === "") return true;
  const match = /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.exec(value);
  return Boolean(match && isIsoDate(match[1]) && Number.isFinite(Date.parse(value)));
}

export function isIsoDateOrDateTime(value) {
  return value === undefined || value === null || value === "" || isIsoDate(value) || isIsoDateTime(value);
}

export function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}
