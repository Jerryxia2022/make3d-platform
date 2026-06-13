const STORED_SQLITE_UTC_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
const EXPLICIT_TIMEZONE_PATTERN = /(Z|[+-]\d{2}:?\d{2})$/i;

export function formatBeijingDateTime(value: string) {
  const date = parseStoredDateTime(value);

  if (Number.isNaN(date.getTime())) {
    return value || "-";
  }

  return date.toLocaleString("zh-CN", {
    hour12: false,
    timeZone: "Asia/Shanghai",
  });
}

function parseStoredDateTime(value: string) {
  const normalized = value.trim();

  if (EXPLICIT_TIMEZONE_PATTERN.test(normalized)) {
    return new Date(normalized);
  }

  if (STORED_SQLITE_UTC_PATTERN.test(normalized)) {
    return new Date(`${normalized.replace(" ", "T")}Z`);
  }

  return new Date(normalized);
}
