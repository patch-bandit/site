/** Small DOM, download, clipboard, focus-jump, and strictly opt-in storage helpers for Bandit Codes. */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string | null | undefined)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  for (const ch of children) {
    if (ch == null) continue;
    node.append(typeof ch === "string" ? document.createTextNode(ch) : ch);
  }
  return node;
}

export function downloadBlob(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Scrolls to a field or control, focuses it, and briefly highlights it so the person lands right on it. */
export function focusField(target: HTMLElement | null | undefined): void {
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  target.focus({ preventScroll: true });
  target.classList.remove("qr-focus-pulse");
  void target.offsetWidth;
  target.classList.add("qr-focus-pulse");
  setTimeout(() => target.classList.remove("qr-focus-pulse"), 1400);
}

export interface DisabledReasonWidget {
  el: HTMLElement;
  set: (reason: string, jumpLabel?: string, onJump?: () => void) => void;
  clear: () => void;
}

/** Inline plain-language explanation shown right beside disabled actions, with an optional jump-and-focus link. */
export function createDisabledReason(id?: string): DisabledReasonWidget {
  const textEl = el("span", { class: "qr-why-text" });
  const jumpBtn = el("button", { type: "button", class: "qr-jump-link", hidden: "" });
  const wrap = el(
    "div",
    { ...(id ? { id } : {}), class: "qr-why-disabled", role: "status", "aria-live": "polite", hidden: "" },
    textEl,
    jumpBtn,
  );
  let jumpHandler: (() => void) | null = null;
  jumpBtn.addEventListener("click", () => jumpHandler?.());

  return {
    el: wrap,
    set(reason: string, jumpLabel?: string, onJump?: () => void) {
      if (!reason) {
        wrap.hidden = true;
        textEl.textContent = "";
        jumpBtn.hidden = true;
        jumpHandler = null;
        return;
      }
      textEl.textContent = reason;
      if (jumpLabel && onJump) {
        jumpBtn.textContent = jumpLabel;
        jumpBtn.hidden = false;
        jumpHandler = onJump;
      } else {
        jumpBtn.hidden = true;
        jumpHandler = null;
      }
      wrap.hidden = false;
    },
    clear() {
      wrap.hidden = true;
      textEl.textContent = "";
      jumpBtn.hidden = true;
      jumpHandler = null;
    },
  };
}

export const STORAGE_OPT_KEY = "pb-qr-save-optin";
export const STORAGE_KIT_KEY = "pb-qr-redirect-kit";
export const STORAGE_ESCAPE_KEY = "pb-qr-escape-plan";
export const STORAGE_SNIPPET_KEY = "pb-qr-snippet";

/** Reads opt-in flag without writing anything to storage. */
export function isLocalSaveEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_OPT_KEY) === "1";
  } catch {
    return false;
  }
}

export function readOptInJson<T>(key: string): T | null {
  if (!isLocalSaveEnabled()) return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeOptInJson(key: string, value: unknown): void {
  if (!isLocalSaveEnabled()) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota errors */
  }
}

export function setLocalSaveEnabled(enabled: boolean): void {
  try {
    if (enabled) {
      localStorage.setItem(STORAGE_OPT_KEY, "1");
    } else {
      localStorage.removeItem(STORAGE_OPT_KEY);
      localStorage.removeItem(STORAGE_KIT_KEY);
      localStorage.removeItem(STORAGE_ESCAPE_KEY);
      localStorage.removeItem(STORAGE_SNIPPET_KEY);
    }
  } catch {
    /* ignore blocked storage */
  }
}
