import { ExternalLink } from "lucide-react";

export function OfficialLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a className="fs-link" href={href} target="_blank" rel="noopener noreferrer">
      {children} <ExternalLink size={13} aria-hidden="true" />
    </a>
  );
}
