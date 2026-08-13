import { describe, it, expect } from "vitest";
import { resolveItemsPath, mapOptionItem } from "@/domain/options";

describe("resolveItemsPath", () => {
  it("returns the root array for an empty path", () => {
    expect(resolveItemsPath([{ a: 1 }], "")).toEqual([{ a: 1 }]);
    expect(resolveItemsPath([{ a: 1 }], undefined)).toEqual([{ a: 1 }]);
  });

  it("resolves a dotted path", () => {
    const data = { data: { items: [{ id: "1" }, { id: "2" }] } };
    expect(resolveItemsPath(data, "data.items")).toEqual([{ id: "1" }, { id: "2" }]);
  });

  it("resolves a single-segment path", () => {
    expect(resolveItemsPath({ list: [1, 2] }, "list")).toEqual([1, 2]);
  });

  it("throws when the path resolves to a non-array", () => {
    expect(() => resolveItemsPath({ data: { items: "nope" } }, "data.items")).toThrow(/array/i);
  });

  it("throws when the path is missing", () => {
    expect(() => resolveItemsPath({ data: {} }, "data.items")).toThrow(/array/i);
  });
});

describe("mapOptionItem", () => {
  it("uses label and value keys when present", () => {
    expect(mapOptionItem({ label: "Apple", value: "apple" })).toEqual({
      label: "Apple",
      value: "apple",
    });
  });

  it("falls back to name/title for label", () => {
    expect(mapOptionItem({ name: "Banana", value: "b" })).toEqual({
      label: "Banana",
      value: "b",
    });
    expect(mapOptionItem({ title: "Cherry", value: "c" })).toEqual({
      label: "Cherry",
      value: "c",
    });
  });

  it("falls back to id/code for value", () => {
    expect(mapOptionItem({ label: "Durian", id: "d1" })).toEqual({
      label: "Durian",
      value: "d1",
    });
    expect(mapOptionItem({ label: "Elderberry", code: "e" })).toEqual({
      label: "Elderberry",
      value: "e",
    });
  });

  it("coerces primitive items to strings", () => {
    expect(mapOptionItem("fig")).toEqual({ label: "fig", value: "fig" });
    expect(mapOptionItem(42)).toEqual({ label: "42", value: "42" });
  });

  it("normalizes values to strings", () => {
    expect(mapOptionItem({ label: "Grape", value: 7 })).toEqual({
      label: "Grape",
      value: "7",
    });
  });
});
