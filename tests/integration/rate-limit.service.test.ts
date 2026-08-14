import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "@/lib/db";
import { truncateAll } from "./helpers";
import {
  assertLoginAllowed,
  recordLoginFailure,
  recordLoginSuccess,
  LOGIN_MAX_FAILURES,
} from "@/services/rate-limit.service";
import { AppError } from "@/lib/errors";

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await db.$disconnect();
});

describe("rate limit service", () => {
  it("allows a login when under the failure threshold", async () => {
    await expect(assertLoginAllowed("a@example.com", "1.2.3.4")).resolves.toBeUndefined();
  });

  it("allows a login after some failures but below the threshold", async () => {
    for (let i = 0; i < LOGIN_MAX_FAILURES - 1; i++) {
      await recordLoginFailure("a@example.com", "1.2.3.4");
    }
    await expect(assertLoginAllowed("a@example.com", "1.2.3.4")).resolves.toBeUndefined();
  });

  it("blocks a login once the failure threshold is reached", async () => {
    for (let i = 0; i < LOGIN_MAX_FAILURES; i++) {
      await recordLoginFailure("a@example.com", "1.2.3.4");
    }
    await expect(assertLoginAllowed("a@example.com", "1.2.3.4")).rejects.toBeInstanceOf(
      AppError
    );
    await expect(assertLoginAllowed("a@example.com", "1.2.3.4")).rejects.toThrow(
      /too many|try again/i
    );
  });

  it("scopes failures per email", async () => {
    for (let i = 0; i < LOGIN_MAX_FAILURES; i++) {
      await recordLoginFailure("a@example.com", "1.2.3.4");
    }
    // A different email from the same IP is not blocked.
    await expect(assertLoginAllowed("b@example.com", "1.2.3.4")).resolves.toBeUndefined();
  });

  it("scopes failures per IP", async () => {
    for (let i = 0; i < LOGIN_MAX_FAILURES; i++) {
      await recordLoginFailure("a@example.com", "1.2.3.4");
    }
    // The same email from a different IP is not blocked.
    await expect(assertLoginAllowed("a@example.com", "5.6.7.8")).resolves.toBeUndefined();
  });

  it("resets the counter on a successful login", async () => {
    for (let i = 0; i < LOGIN_MAX_FAILURES; i++) {
      await recordLoginFailure("a@example.com", "1.2.3.4");
    }
    await expect(assertLoginAllowed("a@example.com", "1.2.3.4")).rejects.toThrow();
    await recordLoginSuccess("a@example.com", "1.2.3.4");
    await expect(assertLoginAllowed("a@example.com", "1.2.3.4")).resolves.toBeUndefined();
  });

  it("expires failures after the window passes", async () => {
    for (let i = 0; i < LOGIN_MAX_FAILURES; i++) {
      await recordLoginFailure("a@example.com", "1.2.3.4");
    }
    await expect(assertLoginAllowed("a@example.com", "1.2.3.4")).rejects.toThrow();
    // Age the records beyond the window.
    await db.loginAttempt.updateMany({
      data: { createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
    });
    await expect(assertLoginAllowed("a@example.com", "1.2.3.4")).resolves.toBeUndefined();
  });
});
