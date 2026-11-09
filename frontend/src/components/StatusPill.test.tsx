import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import StatusPill from './StatusPill';
import ReviewBadge from './ReviewBadge';

describe('StatusPill', () => {
  it.each([
    ['verified', 'Verified'],
    ['single_source', 'Single source'],
    ['conflicting', 'Conflicting'],
    ['no_evidence', 'No evidence'],
  ] as const)('renders %s', (status, label) => {
    render(<StatusPill status={status} />);
    expect(screen.getByText(label)).toBeTruthy();
  });
});

describe('ReviewBadge', () => {
  it('labels pending claims', () => {
    render(<ReviewBadge status="pending" />);
    expect(screen.getByText('Pending Review')).toBeTruthy();
  });
});
