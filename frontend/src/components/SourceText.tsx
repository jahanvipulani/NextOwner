import type { ReactNode } from 'react';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Finds the quote in the text, tolerant to whitespace differences. */
export function locateQuote(text: string, quote: string): [number, number] | null {
  const q = quote.trim();
  if (!q) return null;
  const exact = text.indexOf(q);
  if (exact >= 0) return [exact, exact + q.length];
  const parts = q.split(/\s+/).map(escapeRegex);
  try {
    const m = new RegExp(parts.join('\\s+'), 'i').exec(text);
    if (m) return [m.index, m.index + m[0].length];
  } catch {
    return null;
  }
  return null;
}

export default function SourceText({ text, quote }: { text: string; quote: string }) {
  const hit = locateQuote(text, quote);
  let body: ReactNode;
  if (hit) {
    body = (
      <>
        {text.slice(0, hit[0])}
        <mark>{text.slice(hit[0], hit[1])}</mark>
        {text.slice(hit[1])}
      </>
    );
  } else {
    body = text;
  }
  return (
    <div>
      {hit ? null : <p className="small muted mb-1">The exact passage could not be located on this page.</p>}
      <div className="srctext">{body}</div>
    </div>
  );
}
