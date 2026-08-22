import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Hero } from "@/components/landing/Hero";
import * as httpModule from "@/lib/http";

vi.mock("@/components/landing/HeroInteractive", () => ({
  HeroInteractive: () => React.createElement("div", { "data-testid": "hero-interactive" }),
}));

describe("Hero landing header auth awareness", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders Sign in link and hides Dashboard when session is null (anonymous)", async () => {
    vi.spyOn(httpModule, "getSession").mockResolvedValue(null);

    const element = await Hero();
    const html = renderToStaticMarkup(element);

    expect(html).toContain('href="/login"');
    expect(html).toContain("Sign in");
    expect(html).not.toContain('href="/dashboard"');
    expect(html).not.toContain("Dashboard");
  });

  it("renders username, role badge, and Dashboard link when session is active", async () => {
    vi.spyOn(httpModule, "getSession").mockResolvedValue({
      sub: "user-123",
      email: "alice@example.com",
      name: "Alice Developer",
      role: "DEV",
      organizationId: "org-1",
    });

    const element = await Hero();
    const html = renderToStaticMarkup(element);

    expect(html).toContain("Alice Developer");
    expect(html).toContain("DEV");
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain("Dashboard");
    expect(html).not.toContain("Sign in");
  });
});
