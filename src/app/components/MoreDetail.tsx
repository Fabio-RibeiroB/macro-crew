// Quiet inline disclosure for technical detail (ADR 0004). Native <details>, so it
// works by tap, keyboard and screen reader without script, and its content is in
// the server-rendered HTML.
import { useEffect } from "react";
import "../../styles/more-detail.css";

/** Browsers do not print closed <details>; open them for printing and restore after. */
let printHooked = false;
function hookPrint() {
  if (printHooked || typeof window === "undefined") return;
  printHooked = true;
  let opened: HTMLDetailsElement[] = [];
  window.addEventListener("beforeprint", () => {
    opened = [...document.querySelectorAll<HTMLDetailsElement>("details.fs-more:not([open])")];
    opened.forEach((el) => { el.open = true; });
  });
  window.addEventListener("afterprint", () => {
    opened.forEach((el) => { el.open = false; });
    opened = [];
  });
}

export function MoreDetail({ label, children, className }: { label: React.ReactNode; children: React.ReactNode; className?: string }) {
  useEffect(hookPrint, []);
  return (
    <details className={className ? `fs-more ${className}` : "fs-more"}>
      <summary>
        <svg className="fs-more-q" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
          <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <path d="M6.2 6.3a1.9 1.9 0 1 1 2.9 1.6c-.7.4-1.1.8-1.1 1.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          <circle cx="8" cy="11.4" r=".75" fill="currentColor" />
        </svg>
        <span className="fs-more-label">{label}</span>
        <svg className="fs-more-chev" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false">
          <path d="M3 4.5 6 7.5l3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <div className="fs-more-body">{children}</div>
    </details>
  );
}
