import { describe, it, expect } from "vitest";
import {
  extractAnswerValue,
  isAnswerEmpty,
  serializeDateValue,
} from "@/domain/answers";
import type { QuestionType } from "@prisma/client";

function rec(partial: Record<string, unknown>) {
  return partial as never;
}

describe("extractAnswerValue", () => {
  it("extracts text for TEXT questions", () => {
    expect(extractAnswerValue("TEXT", rec({ textValue: "hello" }))).toBe("hello");
  });

  it("extracts text for TEXTAREA", () => {
    expect(extractAnswerValue("TEXTAREA", rec({ textValue: "long" }))).toBe("long");
  });

  it("extracts number for NUMBER", () => {
    expect(extractAnswerValue("NUMBER", rec({ numberValue: 42 }))).toBe(42);
  });

  it("extracts number for RATING", () => {
    expect(extractAnswerValue("RATING", rec({ numberValue: 4 }))).toBe(4);
  });

  it("extracts ISO date for DATE", () => {
    expect(
      extractAnswerValue("DATE", rec({ dateValue: new Date("2026-08-13T00:00:00Z") }))
    ).toBe("2026-08-13");
  });

  it("extracts selected value for RADIO", () => {
    expect(extractAnswerValue("RADIO", rec({ textValue: "opt_b" }))).toBe("opt_b");
  });

  it("extracts selected value for SELECT", () => {
    expect(extractAnswerValue("SELECT", rec({ textValue: "opt_c" }))).toBe("opt_c");
  });

  it("extracts string array for CHECKBOX", () => {
    expect(
      extractAnswerValue("CHECKBOX", rec({ jsonValue: ["a", "b"] }))
    ).toEqual(["a", "b"]);
  });

  it("returns null when the record has no values", () => {
    expect(extractAnswerValue("TEXT", rec({}))).toBeNull();
  });
});

describe("isAnswerEmpty", () => {
  const cases: Array<[QuestionType, unknown, boolean]> = [
    ["TEXT", "", true],
    ["TEXT", "   ", true],
    ["TEXT", "x", false],
    ["TEXTAREA", "", true],
    ["TEXTAREA", "line", false],
    ["NUMBER", null, true],
    ["NUMBER", 0, false],
    ["DATE", null, true],
    ["DATE", "2026-01-01", false],
    ["RADIO", "", true],
    ["RADIO", "opt", false],
    ["SELECT", "", true],
    ["SELECT", "opt", false],
    ["CHECKBOX", [], true],
    ["CHECKBOX", ["a"], false],
    ["RATING", null, true],
    ["RATING", 3, false],
  ];

  it.each(cases)("%s with %j -> %s", (type, value, expected) => {
    expect(isAnswerEmpty(type as QuestionType, value as never)).toBe(expected);
  });
});

describe("serializeDateValue", () => {
  it("formats a Date as yyyy-MM-dd", () => {
    expect(serializeDateValue(new Date("2026-08-13T00:00:00Z"))).toBe("2026-08-13");
  });
});
