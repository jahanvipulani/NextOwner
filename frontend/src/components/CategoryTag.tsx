import type { Category } from '../types';
import { CATEGORY_SINGULAR } from '../utils/format';

export default function CategoryTag({ category }: { category: Category }) {
  return <span className="tag tag-royal">{CATEGORY_SINGULAR[category]}</span>;
}
