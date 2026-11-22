import { fmtBytes, fmtClock, scoreTone } from "./format";

test("clock formatting", () => {
  expect(fmtClock(0)).toBe("00:00");
  expect(fmtClock(65)).toBe("01:05");
  expect(fmtClock(3600)).toBe("60:00");
  expect(fmtClock(-5)).toBe("00:00");
});

test("score tones match the report colors", () => {
  expect(scoreTone(null)).toBe("muted");
  expect(scoreTone(85)).toBe("good");
  expect(scoreTone(55)).toBe("warn");
  expect(scoreTone(20)).toBe("bad");
});

test("byte formatting", () => {
  expect(fmtBytes(1500)).toBe("2 KB");
  expect(fmtBytes(2_500_000)).toBe("2.5 MB");
});
