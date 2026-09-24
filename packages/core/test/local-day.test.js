import test from "node:test";
import assert from "node:assert/strict";

import { getLocalDay } from "../src/time/local-day.js";

test("KST 04:00 직전은 전날 기록에 포함한다", () => {
  assert.equal(getLocalDay("2026-09-23T18:59:59.999Z"), "2026-09-23");
});

test("KST 04:00부터 새 기록 날짜를 시작한다", () => {
  assert.equal(getLocalDay("2026-09-23T19:00:00.000Z"), "2026-09-24");
});

test("KST 자정 이후라도 04:00 전이면 전날이다", () => {
  assert.equal(getLocalDay("2026-09-24T16:30:00.000Z"), "2026-09-24");
});

test("경계 시간이 0이면 현지 달력 날짜를 그대로 사용한다", () => {
  assert.equal(
    getLocalDay("2026-09-23T15:00:00.000Z", { boundaryHour: 0 }),
    "2026-09-24"
  );
});

test("다른 IANA 시간대도 처리한다", () => {
  assert.equal(
    getLocalDay("2026-09-24T07:30:00.000Z", {
      timeZone: "America/New_York",
      boundaryHour: 4
    }),
    "2026-09-23"
  );
});

test("DST 시작일에도 현지 04:00 경계를 유지한다", () => {
  assert.equal(
    getLocalDay("2026-03-08T07:30:00.000Z", {
      timeZone: "America/New_York",
      boundaryHour: 4
    }),
    "2026-03-07"
  );

  assert.equal(
    getLocalDay("2026-03-08T08:00:00.000Z", {
      timeZone: "America/New_York",
      boundaryHour: 4
    }),
    "2026-03-08"
  );
});

test("잘못된 날짜를 거부한다", () => {
  assert.throws(() => getLocalDay("not-a-date"), TypeError);
});

test("0~23 범위 밖 경계 시간을 거부한다", () => {
  assert.throws(() => getLocalDay(Date.now(), { boundaryHour: 24 }), RangeError);
  assert.throws(() => getLocalDay(Date.now(), { boundaryHour: 3.5 }), RangeError);
});

test("잘못된 시간대 이름을 거부한다", () => {
  assert.throws(
    () => getLocalDay(Date.now(), { timeZone: "Invalid/Zone" }),
    RangeError
  );
});
