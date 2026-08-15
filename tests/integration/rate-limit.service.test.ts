import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "@/lib/db";
import { truncateAll } from "./helpers";
import {
  assertLoginAllowed,
  recordLoginFailure,
  recordLoginSuccess,
  LOGIN_MAX_FAILURES,
  assertResponseSubmissionAllowed,
  recordResponseSubmission,
  RESPONSE_MAX_PER_TOKEN_IP,
  RESPONSE_MAX_PER_IP,
  RESPONSE_MAX_PER_QUESTIONNAIRE,
  RESPONSE_WINDOW_MS,
  RESPONSE_Q_WINDOW_MS,
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

describe("response submission rate limit (TKT-023)", () => {
  const TOKEN = "resp-token-abc";
  const IP = "203.0.113.10";
  const QID = "questionnaire-1";

  async function seedEvents(key: string, count: number) {
    await db.rateLimitEvent.createMany({
      data: Array.from({ length: count }, () => ({ key })),
    });
  }

  it("allows submissions under the per-token/IP limit", async () => {
    await seedEvents(`submit:${TOKEN}:${IP}`, RESPONSE_MAX_PER_TOKEN_IP - 1);
    await expect(
      assertResponseSubmissionAllowed(TOKEN, IP, QID)
    ).resolves.toBeUndefined();
  });

  it("blocks with 429 RATE_LIMITED once the per-token/IP limit is hit", async () => {
    await seedEvents(`submit:${TOKEN}:${IP}`, RESPONSE_MAX_PER_TOKEN_IP);
    try {
      await assertResponseSubmissionAllowed(TOKEN, IP, QID);
      throw new Error("expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe("RATE_LIMITED");
      expect((err as AppError).statusCode).toBe(429);
    }
  });

  it("scopes the token/IP limit per respondent", async () => {
    await seedEvents(`submit:${TOKEN}:${IP}`, RESPONSE_MAX_PER_TOKEN_IP);
    await expect(
      assertResponseSubmissionAllowed("other-token", IP, QID)
    ).resolves.toBeUndefined();
  });

  it("blocks a fresh token once the IP cap is exceeded", async () => {
    await seedEvents(`submit:ip:${IP}`, RESPONSE_MAX_PER_IP);
    await expect(
      assertResponseSubmissionAllowed("brand-new-token", IP, QID)
    ).rejects.toBeInstanceOf(AppError);
  });

  it("blocks submissions once the per-questionnaire cap is exceeded", async () => {
    await seedEvents(`submit:q:${QID}`, RESPONSE_MAX_PER_QUESTIONNAIRE);
    await expect(
      assertResponseSubmissionAllowed("another-token", "198.51.100.7", QID)
    ).rejects.toBeInstanceOf(AppError);
  });

  it("expires submission events after the window passes", async () => {
    await seedEvents(`submit:${TOKEN}:${IP}`, RESPONSE_MAX_PER_TOKEN_IP);
    await db.rateLimitEvent.updateMany({
      data: { createdAt: new Date(Date.now() - RESPONSE_WINDOW_MS - 1000) },
    });
    await expect(
      assertResponseSubmissionAllowed(TOKEN, IP, QID)
    ).resolves.toBeUndefined();
  });

  it("records events for the token/IP, IP, and questionnaire keys", async () => {
    await recordResponseSubmission(TOKEN, IP, QID);
    const keys = (
      await db.rateLimitEvent.findMany({
        select: { key: true },
        orderBy: { createdAt: "asc" },
      })
    ).map((e) => e.key);
    expect(keys).toContain(`submit:${TOKEN}:${IP}`);
    expect(keys).toContain(`submit:ip:${IP}`);
    expect(keys).toContain(`submit:q:${QID}`);
  });

  it("allows a fresh questionnaire in the next hour window", async () => {
    await seedEvents(`submit:q:${QID}`, RESPONSE_MAX_PER_QUESTIONNAIRE);
    await db.rateLimitEvent.updateMany({
      data: { createdAt: new Date(Date.now() - RESPONSE_Q_WINDOW_MS - 1000) },
    });
    await expect(
      assertResponseSubmissionAllowed("another-token", "198.51.100.7", QID)
    ).resolves.toBeUndefined();
  });
});
