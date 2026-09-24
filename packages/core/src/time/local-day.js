const HOURS_PER_DAY = 24;
const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * 지정 시간대에서 보이는 날짜와 시각을 숫자 필드로 변환한다.
 * @param {Date} instant
 * @param {string} timeZone IANA time zone name
 */
function getZonedParts(instant, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23"
  });

  return Object.fromEntries(
    formatter
      .formatToParts(instant)
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, Number(value)])
  );
}

/**
 * 서비스의 기록 날짜(local day)를 YYYY-MM-DD로 반환한다.
 *
 * 예: Asia/Seoul, boundaryHour=4이면 2026-09-24 03:59는 2026-09-23,
 * 04:00은 2026-09-24에 속한다.
 *
 * @param {Date|string|number} value 유효한 시각
 * @param {{timeZone?: string, boundaryHour?: number}} [options]
 */
export function getLocalDay(value, options = {}) {
  const { timeZone = "Asia/Seoul", boundaryHour = 4 } = options;
  const instant = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(instant.getTime())) {
    throw new TypeError("value must be a valid date or timestamp");
  }

  if (!Number.isInteger(boundaryHour) || boundaryHour < 0 || boundaryHour >= HOURS_PER_DAY) {
    throw new RangeError("boundaryHour must be an integer from 0 to 23");
  }

  // 먼저 현지 달력 필드를 얻은 뒤 경계 이전이면 달력상 하루를 뺀다.
  // instant에서 고정 시간을 빼면 DST 전환일에는 현지 경계가 어긋날 수 있다.
  const { year, month, day, hour } = getZonedParts(instant, timeZone);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  const localDayDate = hour < boundaryHour
    ? new Date(calendarDate.getTime() - MILLIS_PER_DAY)
    : calendarDate;

  return localDayDate.toISOString().slice(0, 10);
}
