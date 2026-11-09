export const DEMO_PROJECT_NAME = 'Student Research Portal';

export default function DemoBadge({ name }: { name: string }) {
  if (name !== DEMO_PROJECT_NAME) return null;
  return (
    <span className="tag tag-demo" title="Synthetic demonstration data. Not a real project.">
      Demo data
    </span>
  );
}
