"use client";

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function parseDateInput(value: string | Date) {
  if (value instanceof Date) {
    return new Date(value.getTime());
  }

  if (DATE_ONLY_PATTERN.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  return new Date(value);
}

export function formatDateOnly(value: string | Date) {
  const date = parseDateInput(value);
  const year = `${date.getFullYear()}`;
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDisplayDate(value: string | Date) {
  const date = parseDateInput(value);
  const year = `${date.getFullYear()}`;
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${day}/${month}/${year}`;
}

export function formatDisplayDateTime(value: string | Date) {
  const date = parseDateInput(value);
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${formatDisplayDate(date)} ${hours}:${minutes}`;
}

export function getTodayLocal() {
  return formatDateOnly(new Date());
}

export function shiftDateString(value: string, amount: number) {
  const next = parseDateInput(value);
  next.setDate(next.getDate() + amount);
  return formatDateOnly(next);
}

export function createDateWindow(centerDate: string, radius: number) {
  const start = parseDateInput(centerDate);
  start.setDate(start.getDate() - radius);

  return Array.from({ length: radius * 2 + 1 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return formatDateOnly(day);
  });
}

export function normalizeDateForMonth(selectedDate: string, monthValue: string) {
  const day = Number(selectedDate.slice(-2));
  const [year, month] = monthValue.split("-").map(Number);
  const maxDay = new Date(year, month, 0).getDate();
  const clamped = Math.min(day, maxDay);
  return `${monthValue}-${`${clamped}`.padStart(2, "0")}`;
}

export function formatDateValue(
  value: string | Date,
  options: Intl.DateTimeFormatOptions,
  locale = "tr-TR"
) {
  return new Intl.DateTimeFormat(locale, options).format(parseDateInput(value));
}
