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
  let stopFollowingLayout = () => {};
  const follow = () => {
    win.cancelAnimationFrame(frame);
    stopFollowingLayout();
    stopFollowingLayout = () => {};
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
        if (!id) return;
        const target = () => doc.getElementById(id);
        let lastTop;
        let finished = false;
        const cleanups = [];
        const finish = () => {
          if (finished) return;
          finished = true;
          cleanups.forEach((cleanup) => cleanup());
          if (stopFollowingLayout === finish) stopFollowingLayout = () => {};
        };
        const align = () => {
          const element = target();
          if (!element) return;
          const top = element.getBoundingClientRect?.().top;
          if (Number.isFinite(top) && (lastTop === undefined || Math.abs(top - lastTop) > 2)) {
            element.scrollIntoView({ block: "start" });
            lastTop = element.getBoundingClientRect?.().top ?? top;
          } else if (!Number.isFinite(top) && lastTop === undefined) {
            element.scrollIntoView({ block: "start" });
          }
        };
        const Observer = win.ResizeObserver;
        if (Observer) {
          const observer = new Observer(align);
          if (doc.documentElement) observer.observe(doc.documentElement);
          if (doc.body) observer.observe(doc.body);
          cleanups.push(() => observer.disconnect());
        }
        const Mutations = win.MutationObserver;
        if (Mutations && doc.documentElement) {
          const observer = new Mutations(align);
          observer.observe(doc.documentElement, { childList: true, subtree: true });
          cleanups.push(() => observer.disconnect());
        }
        const cancelOnIntent = () => finish();
        const keyIntent = (event) => {
          if ([" ", "PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown"].includes(event.key)) finish();
        };
        for (const type of ["wheel", "touchstart", "pointerdown"]) {
          win.addEventListener(type, cancelOnIntent, { passive: true });
          cleanups.push(() => win.removeEventListener(type, cancelOnIntent));
        }
        win.addEventListener("keydown", keyIntent);
        cleanups.push(() => win.removeEventListener("keydown", keyIntent));
        const deadline = win.setTimeout
          ? win.setTimeout(finish, 6000)
          : globalThis.setTimeout(finish, 6000);
        cleanups.push(() => win.clearTimeout
          ? win.clearTimeout(deadline)
          : globalThis.clearTimeout(deadline));
        stopFollowingLayout = finish;
        align();
      } catch {
        /* Ignore malformed fragments. */
      }
    });
  };
  follow();
  win.addEventListener("hashchange", follow);
  return () => {
    win.cancelAnimationFrame(frame);
    stopFollowingLayout();
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
