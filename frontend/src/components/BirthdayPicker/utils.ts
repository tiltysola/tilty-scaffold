export const birthdayStartMonth = new Date(1900, 0, 1);
export const defaultBirthdayMonth = new Date(2000, 0, 1);

export function buildBirthdayYearOptions(today: Date) {
  const years: string[] = [];

  for (let year = today.getFullYear(); year >= birthdayStartMonth.getFullYear(); year -= 1) {
    years.push(String(year));
  }

  return years;
}

export function clampBirthdayMonth(month: Date, today: Date) {
  const monthOffset = getBirthdayMonthOffset(month);
  const startOffset = getBirthdayMonthOffset(birthdayStartMonth);
  const endOffset = getBirthdayMonthOffset(today);

  if (monthOffset < startOffset) {
    return birthdayStartMonth;
  }

  if (monthOffset > endOffset) {
    return new Date(today.getFullYear(), today.getMonth(), 1);
  }

  return new Date(month.getFullYear(), month.getMonth(), 1);
}

export function getBirthdayMonthOffset(date: Date) {
  return date.getFullYear() * 12 + date.getMonth();
}

export function parseBirthdayDateOnly(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  return formatBirthdayDateOnly(date) === value ? date : null;
}

export function formatBirthdayDateOnly(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}
