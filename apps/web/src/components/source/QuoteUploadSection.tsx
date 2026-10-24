import React, { useState, useRef } from 'react';
import { Upload, FileText, CheckCircle2, RefreshCw, AlertCircle, Sparkles } from 'lucide-react';
import { api } from '../../api/client.js';
import { useEvent } from '../../context/EventContext.js';

interface QuoteUploadSectionProps {
  onQuoteUploaded: () => void;
  selectedCategory: string;
  onCategoryChange: (cat: string) => void;
}

const SAMPLE_QUOTES = [
  {
    name: 'Royal Caterers (PDF)',
    vendor: 'Royal Caterers Udaipur',
    category: 'catering',
    totalText: '₹28,50,000 (Excl. 18% GST & Service Fee)',
  },
  {
    name: 'Udaipur Feasts (PDF)',
    vendor: 'Udaipur Feasts & Banquets',
    category: 'catering',
    totalText: '₹31,00,000 (Incl. 5% GST)',
  },
  {
    name: 'Lake Palace Catering (PDF)',
    vendor: 'Lake Palace Hospitality',
    category: 'catering',
    totalText: '₹35,00,000 (Excl. Corkage & Overtime)',
  },
];

export const QuoteUploadSection: React.FC<QuoteUploadSectionProps> = ({
  onQuoteUploaded,
  selectedCategory,
  onCategoryChange,
}) => {
  const { currentEvent, announce } = useEvent();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileUpload = async (file: File) => {
    setIsUploading(true);
    setUploadStatus(
      `Extracting structured line items and auditing hidden costs from ${file.name}...`,
    );
    announce(`Extracting quote from ${file.name}`);
    setError(null);

    try {
      await api.quotes.upload(currentEvent.id, selectedCategory, file, currentEvent.token);
      setUploadStatus('Quote extracted, line items normalized, and hidden costs flagged.');
      announce('Quote extracted, line items normalized, and hidden costs flagged.');
      onQuoteUploaded();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to upload and extract quote';
      setError(msg);
      setUploadStatus(null);
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void handleFileUpload(file);
    }
  };

  const handleLoadSample = (sample: (typeof SAMPLE_QUOTES)[0]) => {
    onCategoryChange(sample.category);
    // Create synthetic text file simulating PDF quote
    const syntheticContent = `VENDOR: ${sample.vendor}\nCategory: ${sample.category}\nQuoted Base: ${sample.totalText}\nTerms: GST 18% extra, Corkage ₹2,500/bottle extra, Overtime ₹10,000/hr after midnight.`;
    const syntheticFile = new File(
      [syntheticContent],
      `${sample.vendor.replace(/\s+/g, '_')}.pdf`,
      {
        type: 'application/pdf',
      },
    );
    void handleFileUpload(syntheticFile);
  };

  return (
    <div className="glass-card p-6 mb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center space-x-2 text-brand-600 dark:text-brand-400 font-semibold text-sm mb-1">
            <Sparkles size={16} aria-hidden="true" />
            <span>AI Quote Extractor &amp; Hidden Cost Auditor</span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Compare vendor quotes without reading messy PDFs
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Upload PDF or image quotes. Our extraction tool extracts line items, flags missing
            taxes, corkage fees, and overtime clauses.
          </p>
        </div>

        {/* Category Picker */}
        <div className="shrink-0">
          <label
            htmlFor="quote-category-picker"
            className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1"
          >
            Vendor Category:
          </label>
          <select
            id="quote-category-picker"
            value={selectedCategory}
            onChange={(e) => onCategoryChange(e.target.value)}
            className="text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-brand-500"
          >
            <option value="catering">🍽️ Catering</option>
            <option value="venue">🏰 Venue &amp; Palace</option>
            <option value="decor">🌸 Decor &amp; Production</option>
            <option value="photography">📸 Photography</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
        {/* Upload Dropzone */}
        <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-6 text-center bg-slate-50/50 dark:bg-slate-800/40 hover:bg-brand-50/20 transition">
          <input
            ref={fileInputRef}
            type="file"
            id="quote-file-input"
            accept="application/pdf,image/png,image/jpeg"
            onChange={handleFileInputChange}
            className="sr-only"
            aria-describedby="quote-upload-info"
          />

          <div className="w-12 h-12 rounded-full bg-brand-100 dark:bg-brand-950 text-brand-600 dark:text-brand-400 flex items-center justify-center mx-auto mb-3">
            <Upload size={22} aria-hidden="true" />
          </div>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">
            Upload Vendor Quote Document
          </p>
          <p id="quote-upload-info" className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            PDF or Image format up to 10MB
          </p>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-50 transition shadow-xs"
          >
            {isUploading ? (
              <>
                <RefreshCw size={14} className="animate-spin" aria-hidden="true" />
                <span>Auditing Quote...</span>
              </>
            ) : (
              <>
                <FileText size={14} aria-hidden="true" />
                <span>Select Quote File</span>
              </>
            )}
          </button>
        </div>

        {/* Golden Sample Quote Quick Buttons */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-3">
          <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
            Or test with Golden Sample Quotes:
          </span>
          <div className="space-y-2">
            {SAMPLE_QUOTES.map((sample, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleLoadSample(sample)}
                disabled={isUploading}
                className="w-full text-left p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-brand-300 dark:hover:border-brand-700 flex items-center justify-between text-xs transition"
              >
                <div>
                  <span className="font-semibold text-slate-900 dark:text-slate-100 block">
                    {sample.vendor}
                  </span>
                  <span className="text-[11px] text-slate-500">{sample.totalText}</span>
                </div>
                <span className="text-[11px] text-brand-600 dark:text-brand-400 font-medium">
                  Extract &rarr;
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {uploadStatus && (
        <p
          role="status"
          className="mt-4 text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center space-x-1.5"
        >
          <CheckCircle2 size={16} aria-hidden="true" />
          <span>{uploadStatus}</span>
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="mt-4 text-xs text-red-600 dark:text-red-400 font-medium flex items-center space-x-1.5"
        >
          <AlertCircle size={16} aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
};
