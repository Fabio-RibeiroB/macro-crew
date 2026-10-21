import { canonicalDestination, legacyDestination } from "./pages.mjs";

/** Keep this query identical to the header collapse rule in friendly.css. */
export const NAV_COLLAPSE_QUERY = "(max-width: 800px)";

/**
 * Focus target for the collapsing menu.
 * Opening moves into the menu. If focus is still inside a menu that is now
 * hidden — closed, or the viewport just became narrow — move it to the toggle.
 * An outside click, Escape that already moved focus, and the wide layout leave
 * focus where it is.
 */
export function menuFocusAction({
  collapsed,
  transition,
  focusInsideNav,
  navHidden,
}) {
  if (!collapsed) return "unchanged";
  if (transition === "open") return "first-link";
  if (focusInsideNav && (transition === "close" || navHidden)) return "toggle";
  return "unchanged";
}

/** Follow a navigation intent once; data arrivals never reposition the reader. */
export function bindPageNavigation(win, doc) {
  let frame;
  const follow = () => {
    win.cancelAnimationFrame(frame);
    const { pathname, search, hash } = win.location;
    const legacy = legacyDestination(pathname, hash);
    const canonical = canonicalDestination(pathname);
    if (legacy || canonical) {
      const url = new URL(legacy || canonical, win.location.href);
      url.search = search;
      if (!legacy) url.hash = hash;
      win.location.replace(url.pathname + url.search + url.hash);
      return;
    }
    frame = win.requestAnimationFrame(() => {
      try {
        const id = decodeURIComponent(hash.slice(1));
        if (id) doc.getElementById(id)?.scrollIntoView({ block: "start" });
      } catch {
        /* Ignore malformed fragments. */
      }
    });
  };
  follow();
  win.addEventListener("hashchange", follow);
  return () => {
    win.cancelAnimationFrame(frame);
    win.removeEventListener("hashchange", follow);
  };
}

export function bindMenuDismissal(doc, header, toggle, close) {
  const keydown = (event) => {
    if (event.key === "Escape") {
      close();
      toggle?.focus();
    }
  };
  const pointerdown = (event) => {
    if (!header?.contains(event.target)) close();
  };
  const focusin = (event) => {
    if (!header?.contains(event.target)) close();
  };
  doc.addEventListener("keydown", keydown);
  doc.addEventListener("pointerdown", pointerdown);
  doc.addEventListener("focusin", focusin);
  return () => {
    doc.removeEventListener("keydown", keydown);
    doc.removeEventListener("pointerdown", pointerdown);
    doc.removeEventListener("focusin", focusin);
  };
}
