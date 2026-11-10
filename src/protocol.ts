import { z } from "zod";

// Messages between the extension and the preview webview. The webview imports types only,
// so zod stays out of its bundle.

export type PickerId = "destination" | "locale" | "groupItem" | "timeline" | `variant:${string}`;

/** A dropdown in the preview toolbar. An empty `value` means Xcode's default. */
export type Picker = {
  id: PickerId;
  label: string;
  value: string;
  options: { value: string; label: string }[];
};

export type ViewState = {
  fileName: string | undefined;
  previews: { index: number; label: string; line: number }[];
  selected: number;
  status: "idle" | "rendering" | "ready" | "error";
  message: string | undefined;
  /** The rendered snapshot as a `data:image/png` URI. */
  image: string | undefined;
  problems: string[];
  pickers: Picker[];
};

export type ToWebview = { type: "state"; state: ViewState };

const PickerIdSchema = z.custom<PickerId>(
  (value) =>
    typeof value === "string" &&
    (["destination", "locale", "groupItem", "timeline"].includes(value) || value.startsWith("variant:")),
);

export const FromWebview = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ready") }),
  z.object({ type: z.literal("refresh") }),
  z.object({ type: z.literal("select"), index: z.number().int().nonnegative() }),
  z.object({ type: z.literal("pick"), id: PickerIdSchema, value: z.string() }),
  z.object({ type: z.literal("reveal"), line: z.number().int().positive() }),
]);
export type FromWebview = z.infer<typeof FromWebview>;
