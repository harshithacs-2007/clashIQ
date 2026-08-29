export function publicCodingProblem(problem: {
  description: string;
  constraints: string;
  inputFormat: string;
  outputFormat: string;
  examples: unknown;
  difficulty: string;
  allowedLanguages: unknown;
  starterCode: unknown;
  tests: { id: string; points: number; hidden: boolean; input: string; expected: string; sortOrder: number }[];
}) {
  return {
    description: problem.description,
    constraints: problem.constraints,
    inputFormat: problem.inputFormat,
    outputFormat: problem.outputFormat,
    examples: problem.examples,
    difficulty: problem.difficulty,
    allowedLanguages: problem.allowedLanguages,
    starterCode: problem.starterCode,
    publicTests: problem.tests
      .filter((t) => !t.hidden)
      .map((t) => ({
        id: t.id,
        points: t.points,
        input: t.input,
        expected: t.expected,
        sortOrder: t.sortOrder,
      })),
    hiddenTestCount: problem.tests.filter((t) => t.hidden).length,
    hiddenPoints: problem.tests.filter((t) => t.hidden).reduce((s, t) => s + t.points, 0),
  };
}
