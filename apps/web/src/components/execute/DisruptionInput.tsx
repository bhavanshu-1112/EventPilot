import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Send, Sparkles, RefreshCw, AlertCircle } from 'lucide-react';
import { useEvent } from '../../context/EventContext.js';

interface DisruptionInputProps {
  onSubmitDisruption: (text: string) => Promise<void>;
  isAnalyzing: boolean;
}

const SAMPLE_DISRUPTIONS = [
  'The cake delivery is delayed by an hour due to traffic',
  'Baraat procession is running 45 minutes late',
  'Sound amplifier failure delaying Sangeet performances by 30 mins',
];

interface SpeechRecognitionResultItem {
  transcript: string;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  [index: number]: SpeechRecognitionResultItem[] | undefined;
}

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent {
  error: string;
}

interface ISpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type WindowWithSpeech = Window &
  typeof globalThis & {
    SpeechRecognition?: new () => ISpeechRecognition;
    webkitSpeechRecognition?: new () => ISpeechRecognition;
  };

interface VoiceMicButtonProps {
  isListening: boolean;
  onToggle: () => void;
}

const VoiceMicButton: React.FC<VoiceMicButtonProps> = ({ isListening, onToggle }) => {
  const btnClass = isListening
    ? 'bg-red-500 text-white animate-pulse shadow-md shadow-red-500/30'
    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200';
  const label = isListening ? 'Stop microphone' : 'Start microphone speech input';
  const title = isListening ? 'Stop listening' : 'Start voice input';

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`p-2 rounded-xl transition ${btnClass}`}
      title={title}
      aria-label={label}
    >
      {isListening ? <MicOff size={16} aria-hidden="true" /> : <Mic size={16} aria-hidden="true" />}
    </button>
  );
};

interface SamplePromptsGroupProps {
  onSelect: (prompt: string) => void;
}

const SamplePromptsGroup: React.FC<SamplePromptsGroupProps> = ({ onSelect }) => (
  <div className="flex flex-wrap gap-2 mb-3" role="group" aria-label="Sample disruptions">
    {SAMPLE_DISRUPTIONS.map((prompt, idx) => (
      <button
        key={idx}
        type="button"
        onClick={() => onSelect(prompt)}
        className="text-xs px-2.5 py-1 rounded-full bg-slate-100 hover:bg-brand-50 text-slate-700 hover:text-brand-700 dark:bg-slate-800 dark:hover:bg-brand-950 dark:text-slate-300 dark:hover:text-brand-300 border border-slate-200 dark:border-slate-700 transition"
      >
        "{prompt}"
      </button>
    ))}
  </div>
);

export const DisruptionInput: React.FC<DisruptionInputProps> = ({
  onSubmitDisruption,
  isAnalyzing,
}) => {
  const { announce } = useEvent();
  const [inputText, setInputText] = useState(SAMPLE_DISRUPTIONS[0] || '');
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);

  const recognitionRef = useRef<ISpeechRecognition | null>(null);

  useEffect(() => {
    // Feature detect Web Speech API
    const win = window as unknown as WindowWithSpeech;
    const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (SpeechRecognition) {
      setSpeechSupported(true);
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-IN';

      recognition.onstart = () => {
        setIsListening(true);
        setSpeechError(null);
        announce('Microphone active. Listening for schedule disruption...');
      };

      recognition.onresult = (e: SpeechRecognitionEvent) => {
        const transcript = Array.from(
          { length: e.results.length },
          (_, i) => e.results[i]?.[0]?.transcript ?? '',
        ).join('');
        setInputText(transcript);
      };

      recognition.onerror = (e: SpeechRecognitionErrorEvent) => {
        setIsListening(false);
        setSpeechError(
          e.error === 'not-allowed'
            ? 'Microphone permission was denied. You can still type your disruption.'
            : `Voice input error: ${e.error}`,
        );
        announce('Voice input error. Falling back to text input.');
      };

      recognition.onend = () => {
        setIsListening(false);
        announce('Microphone stopped. Please review your transcribed message before submitting.');
      };

      recognitionRef.current = recognition;
    } else {
      setSpeechSupported(false);
    }
  }, [announce]);

  const toggleListening = () => {
    const rec = recognitionRef.current;
    if (!speechSupported || !rec) return;
    if (isListening) {
      rec.stop();
      return;
    }
    try {
      rec.start();
    } catch {
      // Recognition already started or busy
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    void onSubmitDisruption(inputText);
  };

  return (
    <div className="glass-card p-6 mb-8">
      <div className="flex items-center space-x-2 text-brand-600 dark:text-brand-400 font-semibold text-sm mb-2">
        <Sparkles size={18} aria-hidden="true" />
        <span>Spoken or Typed Disruption Ingestion</span>
      </div>
      <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-1">
        Absorb live disruptions without panicking
      </h2>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
        Speak into the microphone or type. Our DAG ripple engine parses delays, calculates
        dependency propagation, and proposes scored fixes.
      </p>

      {/* Quick Sample Disruption Prompts */}
      <SamplePromptsGroup onSelect={setInputText} />

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="relative">
          <label htmlFor="disruption-text-input" className="sr-only">
            Describe the disruption
          </label>
          <textarea
            id="disruption-text-input"
            rows={3}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="e.g. 'The cake delivery is delayed by an hour' or click the microphone to speak..."
            className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 pr-24 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-brand-500"
          />

          <div className="absolute right-3 bottom-3 flex items-center space-x-2">
            {speechSupported && (
              <VoiceMicButton isListening={isListening} onToggle={toggleListening} />
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isAnalyzing || !inputText.trim()}
              className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-50 transition shadow-xs"
            >
              {isAnalyzing ? (
                <>
                  <RefreshCw size={14} className="animate-spin" aria-hidden="true" />
                  <span>Rippling...</span>
                </>
              ) : (
                <>
                  <Send size={14} aria-hidden="true" />
                  <span>Simulate</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Mic Status & Transcribing Feedback */}
        {isListening && (
          <p
            role="status"
            className="text-xs text-brand-600 dark:text-brand-400 font-medium flex items-center space-x-1.5"
          >
            <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
            <span>
              Listening... speak clearly into your microphone. Review transcript before submitting.
            </span>
          </p>
        )}

        {speechError && (
          <p
            role="alert"
            className="text-xs text-red-600 dark:text-red-400 font-medium flex items-center space-x-1.5"
          >
            <AlertCircle size={14} aria-hidden="true" />
            <span>{speechError}</span>
          </p>
        )}
      </form>
    </div>
  );
};
