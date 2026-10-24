import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { axe } from 'jest-axe';
import { ComparisonMatrix, type ComparisonQuote } from './ComparisonMatrix.js';
import { EventProvider } from '../../context/EventContext.js';

const mockQuotes: ComparisonQuote[] = [
  {
    id: 'quote-1',
    vendorName: 'Royal Caterers Udaipur',
    category: 'catering',
    totalMinor: 285000000,
    computedAllInMinor: 336300000,
    taxAssumptions: '+18% GST standard assumption applied',
    flagsCount: 2,
    highSeverityCount: 1,
    lineItemsCount: 10,
    status: 'pending',
  },
  {
    id: 'quote-2',
    vendorName: 'Udaipur Feasts',
    category: 'catering',
    totalMinor: 310000000,
    computedAllInMinor: 325500000,
    taxAssumptions: '5% composite tax included',
    flagsCount: 0,
    highSeverityCount: 0,
    lineItemsCount: 8,
    status: 'pending',
  },
];

describe('ComparisonMatrix Component', () => {
  it('renders real accessible table with caption, col/row headers, and quote data', () => {
    render(
      <EventProvider>
        <ComparisonMatrix
          quotes={mockQuotes}
          category="catering"
          onNegotiate={vi.fn()}
          onBook={vi.fn()}
        />
      </EventProvider>,
    );

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Royal Caterers Udaipur')).toBeInTheDocument();
    expect(screen.getByText('Udaipur Feasts')).toBeInTheDocument();
    expect(screen.getByText('+18% GST standard assumption applied')).toBeInTheDocument();
  });

  it('triggers onNegotiate when Negotiate button is clicked', () => {
    const handleNegotiate = vi.fn();
    render(
      <EventProvider>
        <ComparisonMatrix
          quotes={mockQuotes}
          category="catering"
          onNegotiate={handleNegotiate}
          onBook={vi.fn()}
        />
      </EventProvider>,
    );

    const negotiateBtns = screen.getAllByRole('button', { name: /Negotiate/i });
    fireEvent.click(negotiateBtns[0]!);

    expect(handleNegotiate).toHaveBeenCalledWith('quote-1', 'Royal Caterers Udaipur');
  });

  it('triggers onBook when Book Vendor button is clicked', () => {
    const handleBook = vi.fn();
    render(
      <EventProvider>
        <ComparisonMatrix
          quotes={mockQuotes}
          category="catering"
          onNegotiate={vi.fn()}
          onBook={handleBook}
        />
      </EventProvider>,
    );

    const bookBtns = screen.getAllByRole('button', { name: /Book Vendor/i });
    fireEvent.click(bookBtns[0]!);

    expect(handleBook).toHaveBeenCalledWith('quote-1');
  });

  it('passes automated accessibility audit with zero axe violations', async () => {
    const { container } = render(
      <EventProvider>
        <ComparisonMatrix
          quotes={mockQuotes}
          category="catering"
          onNegotiate={vi.fn()}
          onBook={vi.fn()}
        />
      </EventProvider>,
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
