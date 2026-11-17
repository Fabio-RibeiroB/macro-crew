import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import {
  REDUCED_MOTION_QUERY,
  motionState,
  tickerDuration,
  tickerItems,
} from "../data/ticker.mjs";
import "../../styles/ticker.css";

type Item = ReturnType<typeof tickerItems>[number];

function TickerItem({ item, copy }: { item: Item; copy: boolean }) {
  const body = (
    <>
      <span className="fs-ticker-label">{item.label}</span>{" "}
      <span className="fs-ticker-value">{item.value}</span>
      {item.change && (
        <>
          {" "}
          <span className="fs-ticker-change">
            {item.change.arrow && <span aria-hidden="true">{item.change.arrow}</span>}
            {item.change.spoken && <span className="fs-sr"> {item.change.spoken} </span>}
            {item.change.text && <span>{item.change.arrow ? " " : ""}{item.change.text}</span>}
          </span>
        </>
      )}
      {item.meta && (
        <>
          {" "}
          <span className="fs-ticker-meta">{item.meta}</span>
        </>
      )}
    </>
  );
  return (
    <li className="fs-ticker-item" data-dir={item.change?.dir ?? "flat"}>
      {item.href ? (
        <a href={item.href} tabIndex={copy ? -1 : undefined}>
          {body}
        </a>
      ) : (
        <span>{body}</span>
      )}
    </li>
  );
}

function prefersReducedMotion() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/**
 * A strip of headline official figures below the site header (ADR 0002). The first
 * list is the real, focusable list; the second only makes the loop seamless and is
 * hidden from assistive technology and the tab order. With reduced motion the strip
 * is static and scrolls horizontally with no duplicate.
 */
export function FiguresTicker({
  data,
  loading,
  error,
  hrefs,
}: {
  data: any;
  loading: boolean;
  error: unknown;
  hrefs: Record<string, string>;
}) {
  const items = useMemo(() => tickerItems(data, hrefs), [data, hrefs]);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(prefersReducedMotion);
  const [duration, setDuration] = useState<number | null>(null);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(REDUCED_MOTION_QUERY);
    const apply = () => setReduced(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    const element = list.current;
    if (!element) return;
    const measure = () => setDuration(tickerDuration(element.scrollWidth));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [items.length, reduced]);

  if (!data && loading) {
    return (
      <div className="fs-ticker fs-ticker-quiet" role="status">
        Loading the latest figures…
      </div>
    );
  }
  // A failed first load leaves nothing honest to scroll; the page shows its own error.
  if (items.length === 0) return null;

  const state = motionState({ reducedMotion: reduced, paused });
  return (
    <section
      className="fs-ticker"
      aria-label="Latest official figures"
      data-motion={state}
      data-stale={error ? "true" : undefined}
    >
      {state !== "static" && (
        <button
          type="button"
          className="fs-ticker-toggle"
          aria-pressed={paused}
          aria-label="Pause scrolling figures"
          title={paused ? "Resume scrolling" : "Pause scrolling"}
          onClick={() => setPaused(!paused)}
        >
          {paused ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}
        </button>
      )}
      <div className="fs-ticker-viewport">
        <div
          className="fs-ticker-track"
          style={duration ? ({ "--fs-ticker-duration": `${duration}s` } as React.CSSProperties) : undefined}
        >
          <ul className="fs-ticker-list" ref={list}>
            {items.map((item) => (
              <TickerItem key={item.id} item={item} copy={false} />
            ))}
          </ul>
          {state !== "static" && (
            <ul className="fs-ticker-list" aria-hidden="true">
              {items.map((item) => (
                <TickerItem key={item.id} item={item} copy />
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
