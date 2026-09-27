import assert from "node:assert/strict";
import { test } from "node:test";
import { isValidTimeValue } from "./time.ts";

test("local times accept midnight and the last minute without date/timezone conversions", () => {
  for (const value of ["00:00", "09:05", "12:30", "23:59", "", null, undefined]) assert.equal(isValidTimeValue(value), true);
});

test("invalid times, seconds, offsets and non-string values are rejected", () => {
  for (const value of ["24:00", "23:60", "9:05", "09:5", "09:05:00", "09:05Z", "09:05+02:00", " 09:05", "09:05\n", "2026-09-27T09:05", 905, true, {}, []]) {
    assert.equal(isValidTimeValue(value), false, JSON.stringify(value));
  }
});
