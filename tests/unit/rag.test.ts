import { describe, it, expect } from "vitest";
import {
  extractIntents,
  mergeMatches,
  isLowConfidence,
  generateTitle,
  slugify,
  type RagMatch,
} from "@/domain/rag/intents";

describe("extractIntents", () => {
  it("splits a multiline prompt into intents", () => {
    const intents = extractIntents("What is your age?\nHow much do you earn monthly?");
    expect(intents).toContain("What is your age");
    expect(intents).toContain("How much do you earn monthly");
  });

  it("splits sentences on punctuation", () => {
    const intents = extractIntents("Tell me your name. How old are you?");
    expect(intents).toContain("Tell me your name");
    expect(intents).toContain("How old are you");
  });

  it("filters out fragments that are too short to be intents", () => {
    const intents = extractIntents("ok\nWhat is your email address?");
    expect(intents).not.toContain("ok");
    expect(intents).toContain("What is your email address");
  });

  it("dedupes identical intents", () => {
    const intents = extractIntents("What is your age?\nWhat is your age?");
    expect(intents.filter((i) => i === "What is your age")).toHaveLength(1);
  });
});

describe("mergeMatches", () => {
  it("dedupes by master id keeping the highest score and sorts descending", () => {
    const matches: RagMatch[] = [
      { masterId: "a", score: 0.5 },
      { masterId: "a", score: 0.7 },
      { masterId: "b", score: 0.4 },
      { masterId: "c", score: 0.9 },
    ];
    const merged = mergeMatches(matches);
    expect(merged.map((m) => [m.masterId, m.score])).toEqual([
      ["c", 0.9],
      ["a", 0.7],
      ["b", 0.4],
    ]);
  });

  it("returns an empty list for empty input", () => {
    expect(mergeMatches([])).toEqual([]);
  });
});

describe("isLowConfidence", () => {
  it("flags scores below the threshold", () => {
    expect(isLowConfidence(0.2, 0.3)).toBe(true);
  });

  it("accepts scores at or above the threshold", () => {
    expect(isLowConfidence(0.3, 0.3)).toBe(false);
    expect(isLowConfidence(0.5, 0.3)).toBe(false);
  });

  it("treats a missing score as low confidence", () => {
    expect(isLowConfidence(null, 0.3)).toBe(true);
  });
});

describe("generateTitle", () => {
  it("title-cases the first sentence of the prompt", () => {
    const title = generateTitle("customer satisfaction survey about our product", []);
    expect(title).toBe("Customer Satisfaction Survey About Our Product");
  });

  it("strips trailing punctuation", () => {
    const title = generateTitle("How satisfied are you? please be honest.", []);
    expect(title.endsWith(".")).toBe(false);
    expect(title.endsWith("?")).toBe(false);
  });

  it("falls back to the best match title for short prompts", () => {
    const title = generateTitle("age", [{ masterId: "x", score: 0.8, masterTitle: "Age" }]);
    expect(title).toBe("Age");
  });

  it("falls back to a default when nothing is usable", () => {
    const title = generateTitle("", []);
    expect(title).toBe("Generated questionnaire");
  });
});

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Customer Feedback Survey")).toBe("customer-feedback-survey");
  });

  it("strips non-alphanumeric characters", () => {
    expect(slugify("How satisfied are you?")).toBe("how-satisfied-are-you");
  });
});
