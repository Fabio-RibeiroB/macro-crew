// Native document links give every section a real URL and browser history.
export const PAGES = [
  {
    id: "overview",
    path: "/",
    label: "Overview",
    title: "The UK economy, explained",
  },
  {
    id: "prices",
    path: "/prices",
    label: "Prices",
    title: "Prices and the cost of living",
  },
  {
    id: "economy",
    path: "/economy",
    label: "The Economy",
    title: "Growth, interest rates and your money",
  },
  {
    id: "government",
    path: "/government-budget",
    label: "Government & Budget",
    title: "Tax, spending and your household",
  },
  {
    id: "sources",
    path: "/sources",
    label: "Sources",
    title: "Our figures, sources and checks",
  },
];
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
