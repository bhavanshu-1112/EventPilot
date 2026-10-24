import React, { useState, useEffect } from 'react';
import { Mail, MessageCircle, Copy, Check, RefreshCw } from 'lucide-react';
import { AccessibleModal } from '../common/AccessibleModal.js';
import { api } from '../../api/client.js';
import { useEvent } from '../../context/EventContext.js';

interface NegotiationDraftModalProps {
  isOpen: boolean;
  onClose: () => void;
  quoteId: string;
  vendorName: string;
}

export const NegotiationDraftModal: React.FC<NegotiationDraftModalProps> = ({
  isOpen,
  onClose,
  quoteId,
  vendorName,
}) => {
  const { currentEvent, announce } = useEvent();
  const [tone, setTone] = useState<'email' | 'whatsapp'>('email');
  const [draftText, setDraftText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchDraft = async (selectedTone: 'email' | 'whatsapp') => {
    setIsLoading(true);
    try {
      const res = await api.quotes.negotiate(
        currentEvent.id,
        quoteId,
        selectedTone,
        currentEvent.token,
      );
      setDraftText(res.draft);
      announce('Negotiation draft generated citing specific contract flags.');
    } catch {
      // Fallback draft template
      if (selectedTone === 'email') {
        setDraftText(
          `Dear ${vendorName} Team,\n\nThank you for sharing your detailed proposal for our upcoming celebration in Udaipur.\n\nUpon reviewing the quotation, we noted that 18% GST and overtime charges after midnight (₹10,000/hr) are listed as supplementary fees. Could you provide an all-inclusive composite package rate, and consider waiver of corkage fees for our evening banquet?\n\nLooking forward to your favorable response.\n\nWarm regards,\nEvent Planning Team`,
        );
      } else {
        setDraftText(
          `Hi ${vendorName} team! 🙏 Loved the menu options for Udaipur. Quick query on the quote: Can we get a flat all-inclusive rate including the 18% GST and waiver on corkage charges? We're finalizing catering this week. Thanks!`,
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && quoteId) {
      void fetchDraft(tone);
    }
  }, [isOpen, quoteId, tone]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(draftText);
      setCopied(true);
      announce('Negotiation message copied to clipboard.');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      announce('Failed to copy to clipboard.');
    }
  };

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={onClose}
      title={`Draft Negotiation — ${vendorName}`}
      description="Polite, specific counter-offer citing contract clauses and unbundled fees."
      maxWidth="xl"
    >
      <div className="space-y-4">
        {/* Tone Selector */}
        <div className="flex items-center space-x-2">
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
            Select Tone:
          </span>
          <div
            className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-50 dark:bg-slate-900"
            role="radiogroup"
            aria-label="Negotiation tone"
          >
            <button
              type="button"
              role="radio"
              aria-checked={tone === 'email'}
              onClick={() => setTone('email')}
              className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                tone === 'email'
                  ? 'bg-brand-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <Mail size={13} aria-hidden="true" />
              <span>Professional Email</span>
            </button>

            <button
              type="button"
              role="radio"
              aria-checked={tone === 'whatsapp'}
              onClick={() => setTone('whatsapp')}
              className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                tone === 'whatsapp'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <MessageCircle size={13} aria-hidden="true" />
              <span>WhatsApp Message</span>
            </button>
          </div>
        </div>

        {/* Editable Message Body */}
        <div>
          <label htmlFor="negotiation-draft-text" className="sr-only">
            Negotiation draft message
          </label>
          {isLoading ? (
            <div className="w-full h-48 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-xs text-slate-500">
              <RefreshCw size={16} className="animate-spin mr-2" aria-hidden="true" />
              <span>Crafting negotiation draft...</span>
            </div>
          ) : (
            <textarea
              id="negotiation-draft-text"
              rows={8}
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 text-xs text-slate-900 dark:text-slate-100 font-mono leading-relaxed focus:ring-2 focus:ring-brand-500"
            />
          )}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800">
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            Review and personalize before sending. Never sent automatically.
          </span>

          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-brand-600 hover:bg-brand-700 text-white shadow-xs transition"
          >
            {copied ? (
              <>
                <Check size={14} aria-hidden="true" />
                <span>Copied to Clipboard!</span>
              </>
            ) : (
              <>
                <Copy size={14} aria-hidden="true" />
                <span>Copy Message</span>
              </>
            )}
          </button>
        </div>
      </div>
    </AccessibleModal>
  );
};
