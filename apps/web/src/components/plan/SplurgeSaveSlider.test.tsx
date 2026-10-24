import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { axe } from 'jest-axe';
import { SplurgeSaveSlider } from './SplurgeSaveSlider.js';
import { EventProvider } from '../../context/EventContext.js';

describe('SplurgeSaveSlider Component', () => {
  it('renders native input range with accessible label and aria-valuetext', () => {
    const handleTierChange = vi.fn();

    render(
      <EventProvider>
        <SplurgeSaveSlider
          currentTierValue={1}
          onTierChange={handleTierChange}
          computedTotalMinor={100000000}
        />
      </EventProvider>,
    );

    const slider = screen.getByLabelText(/Splurge \/ Save Budget Dial/i);
    expect(slider).toBeInTheDocument();
    expect(slider).toHaveAttribute('type', 'range');
    expect(slider).toHaveAttribute('min', '0');
    expect(slider).toHaveAttribute('max', '2');
    expect(slider).toHaveAttribute('step', '1');
    expect(slider).toHaveAttribute(
      'aria-valuetext',
      'Standard: balanced catalog price with premium local finishes',
    );
  });

  it('triggers onTierChange when slider value moves', () => {
    const handleTierChange = vi.fn();

    render(
      <EventProvider>
        <SplurgeSaveSlider
          currentTierValue={1}
          onTierChange={handleTierChange}
          computedTotalMinor={100000000}
        />
      </EventProvider>,
    );

    const slider = screen.getByLabelText(/Splurge \/ Save Budget Dial/i);
    fireEvent.change(slider, { target: { value: '2' } });

    expect(handleTierChange).toHaveBeenCalledWith(2);
  });

  it('opens and closes trade-off explanation modal', async () => {
    const handleTierChange = vi.fn();

    render(
      <EventProvider>
        <SplurgeSaveSlider
          currentTierValue={1}
          onTierChange={handleTierChange}
          computedTotalMinor={100000000}
        />
      </EventProvider>,
    );

    const button = screen.getByRole('button', { name: /Explain Trade-offs/i });
    fireEvent.click(button);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/Material & Execution Trade-offs/i)).toBeInTheDocument();

    const closeButton = screen.getByRole('button', { name: /Close dialog/i });
    fireEvent.click(closeButton);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('passes automated accessibility audit with zero axe violations', async () => {
    const { container } = render(
      <EventProvider>
        <SplurgeSaveSlider
          currentTierValue={1}
          onTierChange={vi.fn()}
          computedTotalMinor={100000000}
        />
      </EventProvider>,
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
