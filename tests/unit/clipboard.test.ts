import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { copyToClipboard } from "@/lib/clipboard";

describe("copyToClipboard", () => {
  const originalNavigator = globalThis.navigator;
  const originalDocument = globalThis.document;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses navigator.clipboard.writeText when available and returns true", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis, "navigator", {
      value: { clipboard: { writeText: writeTextMock } },
      configurable: true,
      writable: true,
    });

    const result = await copyToClipboard("test-api-key-123");
    expect(result).toBe(true);
    expect(writeTextMock).toHaveBeenCalledWith("test-api-key-123");
  });

  it("falls back to document.execCommand when navigator.clipboard throws", async () => {
    const writeTextMock = vi.fn().mockRejectedValue(new Error("Permission denied"));
    const execCommandMock = vi.fn().mockReturnValue(true);
    const appendChildMock = vi.fn();
    const removeChildMock = vi.fn();

    Object.defineProperty(globalThis, "navigator", {
      value: { clipboard: { writeText: writeTextMock } },
      configurable: true,
      writable: true,
    });

    const fakeTextarea = {
      value: "",
      setAttribute: vi.fn(),
      style: {},
      select: vi.fn(),
    };

    Object.defineProperty(globalThis, "document", {
      value: {
        createElement: vi.fn().mockReturnValue(fakeTextarea),
        body: {
          appendChild: appendChildMock,
          removeChild: removeChildMock,
        },
        execCommand: execCommandMock,
      },
      configurable: true,
      writable: true,
    });

    const result = await copyToClipboard("test-fallback-secret");
    expect(result).toBe(true);
    expect(writeTextMock).toHaveBeenCalledWith("test-fallback-secret");
    expect(fakeTextarea.value).toBe("test-fallback-secret");
    expect(fakeTextarea.select).toHaveBeenCalled();
    expect(execCommandMock).toHaveBeenCalledWith("copy");
    expect(appendChildMock).toHaveBeenCalled();
    expect(removeChildMock).toHaveBeenCalled();
  });

  it("returns false if both navigator.clipboard and execCommand fail", async () => {
    Object.defineProperty(globalThis, "navigator", {
      value: undefined,
      configurable: true,
      writable: true,
    });

    Object.defineProperty(globalThis, "document", {
      value: undefined,
      configurable: true,
      writable: true,
    });

    const result = await copyToClipboard("anything");
    expect(result).toBe(false);
  });
});
