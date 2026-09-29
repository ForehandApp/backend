export function getDate(date: string): Date {
  const utcDate = new Date(date);
  const systemDate = new Date(
    utcDate.getTime() - utcDate.getTimezoneOffset() * 60000,
  );
  return systemDate;
}

function getDateOnlyParts(value: string | Date): {
  year: number;
  month: number;
  day: number;
} {
  if (value instanceof Date) {
    return {
      year: value.getUTCFullYear(),
      month: value.getUTCMonth() + 1,
      day: value.getUTCDate(),
    };
  }

  const trimmed = value.trim();
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return {
      year: Number(isoMatch[1]),
      month: Number(isoMatch[2]),
      day: Number(isoMatch[3]),
    };
  }

  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    return {
      year: Number(slashMatch[3]),
      month: Number(slashMatch[2]),
      day: Number(slashMatch[1]),
    };
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid date");
  }

  return {
    year: parsed.getUTCFullYear(),
    month: parsed.getUTCMonth() + 1,
    day: parsed.getUTCDate(),
  };
}

export function getDateOnly(value: string | Date): Date {
  const { year, month, day } = getDateOnlyParts(value);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    throw new Error("Invalid date");
  }

  return date;
}

export function formatDateOnly(value: string | Date): string {
  const { year, month, day } = getDateOnlyParts(value);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function getDateOnlyTime(value: string | Date): number {
  return getDateOnly(value).getTime();
}

const APP_TIMEZONE_OFFSET_MINUTES = 330;
const APP_TIMEZONE_OFFSET_MS = APP_TIMEZONE_OFFSET_MINUTES * 60 * 1000;

function getAppDateOnlyParts(value: string | Date): {
  year: number;
  month: number;
  day: number;
} {
  if (typeof value === "string") {
    const slashMatch = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slashMatch) {
      return {
        year: Number(slashMatch[3]),
        month: Number(slashMatch[2]),
        day: Number(slashMatch[1]),
      };
    }
  }

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid date");
  }

  const appTime = new Date(parsed.getTime() + APP_TIMEZONE_OFFSET_MS);
  return {
    year: appTime.getUTCFullYear(),
    month: appTime.getUTCMonth() + 1,
    day: appTime.getUTCDate(),
  };
}

export function getAppDateOnly(value: string | Date): Date {
  const { year, month, day } = getAppDateOnlyParts(value);
  return new Date(Date.UTC(year, month - 1, day));
}

export function getAppDateOnlyEndTime(value: string | Date): number {
  const { year, month, day } = getAppDateOnlyParts(value);
  return (
    Date.UTC(year, month - 1, day, 23, 59, 59, 999) -
    APP_TIMEZONE_OFFSET_MS
  );
}
