import { z } from "zod";

// Shapes of the Xcode MCP tool results this extension reads. Unknown fields are ignored, so
// newer Xcode versions can add to them freely.

export const OpenWorkspaceResult = z.object({
  workspaceIdentifier: z.string(),
});

export const GlobResult = z.object({
  matches: z.array(z.string()),
});

export const SchemesResult = z.object({
  activeSchemeName: z.string().optional(),
  schemes: z.array(z.object({ name: z.string(), disambiguatedName: z.string(), isActive: z.boolean() })),
});

export const RenderDestination = z.object({
  identifier: z.string(),
  deviceModelName: z.string().optional(),
  platformName: z.string().optional(),
  systemVersion: z.string().optional(),
});
export type RenderDestination = z.infer<typeof RenderDestination>;

/** Group items come from `#Preview(arguments:)`; Xcode may send bare indexes or titled items. */
const GroupItem = z
  .union([z.number().int(), z.object({ index: z.number().int(), title: z.string().optional() })])
  .transform((item) => (typeof item === "number" ? { index: item } : item));

const CanvasControls = z.object({
  groupItemIndexes: z.array(GroupItem).default([]),
  timelineIndexes: z.array(z.number().int()).default([]),
});

const SupportedOverrides = z.object({
  /** "static" and, on simulator destinations, "interactive". */
  displayModes: z.array(z.string()).default([]),
  localizations: z.array(z.string()).default([]),
  previewVariants: z.record(z.string(), z.array(z.string())).default({}),
  renderDestinations: z.array(RenderDestination).default([]),
  canvasControls: CanvasControls.prefault({}),
});
export type SupportedOverrides = z.infer<typeof SupportedOverrides>;

export const RenderPreviewResult = z.object({
  displayName: z.string().optional(),
  sourceLineNumber: z.number().optional(),
  snapshot: z.object({ path: z.string() }).optional(),
  renderedDestination: RenderDestination.optional(),
  supportedOverrides: SupportedOverrides.prefault({}),
  errors: z.array(z.unknown()).default([]),
});
export type RenderPreviewResult = z.infer<typeof RenderPreviewResult>;

/** Output of `xcrun mcp-server status --format json`. */
export const HeadlessStatus = z.object({
  running: z.boolean().default(false),
  permission: z.object({ enabled: z.boolean() }),
});
