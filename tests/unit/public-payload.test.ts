import { describe, expect, it } from "vitest";
import { publicCodingProblem, publicQuizQuestionPayload } from "../../src/lib/public-payload";

describe("participant payloads", () => {
  it("omits hidden test input and expected output", () => {
    const pub = publicCodingProblem({
      description: "d",
      constraints: "",
      inputFormat: "",
      outputFormat: "",
      examples: [],
      difficulty: "easy",
      allowedLanguages: [71],
      starterCode: {},
      tests: [
        { id: "p", points: 10, hidden: false, input: "1", expected: "1", sortOrder: 0 },
        { id: "h", points: 90, hidden: true, input: "SECRET", expected: "NOPE", sortOrder: 1 },
      ],
    });
    expect(JSON.stringify(pub)).not.toContain("SECRET");
    expect(JSON.stringify(pub)).not.toContain("NOPE");
    expect(pub.publicTests).toHaveLength(1);
    expect(pub.hiddenTestCount).toBe(1);
  });
});

describe("quiz participant payload", () => {
  it("omits correct options and explanations until reveal", () => {
    const q = {
      id: "q1",
      prompt: "Capital?",
      explanation: "Paris is the key",
      points: 50,
      timeLimitMs: 10000,
      imageId: null,
      options: [
        { id: "a", label: "Paris", sortOrder: 0, isCorrect: true },
        { id: "b", label: "Lyon", sortOrder: 1, isCorrect: false },
      ],
    };
    const hidden = publicQuizQuestionPayload(q, false);
    expect(JSON.stringify(hidden)).not.toContain("isCorrect");
    expect(JSON.stringify(hidden)).not.toContain("Paris is the key");
    expect(hidden.options.every((o) => !("isCorrect" in o))).toBe(true);
    const shown = publicQuizQuestionPayload(q, true);
    expect(shown.options.some((o) => "isCorrect" in o && o.isCorrect)).toBe(true);
  });
});
