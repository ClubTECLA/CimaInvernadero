import test from "node:test";
import assert from "node:assert/strict";

import {
  isFiniteNumber,
  isIsoDate,
  isIsoDateTime,
  isIsoDateOrDateTime,
  parsePositiveInteger,
} from "./validation.js";

test("parsePositiveInteger accepts bounded positive integers", () => {
  assert.equal(parsePositiveInteger("12", 1, 100), 12);
  assert.equal(parsePositiveInteger(undefined, 20, 100), 20);
  assert.equal(parsePositiveInteger("0", 1, 100), null);
  assert.equal(parsePositiveInteger("1.5", 1, 100), null);
  assert.equal(parsePositiveInteger("101", 1, 100), null);
});

test("isIsoDate rejects impossible or malformed dates", () => {
  assert.equal(isIsoDate("2026-09-21"), true);
  assert.equal(isIsoDate("2026-02-29"), false);
  assert.equal(isIsoDate("21/09/2026"), false);
  assert.equal(isIsoDate(""), true);
});

test("isIsoDateTime accepts valid zoned datetimes and rejects invalid values", () => {
  assert.equal(isIsoDateTime("2026-10-10T17:30:00.000Z"), true);
  assert.equal(isIsoDateTime("2026-10-10T10:30:00-07:00"), true);
  assert.equal(isIsoDateTime("2026-02-31T17:30:00.000Z"), false);
  assert.equal(isIsoDateTime("2026-10-10T25:30:00.000Z"), false);
  assert.equal(isIsoDateOrDateTime("2026-10-10"), true);
  assert.equal(isIsoDateOrDateTime("not-a-date"), false);
});

test("isFiniteNumber only accepts finite numeric values", () => {
  assert.equal(isFiniteNumber(22.4), true);
  assert.equal(isFiniteNumber("22.4"), false);
  assert.equal(isFiniteNumber(Number.NaN), false);
  assert.equal(isFiniteNumber(Infinity), false);
});
