import { expect, it } from "vitest";
import { coalesce } from "../src/coalesce.ts";

it("runs once more after calls made mid-run, never in parallel", async () => {
  let active = 0;
  let maxActive = 0;
  let runs = 0;
  const run = coalesce(async () => {
    active++;
    maxActive = Math.max(maxActive, active);
    runs++;
    await new Promise((resolve) => setTimeout(resolve, 5));
    active--;
  });

  const first = run();
  void run();
  void run();
  await first;

  expect(runs).toBe(2);
  expect(maxActive).toBe(1);
});

it("recovers after the task throws", async () => {
  let calls = 0;
  const run = coalesce(async () => {
    calls++;
    if (calls === 1) throw new Error("boom");
  });

  await expect(run()).rejects.toThrow("boom");
  await run();
  expect(calls).toBe(2);
});
