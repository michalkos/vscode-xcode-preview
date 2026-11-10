// Preview panel UI. Plain DOM: it re-renders from each ViewState the extension sends and
// reports clicks back. Never uses innerHTML, so text from Xcode can't inject markup.
import type { FromWebview, Picker, ToWebview, ViewState } from "../protocol.ts";

declare function acquireVsCodeApi(): { postMessage(message: FromWebview): void };

const vscode = acquireVsCodeApi();
const app = document.getElementById("app")!;

window.addEventListener("message", (event: MessageEvent<ToWebview>) => {
  if (event.data.type === "state") render(event.data.state);
});
vscode.postMessage({ type: "ready" });

function render(state: ViewState): void {
  app.replaceChildren(header(state), toolbar(state.pickers), problems(state.problems), canvas(state));
}

function header(state: ViewState): HTMLElement {
  const tabs = el("nav", { className: "tabs", role: "tablist" });
  for (const preview of state.previews) {
    const tab = el("button", { className: "tab", role: "tab", textContent: preview.label, title: `Line ${preview.line}` });
    tab.setAttribute("aria-selected", String(preview.index === state.selected));
    tab.addEventListener("click", () => vscode.postMessage({ type: "select", index: preview.index }));
    tab.addEventListener("dblclick", () => vscode.postMessage({ type: "reveal", line: preview.line }));
    tabs.append(tab);
  }

  const status = el("span", { className: `status ${state.status}`, textContent: state.message ?? "" });
  const exportImage = iconButton("picture", "Export preview as PNG", { type: "export" }, !state.image);
  const openInXcode = iconButton("hammer", "Open in Xcode", { type: "openInXcode" }, state.previews.length === 0);
  const refresh = iconButton("refresh", "Refresh preview", { type: "refresh" }, state.status === "rendering");

  return el("header", {}, tabs, status, exportImage, openInXcode, refresh);
}

/** Header icons as 16×16 path outlines, stroked in the text color by webview.css. */
const ICONS = {
  picture: ["M2.5 3.5h11v9h-11z", "M2.5 11 6 7.5 9.5 11 11 9.5 13.5 12", "M9.5 6.5a1 1 0 1 0 2 0a1 1 0 1 0-2 0"],
  hammer: ["M9.41 1.64 14.36 6.59 11.89 9.06 6.94 4.11z", "M8.71 5.88 3.05 11.54 4.46 12.95 10.12 7.29"],
  refresh: ["M13.5 8a5.5 5.5 0 1 1-1.61-3.89", "M11.9 1.4v2.7H9.2"],
} satisfies Record<string, string[]>;

/** A header button that shows `icon` and sends `message` when clicked. */
function iconButton(icon: keyof typeof ICONS, title: string, message: FromWebview, disabled: boolean): HTMLButtonElement {
  const button = el("button", { className: "icon", title, disabled }, svgIcon(ICONS[icon]));
  button.setAttribute("aria-label", title);
  button.addEventListener("click", () => vscode.postMessage(message));
  return button;
}

function svgIcon(paths: readonly string[]): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  for (const d of paths) {
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  return svg;
}

function toolbar(pickers: Picker[]): HTMLElement {
  const bar = el("div", { className: "toolbar" });
  for (const picker of pickers) {
    const select = el("select", { title: picker.label });
    for (const option of picker.options) {
      select.append(el("option", { value: option.value, textContent: option.label, selected: option.value === picker.value }));
    }
    select.addEventListener("change", () => vscode.postMessage({ type: "pick", id: picker.id, value: select.value }));
    bar.append(el("label", {}, el("span", { textContent: picker.label }), select));
  }
  return bar;
}

function problems(lines: string[]): HTMLElement {
  const list = el("ul", { className: "problems" });
  list.hidden = lines.length === 0;
  for (const line of lines) list.append(el("li", { textContent: line }));
  return list;
}

function canvas(state: ViewState): HTMLElement {
  const main = el("main", { className: state.status === "rendering" ? "canvas busy" : "canvas" });
  if (state.image) {
    main.append(el("img", { src: state.image, alt: "Rendered preview" }));
  } else if (state.status === "rendering") {
    main.append(el("p", { className: "placeholder", textContent: "Building the preview. The first build can take a while." }));
  }
  return main;
}

/** Creates an element with properties and children. */
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { role?: string } = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const { role, ...rest } = props;
  const element = Object.assign(document.createElement(tag), rest);
  if (role) element.setAttribute("role", role);
  element.append(...children);
  return element;
}
