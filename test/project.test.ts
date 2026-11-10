import { describe, expect, it } from "vitest";
import { findNearbyContainers, pickNavigatorPath } from "../src/project.ts";

describe("findNearbyContainers", () => {
  const tree: Record<string, string[]> = {
    "/repo": ["App.xcodeproj", "App.xcworkspace", "Package.swift"],
    "/repo/Feature": ["Feature.xcodeproj", "Sources"],
    "/repo/Feature/Sources": ["View.swift"],
    "/repo/App": ["Main.swift"],
  };
  const list = async (dir: string) => tree[dir] ?? [];

  it("returns the nearest folder's projects", async () => {
    expect(await findNearbyContainers("/repo/Feature/Sources/View.swift", "/repo", list)).toEqual([
      "/repo/Feature/Feature.xcodeproj",
    ]);
  });

  it("prefers a workspace over the project beside it", async () => {
    expect(await findNearbyContainers("/repo/App/Main.swift", "/repo", list)).toEqual(["/repo/App.xcworkspace"]);
  });

  it("stops at the workspace root", async () => {
    expect(await findNearbyContainers("/repo/App/Main.swift", "/repo/App", list)).toEqual([]);
  });
});

describe("pickNavigatorPath", () => {
  it("picks the navigator path sharing the longest tail with the file on disk", () => {
    const matches = ["Quick Notes/macOS/Views/MainView.swift", "Quick Notes/iOS/Views/MainView.swift"];
    expect(pickNavigatorPath("/Users/me/quick-notes/iOS/Views/MainView.swift", matches)).toBe(
      "Quick Notes/iOS/Views/MainView.swift",
    );
  });

  it("ignores matches with a different file name", () => {
    expect(pickNavigatorPath("/x/Main.swift", ["App/MainView.swift"])).toBeUndefined();
  });
});
