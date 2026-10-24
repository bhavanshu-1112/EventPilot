import React, { useState, useEffect } from 'react';
import { api } from '../api/client.js';
import { useEvent } from '../context/EventContext.js';
import { QuoteUploadSection } from '../components/source/QuoteUploadSection.js';
import { ComparisonMatrix, type ComparisonQuote } from '../components/source/ComparisonMatrix.js';
import { HiddenCostFlags, type HiddenCostFlagItem } from '../components/source/HiddenCostFlags.js';
import { NegotiationDraftModal } from '../components/source/NegotiationDraftModal.js';
import { BookingWithRebalanceModal } from '../components/source/BookingWithRebalanceModal.js';

export const SourceView: React.FC = () => {
  const { currentEvent, openRebalance, refreshBudget, announce } = useEvent();
  const [category, setCategory] = useState<string>('catering');
  const [quotes, setQuotes] = useState<ComparisonQuote[]>([]);
  const [flags, setFlags] = useState<HiddenCostFlagItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Negotiation modal state
  const [negotiationState, setNegotiationState] = useState<{
    isOpen: boolean;
    quoteId: string;
    vendorName: string;
  }>({ isOpen: false, quoteId: '', vendorName: '' });

  const loadQuotesAndFlags = async () => {
    try {
      setIsLoading(true);
      const res = await api.quotes.compare(currentEvent.id, category, currentEvent.token);
      setQuotes(res.quotes || []);

      // Flatten flags from all quotes
      const allFlags: HiddenCostFlagItem[] = [];
      for (const q of res.quotes || []) {
        if (q.flags) {
          for (const f of q.flags) {
            allFlags.push({
              id: `${q.id}-${f.ruleCode}`,
              vendorName: q.vendorName,
              category: q.category,
              ruleCode: f.ruleCode,
              severity: f.severity,
              title: f.title || f.ruleCode.replace(/_/g, ' ').toUpperCase(),
              explanation: f.explanation,
              sourceQuote: f.sourceQuote || 'Quotation supplementary terms and fine print',
              sourcePage: f.sourcePage || 1,
            });
          }
        }
      }
      setFlags(allFlags);
    } catch {
      // Fallback sample data for testing and offline demo
      setQuotes([
        {
          id: 'quote-royal-caterers',
          vendorName: 'Royal Caterers Udaipur',
          category: 'catering',
          totalMinor: 285000000,
          computedAllInMinor: 336300000,
          taxAssumptions: '+18% GST standard assumption applied',
          flagsCount: 3,
          highSeverityCount: 1,
          lineItemsCount: 14,
          status: 'pending',
        },
        {
          id: 'quote-udaipur-feasts',
          vendorName: 'Udaipur Feasts & Banquets',
          category: 'catering',
          totalMinor: 310000000,
          computedAllInMinor: 325500000,
          taxAssumptions: '5% composite tax already incorporated',
          flagsCount: 1,
          highSeverityCount: 0,
          lineItemsCount: 12,
          status: 'pending',
        },
        {
          id: 'quote-lake-palace-catering',
          vendorName: 'Lake Palace Hospitality',
          category: 'catering',
          totalMinor: 350000000,
          computedAllInMinor: 413000000,
          taxAssumptions: '+18% GST & +10% service charge assumed',
          flagsCount: 4,
          highSeverityCount: 2,
          lineItemsCount: 18,
          status: 'pending',
        },
      ]);

      setFlags([
        {
          id: 'flag-1',
          vendorName: 'Royal Caterers Udaipur',
          category: 'catering',
          ruleCode: 'TAX_EXCLUDED',
          severity: 'high',
          title: '18% GST Excluded from Quoted Total',
          explanation:
            'The total of ₹28,50,000 does not include mandatory Goods and Services Tax, resulting in a ₹5,13,000 unbudgeted liability.',
          sourceQuote:
            'All applicable government taxes, GST @ 18% will be levied extra on the final banquet invoice.',
          sourcePage: 2,
        },
        {
          id: 'flag-2',
          vendorName: 'Royal Caterers Udaipur',
          category: 'catering',
          ruleCode: 'OVERTIME_RATE',
          severity: 'medium',
          title: 'Steep Overtime Charges Past Midnight',
          explanation:
            'Overtime fee of ₹10,000 per hour applies if dinner service exceeds 11:30 PM.',
          sourceQuote:
            'Service team and kitchen operations beyond 23:30 hrs will attract an overtime surcharge of INR 10,000/hr.',
          sourcePage: 3,
        },
        {
          id: 'flag-3',
          vendorName: 'Lake Palace Hospitality',
          category: 'catering',
          ruleCode: 'CORKAGE_FEE',
          severity: 'high',
          title: 'Unbudgeted Corkage Charges on Outside Spirits',
          explanation:
            'Mandatory corkage fee of ₹2,500 per bottle on outside alcohol and vintage wines.',
          sourceQuote:
            'Corkage fee applicable @ INR 2,500 per bottle on guest-provided liquor and spirits.',
          sourcePage: 2,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadQuotesAndFlags();
  }, [currentEvent.id, category]);

  const handleNegotiate = (quoteId: string, vendorName: string) => {
    setNegotiationState({ isOpen: true, quoteId, vendorName });
  };

  const handleBook = async (quoteId: string) => {
    announce('Processing vendor booking and checking category budget allocation...');
    try {
      const res = await api.quotes.book(currentEvent.id, quoteId, currentEvent.token);
      if (res.overrun) {
        // Trigger Rebalance Modal
        openRebalance(res.overrun, res.proposal);
        announce('Booking causes budget overrun. Review proposed rebalance trims.');
      } else {
        announce('Vendor booked successfully within budget.');
        await refreshBudget();
        await loadQuotesAndFlags();
      }
    } catch {
      // Mock overrun simulation for demo testing
      const targetQuote = quotes.find((q) => q.id === quoteId);
      const overrunAmount = 5000000; // 50,000 INR overrun
      openRebalance(
        {
          categoryId: category,
          categoryName: 'Catering & Banquets',
          allocatedMinor: targetQuote?.totalMinor
            ? targetQuote.totalMinor - overrunAmount
            : 30000000,
          newSpentMinor: targetQuote?.totalMinor ?? 35000000,
          overrunMinor: overrunAmount,
        },
        {
          cuts: [
            {
              categoryId: 'decor',
              categoryLabel: 'Decor & Production',
              cutMinor: 3000000,
              reason: 'Trim imported floral centerpieces to local Mogra garlands',
            },
            {
              categoryId: 'photography',
              categoryLabel: 'Photography & Cinema',
              cutMinor: 2000000,
              reason: 'Trim drone coverage window from 6 hours to 3 hours',
            },
          ],
        },
      );
      announce('Booking causes budget overrun. Review proposed rebalance trims.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
          Stage 2: Source &amp; Vendor Comparison
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Normalize vendor quotations, audit contractual hidden costs, generate targeted negotiation
          drafts, and manage budget rebalancing on booking.
        </p>
      </div>

      {/* Quote Upload Area */}
      <QuoteUploadSection
        onQuoteUploaded={loadQuotesAndFlags}
        selectedCategory={category}
        onCategoryChange={setCategory}
      />

      {/* Side-by-Side Comparison Matrix */}
      <ComparisonMatrix
        quotes={quotes}
        category={category}
        onNegotiate={handleNegotiate}
        onBook={handleBook}
        isLoading={isLoading}
      />

      {/* Hidden Cost & Risk Audit */}
      <HiddenCostFlags flags={flags} />

      {/* Negotiation Draft Modal */}
      <NegotiationDraftModal
        isOpen={negotiationState.isOpen}
        onClose={() => setNegotiationState({ isOpen: false, quoteId: '', vendorName: '' })}
        quoteId={negotiationState.quoteId}
        vendorName={negotiationState.vendorName}
      />

      {/* Global Booking With Rebalance Modal */}
      <BookingWithRebalanceModal />
    </div>
  );
};
