import type { ReactNode } from 'react';

interface Props {
  title: string;
  text?: string;
  action?: ReactNode;
}

export default function EmptyState({ title, text, action }: Props) {
  return (
    <div className="card flex flex-col items-start gap-2" style={{ borderStyle: 'dashed' }}>
      <h3>{title}</h3>
      {text ? <p className="muted max-w-xl">{text}</p> : null}
      {action ? <div className="mt-2 flex flex-wrap gap-2">{action}</div> : null}
    </div>
  );
}
