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
  const refresh = el("button", { className: "icon", textContent: "↻", title: "Refresh preview" });
  refresh.disabled = state.status === "rendering";
  refresh.addEventListener("click", () => vscode.postMessage({ type: "refresh" }));

  return el("header", {}, tabs, status, refresh);
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
