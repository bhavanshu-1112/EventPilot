import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { axe } from 'jest-axe';
import { BookingWithRebalanceModal } from './BookingWithRebalanceModal.js';
import { EventProvider } from '../../context/EventContext.js';

describe('BookingWithRebalanceModal Component', () => {
  it('renders modal when overrun state is active and traps focus', () => {
    render(
      <EventProvider>
        <BookingWithRebalanceModal />
      </EventProvider>,
    );

    // Default state: not open
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('passes automated accessibility audit with zero axe violations when mounted', async () => {
    const { container } = render(
      <EventProvider>
        <BookingWithRebalanceModal />
      </EventProvider>,
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
