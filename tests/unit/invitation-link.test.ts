import { describe, it, expect, afterEach } from "vitest";
import {
  buildInvitationLink,
  getAppBaseUrl,
} from "@/services/invitation.service";
import { AppError } from "@/lib/errors";

afterEach(() => {
  delete process.env.APP_URL;
});

describe("invitation link builder (TKT-019)", () => {
  it("builds a relative link when no base URL is configured", () => {
    delete process.env.APP_URL;
    expect(buildInvitationLink("survey-x", "abc123")).toBe(
      "/f/survey-x?invite=abc123"
    );
  });

  it("builds an absolute link from APP_URL", () => {
    process.env.APP_URL = "https://forms.example.com";
    expect(buildInvitationLink("survey-x", "abc123")).toBe(
      "https://forms.example.com/f/survey-x?invite=abc123"
    );
  });

  it("normalizes a trailing slash on the base URL", () => {
    process.env.APP_URL = "https://forms.example.com/";
    expect(buildInvitationLink("survey-x", "abc123")).toBe(
      "https://forms.example.com/f/survey-x?invite=abc123"
    );
    expect(getAppBaseUrl()).toBe("https://forms.example.com");
  });

  it("accepts an explicit base URL override", () => {
    process.env.APP_URL = "https://wrong.example.com";
    expect(
      buildInvitationLink("survey-x", "abc123", "https://right.example.com")
    ).toBe("https://right.example.com/f/survey-x?invite=abc123");
  });

  it("throws a config error for a non-URL APP_URL", () => {
    process.env.APP_URL = "not-a-url";
    expect(() => buildInvitationLink("survey-x", "abc123")).toThrow(AppError);
    expect(() => buildInvitationLink("survey-x", "abc123")).toThrow(
      /APP_URL/
    );
  });

  it("throws a config error for a non-http(s) APP_URL", () => {
    process.env.APP_URL = "ftp://files.example.com";
    expect(() => buildInvitationLink("survey-x", "abc123")).toThrow(
      /http\(s\)/
    );
  });
});
