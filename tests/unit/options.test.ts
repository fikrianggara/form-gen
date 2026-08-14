import { describe, it, expect } from "vitest";
import { resolveItemsPath, mapOptionItem, getPath, mapOptionItemWithKeys } from "@/domain/options";

describe("getPath (nested keys)", () => {
  const item = { user: { name: "Budi", id: 7 }, attributes: { code: "ID-7" }, label: "Direct" };

  it("resolves nested dotted paths", () => {
    expect(getPath(item, "user.name")).toBe("Budi");
    expect(getPath(item, "attributes.code")).toBe("ID-7");
  });

  it("returns undefined for missing segments", () => {
    expect(getPath(item, "user.missing")).toBeUndefined();
    expect(getPath(item, "nope.deep")).toBeUndefined();
    expect(getPath(item, "user.name.deeper")).toBeUndefined();
  });

  it("returns undefined for null/empty paths", () => {
    expect(getPath(item, null)).toBeUndefined();
    expect(getPath(item, "")).toBeUndefined();
  });
});

describe("mapOptionItemWithKeys", () => {
  const items = [
    { user: { name: "Budi", id: 7 }, attributes: { code: "ID-7" } },
    { user: { name: "Sari", id: 8 }, attributes: { code: "ID-8" } },
  ];

  it("maps nested keys when provided", () => {
    const mapped = items.map((i) => mapOptionItemWithKeys(i, "user.name", "attributes.code"));
    expect(mapped).toEqual([
      { label: "Budi", value: "ID-7" },
      { label: "Sari", value: "ID-8" },
    ]);
  });

  it("falls back to standard keys when a nested key is missing", () => {
    const item = { name: "Ani", id: "A1" };
    expect(mapOptionItemWithKeys(item, "user.name", "attributes.code")).toEqual({ label: "Ani", value: "A1" });
  });

  it("falls back to default mapping when no keys given", () => {
    expect(mapOptionItemWithKeys({ label: "L", value: "V" }, null, null)).toEqual({ label: "L", value: "V" });
    expect(mapOptionItemWithKeys({ label: "L", value: "V" }, undefined, undefined)).toEqual({ label: "L", value: "V" });
  });

  it("keeps resolveItemsPath behavior for the items array", () => {
    const payload = { data: { items } };
    expect(resolveItemsPath(payload, "data.items")).toHaveLength(2);
  });
});

describe("mapOptionItem (defaults)", () => {
  it("maps label > name > title", () => {
    expect(mapOptionItem({ title: "T" })).toEqual({ label: "T", value: "T" });
    expect(mapOptionItem({ name: "N" })).toEqual({ label: "N", value: "N" });
  });
  it("maps value > id > code", () => {
    expect(mapOptionItem({ label: "L", code: "C" })).toEqual({ label: "L", value: "C" });
    expect(mapOptionItem({ label: "L", id: "I" })).toEqual({ label: "L", value: "I" });
  });
});
