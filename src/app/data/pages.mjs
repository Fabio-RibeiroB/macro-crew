// Native document links give every section a real URL and browser history.
// `place` is where a working page is linked. Routes with no content stay out of
// both menus until their pages exist.
export const PAGES = [
  {
    id: "overview",
    path: "/",
    label: "Overview",
    title: "The UK economy, explained",
    place: "nav",
  },
  {
    id: "prices",
    path: "/prices",
    label: "Prices",
    title: "Prices and the cost of living",
    place: "nav",
  },
  {
    id: "economy",
    path: "/economy",
    label: "Economy",
    title: "Growth, interest rates and your money",
    place: "nav",
  },
  {
    id: "jobs-pay",
    path: "/jobs-pay",
    label: "Jobs & Pay",
    title: "Jobs and pay",
    place: "nav",
  },
  {
    id: "housing",
    path: "/housing",
    label: "Housing",
    title: "Housing costs",
    place: "nav",
  },
  {
    id: "government",
    path: "/government-budget",
    label: "Government",
    title: "Tax, spending and your household",
    place: "nav",
  },
  {
    id: "about",
    path: "/about",
    label: "About",
    title: "About",
    place: "footer",
  },
  {
    id: "sources",
    path: "/sources",
    label: "Sources",
    title: "Our figures, sources and checks",
    place: "footer",
  },
];

export const NAV_PAGES = PAGES.filter((page) => page.place === "nav");
export const FOOTER_PAGES = PAGES.filter((page) => page.place === "footer");

/** Future subject routes from the UI spec. They have no page yet. */
export const UNPUBLISHED_PATHS = [
  "/calendar",
  "/wages",
  "/unemployment",
];

export function documentTitle(page) {
  return `${page.title} | finstats UK`;
}
export function resolvePage(pathname) {
  const path = pathname === "/" ? "/" : pathname.replace(/\/+$/, "");
  return (
    PAGES.find((page) => page.path === path) || {
      id: "missing",
      title: "Page not found",
      path,
      label: "Page not found",
    }
  );
}
export function legacyDestination(pathname, hash) {
  if (pathname !== "/") return null;
  return (
    {
      "#decisions": "/economy#interest-rates",
      "#sources": "/sources",
      "#reports": "/economy#publications",
      "#trends": "/economy#trends",
    }[hash.toLowerCase()] || null
  );
}

export function canonicalDestination(pathname) {
  const page = resolvePage(pathname);
  return page.id !== "missing" && page.path !== pathname ? page.path : null;
}
