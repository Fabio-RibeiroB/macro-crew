import "../../styles/page-contents.css";

export type PageContentsItem = { id: string; label: string; show?: boolean };

/** Sections that actually render, in page order. */
export function visibleContents(items: PageContentsItem[]) {
  return items.filter((item) => item.show !== false);
}

/**
 * "On this page" links for a subject page with several sections. They are plain
 * in-page anchors: the browser scrolls and interactions.mjs keeps the target aligned.
 * The row is part of the page flow (not sticky) so it never competes with the sticky
 * header; each target already has a scroll-margin-top that clears the header.
 * A page with fewer than two visible sections has nothing to list.
 */
export function PageContents({ items }: { items: PageContentsItem[] }) {
  const shown = visibleContents(items);
  if (shown.length < 2) return null;
  return (
    <nav className="fs-contents" aria-label="On this page">
      <p className="fs-contents-label" aria-hidden="true">On this page</p>
      <ul className="fs-contents-list">
        {shown.map((item) => (
          <li key={item.id}>
            <a href={`#${item.id}`}>{item.label}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
