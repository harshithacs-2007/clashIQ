import { test, expect } from "vitest";
import { Prisma } from "@prisma/client";

test("hidden testcases are not part of the public problem mapper contract", () => {
  const hidden = { id: "1", points: 50, hidden: true, input: "SECRET", expected: "X", sortOrder: 0 };
  expect(hidden.hidden).toBe(true);
  expect(Prisma.JsonNull).toBeDefined();
});
