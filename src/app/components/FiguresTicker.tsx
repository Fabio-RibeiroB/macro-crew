import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Pause, Play } from "lucide-react";
import {
  CRAWL_STORAGE_KEY,
  DEFAULT_CRAWL_SETTINGS,
  REDUCED_MOTION_QUERY,
  SPEED_LABELS,
  collapsedFigures,
  motionState,
  nextSpeed,
  parseCrawlSettings,
  serializeCrawlSettings,
  tickerDuration,
  tickerItems,
} from "../data/ticker.mjs";
import "../../styles/ticker.css";

type Item = ReturnType<typeof tickerItems>[number];
type Settings = { collapsed: boolean; paused: boolean; speed: "slow" | "normal" | "fast" };

const BODY_ID = "fs-ticker-body";

function TickerItem({ item, copy }: { item: Item; copy: boolean }) {
  const body = (
    <>
      <span className="fs-ticker-label">{item.label}:</span>{" "}
      <span className="fs-ticker-value">{item.value}</span>
      {item.change && (
        <>
          , <span className="fs-ticker-change">{item.change.text}</span>
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

/** Settings remembered on this device. Storage can be missing, blocked or full: defaults then. */
function readSettings(): Settings {
  try {
    if (typeof window === "undefined") return { ...DEFAULT_CRAWL_SETTINGS } as Settings;
    return parseCrawlSettings(window.localStorage.getItem(CRAWL_STORAGE_KEY)) as Settings;
  } catch {
    return { ...DEFAULT_CRAWL_SETTINGS } as Settings;
  }
}

function writeSettings(settings: Settings) {
  try {
    window.localStorage.setItem(CRAWL_STORAGE_KEY, serializeCrawlSettings(settings));
  } catch {
    /* Not remembered this time; the strip still works. */
  }
}

/**
 * A crawl below the site header (ADR 0003, narrowed by ADR 0005): short plain-English
 * official figures, numbers only. A "Figures" button folds it to a static bar with the
 * two headline figures. Pause and a three-step speed button sit at the right; collapsed,
 * paused and speed are remembered on this device. The first list is the real, focusable
 * list; the second only makes the loop seamless and is hidden from assistive technology
 * and the tab order. With reduced motion the strip is static and scrolls horizontally
 * with no duplicate, and neither pause nor speed shows.
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
  const [settings, setSettings] = useState<Settings>(readSettings);
  const [reduced, setReduced] = useState(prefersReducedMotion);
  const [duration, setDuration] = useState<number | null>(null);
  const list = useRef<HTMLUListElement>(null);
  const { collapsed, paused, speed } = settings;

  const change = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    writeSettings(next);
  };

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(REDUCED_MOTION_QUERY);
    const apply = () => setReduced(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  const scrolling = !collapsed && items.length > 0;
  useEffect(() => {
    const element = list.current;
    if (!element) return;
    const measure = () => setDuration(tickerDuration(element.scrollWidth, speed));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [items.length, reduced, scrolling, speed]);

  if (!data && loading) {
    return (
      <div className="fs-ticker fs-ticker-quiet" role="status">
        Loading the latest figures…
      </div>
    );
  }
  // A failed first load leaves nothing honest to scroll; the page shows its own error.
  if (items.length === 0) return null;

  const state = collapsed ? "static" : motionState({ reducedMotion: reduced, paused });
  const showControls = !collapsed && state !== "static";
  const Chevron = collapsed ? ChevronRight : ChevronDown;
  return (
    <section
      className="fs-ticker"
      aria-label="Latest figures"
      data-motion={state}
      data-collapsed={collapsed ? "true" : undefined}
      data-stale={error ? "true" : undefined}
    >
      <button
        type="button"
        className="fs-ticker-fold"
        aria-expanded={!collapsed}
        aria-controls={BODY_ID}
        title={collapsed ? "Show the scrolling figures" : "Hide the scrolling figures"}
        onClick={() => change({ collapsed: !collapsed })}
      >
        Figures
        <Chevron size={16} aria-hidden="true" />
      </button>
      {collapsed ? (
        <p className="fs-ticker-summary" id={BODY_ID}>
          {collapsedFigures(items).map((figure) => (
            <span className="fs-ticker-headline" key={figure.id}>
              <span className="fs-ticker-label">{figure.label}</span> <span className="fs-ticker-value">{figure.value}</span>
            </span>
          ))}
        </p>
      ) : (
        <div className="fs-ticker-viewport" id={BODY_ID}>
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
      )}
      {showControls && (
        <div className="fs-ticker-controls">
          <button
            type="button"
            className="fs-ticker-speed"
            aria-label={`Scrolling speed: ${speed} (${SPEED_LABELS[speed]}). Change speed`}
            title="Change scrolling speed"
            onClick={() => change({ speed: nextSpeed(speed) as Settings["speed"] })}
          >
            {SPEED_LABELS[speed]}
          </button>
          <button
            type="button"
            className="fs-ticker-toggle"
            aria-pressed={paused}
            aria-label="Pause scrolling figures"
            title={paused ? "Resume scrolling" : "Pause scrolling"}
            onClick={() => change({ paused: !paused })}
          >
            {paused ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}
          </button>
        </div>
      )}
    </section>
  );
}
