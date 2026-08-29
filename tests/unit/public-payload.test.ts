import { describe, expect, it } from "vitest";
import { publicCodingProblem } from "../../src/lib/public-payload";

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
