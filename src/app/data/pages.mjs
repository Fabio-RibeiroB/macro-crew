// Native document links give every section a real URL and browser history.
// `place` is where a working page is linked. Routes with no content stay out of
// both menus until their pages exist.
export const PAGES = [
  {
    id: "overview",
    path: "/",
    label: "Overview",
    title: "The UK economy, explained",
    description:
      "Official UK inflation, interest rates, jobs, pay, housing and government figures in one place, with plain-English explanations and links to the original sources.",
    place: "nav",
  },
  {
    id: "calendar",
    path: "/calendar",
    label: "Calendar",
    title: "Official release calendar",
    description:
      "Known dates for official UK data releases and Bank of England meetings, so you can see when the next figures are due.",
    place: "nav",
  },
  {
    id: "prices",
    path: "/prices",
    label: "Prices",
    title: "Prices and the cost of living",
    description:
      "Official UK inflation and everyday prices, including fuel and energy, explained in plain English with links to the official sources.",
    place: "nav",
  },
  {
    id: "economy",
    path: "/economy",
    label: "Economy",
    title: "Growth, interest rates and your money",
    description:
      "Bank Rate, economic growth and what they mean for borrowing and saving, using official UK figures explained in plain English.",
    place: "nav",
  },
  {
    id: "jobs-pay",
    path: "/jobs-pay",
    label: "Jobs & Pay",
    title: "Jobs and pay",
    description:
      "Official UK figures on pay and unemployment, with plain-English explanations and links to the official sources.",
    place: "nav",
  },
  {
    id: "housing",
    path: "/housing",
    label: "Housing",
    title: "Housing costs",
    description:
      "Official UK private rents and house prices, with levels and annual changes shown separately and explained in plain English.",
    place: "nav",
  },
  {
    id: "government",
    path: "/government-budget",
    label: "Government",
    title: "Tax, spending and your household",
    description:
      "What to look for in announcements about UK taxes, public spending and the wider outlook, with links to the original official publications.",
    place: "nav",
  },
  {
    id: "about",
    path: "/about",
    label: "About",
    title: "About FinStats UK",
    description:
      "Why FinStats UK exists: to help people in the UK understand the economic numbers that affect their money, using official figures explained in plain English.",
    place: "footer",
    // Also listed in the mobile menu. Desktop keeps the main navigation to subject
    // pages; About stays in the footer there.
    menu: true,
  },
  {
    id: "sources",
    path: "/sources",
    label: "Sources",
    title: "Our figures, sources and checks",
    description:
      "Where FinStats UK figures come from, how they are checked, and how facts, forecasts and explanations are kept distinct.",
    place: "footer",
  },
];

/** Public origin and site-wide link-preview image (see scripts/link-previews.mjs). */
export const SITE = {
  url: "https://finstats.fabio.org.uk",
  name: "FinStats UK",
  image: {
    path: "/og-image.png",
    width: 1200,
    height: 630,
    alt: "FinStats UK: official UK figures, plainly explained",
  },
};

export const NAV_PAGES = PAGES.filter((page) => page.place === "nav");
export const FOOTER_PAGES = PAGES.filter((page) => page.place === "footer");
/** Footer pages that the collapsed (mobile) menu also lists. Hidden by CSS on desktop. */
export const MENU_ONLY_PAGES = PAGES.filter((page) => page.menu);

/** Future subject routes from the UI spec. They have no page yet. */
export const UNPUBLISHED_PATHS = [
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
