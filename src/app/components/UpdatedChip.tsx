// One compact update stamp for every figures page: when the verified snapshot was
// last updated, plus a link to how it is checked. The 30-minute schedule and the
// method live on /sources, not in a sentence on each page.
import { Clock } from "lucide-react";
import { updatedShort } from "../data/format.mjs";

export function UpdatedChip({ value }: { value?: string | null }) {
  const text = updatedShort(value);
  return (
    <div className="fs-statusbar">
      {text && (
        <p className="fs-updated">
          <Clock size={14} strokeWidth={2.25} aria-hidden="true" focusable="false" />
          <span>
            Last updated <time dateTime={value ?? undefined}>{text}</time>
            <span className="sr-only"> UK time</span>
          </span>
        </p>
      )}
      <a className="fs-statusbar-link" href="/sources">How we check</a>
    </div>
  );
}
