import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { axe } from 'jest-axe';
import { DisruptionInput } from './DisruptionInput.js';
import { RippleSimulationView, type RippleSimulationResult } from './RippleSimulationView.js';
import { FixProposalsModal, type FixOptionItem } from './FixProposalsModal.js';
import { EventProvider } from '../../context/EventContext.js';

const mockSimulation: RippleSimulationResult = {
  disruptedItem: 'Cake Delivery',
  delayMinutes: 60,
  affectedItems: [
    {
      id: 'item-cake',
      label: 'Cake Cutting & Champagne Toast',
      plannedStartMin: 1110,
      projectedStartMin: 1170,
      delayMin: 60,
      fixed: false,
    },
    {
      id: 'item-fireworks',
      label: 'Lake Fireworks Spectacular',
      plannedStartMin: 1200,
      projectedStartMin: 1200,
      delayMin: 0,
      fixed: true,
      hasConflict: true,
    },
  ],
  slackConsumedMin: 15,
  hasFixedConflict: true,
  conflictDescription: 'Collision with permitted fireworks window',
};

const mockFixOptions: FixOptionItem[] = [
  {
    id: 'fix-1',
    rank: 1,
    title: 'Swap Cake Cutting with Acoustic Lounge Performance',
    strategy: 'swap',
    plainImpact: 'Absorbs the delay without moving fixed fireworks.',
    fixedConflictsCount: 0,
    guestVisibleChangesCount: 1,
    totalMinutesMoved: 45,
    score: 95,
    operations: [],
  },
  {
    id: 'fix-2',
    rank: 2,
    title: 'Compress Cocktail Hour Window',
    strategy: 'shorten',
    plainImpact: 'Shortens cocktail hour by 20 mins.',
    fixedConflictsCount: 0,
    guestVisibleChangesCount: 2,
    totalMinutesMoved: 60,
    score: 82,
    operations: [],
  },
];

describe('Execute Stage Disruption Flow Components', () => {
  it('renders visible text input and triggers submit', () => {
    const handleSubmit = vi.fn();

    render(
      <EventProvider>
        <DisruptionInput onSubmitDisruption={handleSubmit} isAnalyzing={false} />
      </EventProvider>,
    );

    const input = screen.getByRole('textbox');
    expect(input).toBeInTheDocument();

    const submitBtn = screen.getByRole('button', { name: /Simulate/i });
    fireEvent.click(submitBtn);

    expect(handleSubmit).toHaveBeenCalled();
  });

  it('renders ripple propagation table and flags fixed collision', () => {
    const handleReviewFixes = vi.fn();

    render(
      <EventProvider>
        <RippleSimulationView simulation={mockSimulation} onReviewFixes={handleReviewFixes} />
      </EventProvider>,
    );

    expect(screen.getByText(/DAG Ripple Propagation Simulation/i)).toBeInTheDocument();
    expect(screen.getByText(/Conflict with Fixed Item/i)).toBeInTheDocument();
    expect(screen.getByText('Cake Cutting & Champagne Toast')).toBeInTheDocument();

    const reviewBtn = screen.getByRole('button', { name: /Review 3 Ranked Fix Options/i });
    fireEvent.click(reviewBtn);
    expect(handleReviewFixes).toHaveBeenCalled();
  });

  it('renders ranked fix proposals with plain impact and scores', () => {
    const handleSelectOption = vi.fn();

    render(
      <EventProvider>
        <FixProposalsModal
          isOpen={true}
          onClose={vi.fn()}
          options={mockFixOptions}
          onSelectOption={handleSelectOption}
        />
      </EventProvider>,
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(
      screen.getByText('Swap Cake Cutting with Acoustic Lounge Performance'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Recommended Fix/i)).toBeInTheDocument();

    const selectBtns = screen.getAllByRole('button', {
      name: /Select & Draft Vendor Notifications/i,
    });
    fireEvent.click(selectBtns[0]!);

    expect(handleSelectOption).toHaveBeenCalledWith(mockFixOptions[0]);
  });

  it('passes automated accessibility audit with zero axe violations', async () => {
    const { container } = render(
      <EventProvider>
        <RippleSimulationView simulation={mockSimulation} onReviewFixes={vi.fn()} />
      </EventProvider>,
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
