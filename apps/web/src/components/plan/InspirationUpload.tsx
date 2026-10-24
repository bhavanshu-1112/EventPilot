import React, { useState, useRef } from 'react';
import { UploadCloud, Image as ImageIcon, Sparkles, RefreshCw, CheckCircle2 } from 'lucide-react';
import { api } from '../../api/client.js';
import { useEvent } from '../../context/EventContext.js';

interface InspirationUploadProps {
  onBomUpdated: () => void;
}

interface DropzoneProps {
  previewUrl: string | null;
  altText: string;
  selectedFile: File | null;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onChooseClick: () => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
}

const Dropzone: React.FC<DropzoneProps> = ({
  previewUrl,
  altText,
  selectedFile,
  onFileChange,
  onChooseClick,
  fileInputRef,
}) => (
  <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-5 text-center bg-slate-50/50 dark:bg-slate-800/40 hover:bg-brand-50/30 transition">
    <input
      ref={fileInputRef}
      type="file"
      id="inspiration-file-input"
      accept="image/png,image/jpeg,image/webp"
      onChange={onFileChange}
      className="sr-only"
      aria-describedby="upload-help"
    />

    {previewUrl ? (
      <div className="mb-3">
        <img
          src={previewUrl}
          alt={altText || 'Selected inspiration preview'}
          className="w-full h-40 object-cover rounded-lg shadow-xs mx-auto"
        />
        <p className="text-xs text-slate-500 mt-2 font-medium">{selectedFile?.name}</p>
      </div>
    ) : (
      <div className="py-6">
        <div className="w-12 h-12 rounded-full bg-brand-100 dark:bg-brand-950 text-brand-600 dark:text-brand-400 flex items-center justify-center mx-auto mb-3">
          <UploadCloud size={24} aria-hidden="true" />
        </div>
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">
          Drag photo here or select from device
        </p>
        <p id="upload-help" className="text-xs text-slate-500 dark:text-slate-400">
          PNG, JPEG, or WEBP up to 10MB
        </p>
      </div>
    )}

    <button
      type="button"
      onClick={onChooseClick}
      className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition"
    >
      <ImageIcon size={14} aria-hidden="true" />
      <span>{selectedFile ? 'Change Image' : 'Choose Photo'}</span>
    </button>
  </div>
);

export const InspirationUpload: React.FC<InspirationUploadProps> = ({ onBomUpdated }) => {
  const { currentEvent, announce } = useEvent();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [altText, setAltText] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [extractedTheme, setExtractedTheme] = useState<{
    decorStyle?: string;
    palette?: string[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setError('Please select an inspiration photo.');
      return;
    }
    if (!altText.trim()) {
      setError('Accessibility description (alt text) is required for each image.');
      return;
    }

    setIsUploading(true);
    setUploadProgress('Analyzing visual elements and decor items with vision model...');
    announce('Analyzing visual elements and decor items with vision model.');
    setError(null);

    try {
      const res = await api.inspiration.upload(
        currentEvent.id,
        selectedFile,
        altText,
        currentEvent.token,
      );
      setExtractedTheme(res.inspiration);
      setUploadProgress('Bill of Materials extracted and catalog-priced successfully.');
      announce('Bill of Materials extracted and catalog-priced successfully.');
      onBomUpdated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to analyze inspiration photo';
      setError(msg);
      setUploadProgress('');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="glass-card p-6 mb-8">
      <div className="flex items-center space-x-2 text-brand-600 dark:text-brand-400 font-semibold text-sm mb-2">
        <Sparkles size={18} aria-hidden="true" />
        <span>Moodboard &amp; Vision Analysis</span>
      </div>
      <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">
        Turn photos into a priced Bill of Materials (BOM)
      </h2>
      <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
        Upload decor photos or moodboards. Our vision pipeline extracts items (mandap, floral
        installations, lounge seating, ambient lighting) and matches them to real catalog pricing.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        <Dropzone
          previewUrl={previewUrl}
          altText={altText}
          selectedFile={selectedFile}
          onFileChange={handleFileChange}
          onChooseClick={() => fileInputRef.current?.click()}
          fileInputRef={fileInputRef}
        />

        <div className="space-y-4">
          <div>
            <label
              htmlFor="inspiration-alt-input"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
            >
              Image Description (WCAG Alt Text) <span className="text-brand-600">*</span>
            </label>
            <textarea
              id="inspiration-alt-input"
              rows={3}
              value={altText}
              onChange={(e) => setAltText(e.target.value)}
              placeholder="e.g., Royal Rajasthani courtyard mandap decorated with marigold garlands, brass lanterns, and crimson velvet bolsters"
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-brand-500"
              required
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Screen readers announce this description to visually impaired users.
            </p>
          </div>

          <button
            type="button"
            onClick={handleUpload}
            disabled={isUploading || !selectedFile}
            className="w-full inline-flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl font-semibold text-sm text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 transition shadow-sm"
          >
            {isUploading ? (
              <>
                <RefreshCw size={16} className="animate-spin" aria-hidden="true" />
                <span>Extracting Decor Items...</span>
              </>
            ) : (
              <>
                <Sparkles size={16} aria-hidden="true" />
                <span>Analyze &amp; Generate BOM</span>
              </>
            )}
          </button>

          {uploadProgress && (
            <p
              role="status"
              className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center space-x-1"
            >
              <CheckCircle2 size={14} aria-hidden="true" />
              <span>{uploadProgress}</span>
            </p>
          )}

          {error && (
            <p role="alert" className="text-xs text-red-600 dark:text-red-400 font-medium">
              {error}
            </p>
          )}
        </div>
      </div>

      {extractedTheme && (
        <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div>
            <span className="font-semibold text-slate-700 dark:text-slate-300 mr-2">
              Extracted Vibe:
            </span>
            <span className="font-medium text-brand-700 dark:text-brand-300">
              {extractedTheme.decorStyle || 'Regal Heritage & Lakeside Grandeur'}
            </span>
          </div>

          {extractedTheme.palette && (
            <div className="flex items-center space-x-1.5" aria-label="Color Palette Swatches">
              <span className="font-semibold text-slate-700 dark:text-slate-300 mr-1">
                Palette:
              </span>
              {extractedTheme.palette.map((color: string, i: number) => (
                <div
                  key={i}
                  style={{ backgroundColor: color }}
                  title={color}
                  className="w-5 h-5 rounded-full border border-slate-300 dark:border-slate-600 shadow-xs"
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
