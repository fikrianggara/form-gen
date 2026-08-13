import { describe, it, expect, beforeEach, afterAll } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { db } from "@/lib/db";
import { truncateAll } from "./helpers";
import { getOptionSetOptions } from "@/services/option-proxy.service";
import { createOptionSet } from "@/services/master-data.service";

beforeEach(async () => {
  await truncateAll();
});

let server: http.Server;
let baseUrl = "";

function startStub(): Promise<void> {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      if (req.url === "/items") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            data: {
              items: [
                { name: "Jakarta", id: "JKT" },
                { name: "Bandung", id: "BDG" },
              ],
            },
          })
        );
        return;
      }
      if (req.url === "/raw") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(["one", "two", "three"]));
        return;
      }
      if (req.url === "/slow") {
        setTimeout(() => {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ items: [{ label: "Late", value: "late" }] }));
        }, 5000);
        return;
      }
      res.writeHead(404);
      res.end();
    });
    server.listen(0, "127.0.0.1", () => {
      baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      resolve();
    });
  });
}

afterAll(() => {
  server?.close();
});

describe("option proxy service", () => {
  it("returns static options unchanged", async () => {
    const set = await createOptionSet({
      name: "Static",
      source: "STATIC",
      options: [
        { label: "A", value: "a" },
        { label: "B", value: "b" },
      ],
    });
    const result = await getOptionSetOptions(set.id);
    expect(result.items).toEqual([
      { label: "A", value: "a" },
      { label: "B", value: "b" },
    ]);
  });

  it("fetches external options through the JSON pointer", async () => {
    await startStub();
    const set = await createOptionSet({
      name: "External",
      source: "EXTERNAL_API",
      apiUrl: `${baseUrl}/items`,
      itemsPath: "data.items",
    });
    const result = await getOptionSetOptions(set.id);
    expect(result.items).toEqual([
      { label: "Jakarta", value: "JKT" },
      { label: "Bandung", value: "BDG" },
    ]);
  });

  it("handles root-array responses", async () => {
    await startStub();
    const set = await createOptionSet({
      name: "Raw",
      source: "EXTERNAL_API",
      apiUrl: `${baseUrl}/raw`,
    });
    const result = await getOptionSetOptions(set.id);
    expect(result.items).toEqual([
      { label: "one", value: "one" },
      { label: "two", value: "two" },
      { label: "three", value: "three" },
    ]);
  });

  it("fails fast on an unreachable API", async () => {
    const set = await createOptionSet({
      name: "Down",
      source: "EXTERNAL_API",
      apiUrl: "http://127.0.0.1:1/nothing",
    });
    await expect(getOptionSetOptions(set.id)).rejects.toThrow();
  });

  it("times out slow APIs", async () => {
    await startStub();
    const set = await createOptionSet({
      name: "Slow",
      source: "EXTERNAL_API",
      apiUrl: `${baseUrl}/slow`,
    });
    await expect(getOptionSetOptions(set.id)).rejects.toThrow(/timeout|timed out|abort/i);
  });

  it("throws for a missing option set", async () => {
    await expect(getOptionSetOptions("missing")).rejects.toThrow(/not found/i);
  });
});
