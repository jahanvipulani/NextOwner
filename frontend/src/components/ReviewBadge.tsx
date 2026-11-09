import type { ReviewStatus } from '../types';
import { REVIEW_LABELS } from '../utils/format';

const CLS: Record<ReviewStatus, string> = {
  pending: 'tag',
  accepted: 'tag tag-soft',
  edited: 'tag tag-soft',
  rejected: 'tag',
  unknown: 'tag tag-pink',
};

export default function ReviewBadge({ status }: { status: ReviewStatus }) {
  return (
    <span className={CLS[status]} style={status === 'rejected' ? { textDecoration: 'line-through' } : undefined}>
      {REVIEW_LABELS[status]}
    </span>
  );
}
