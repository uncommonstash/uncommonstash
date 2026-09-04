import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEffect, useState, useCallback, useRef } from "react";
import { csr } from "@/lib/compat";
import { useDebounce } from "use-debounce";
import cronstrue from "cronstrue";
import { parseExpression } from "cron-parser";
import { format } from "date-fns";
import { Check, Copy, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

// ============================================================================
// Types
// ============================================================================

export interface CronChoice {
  cron: string;
  probability: number;
}

export interface CronResult {
  cron: string;
  choices: CronChoice[];
}

export interface CronInputProps {
  /** API endpoint for cron conversion */
  apiEndpoint?: string;
  /** Debounce delay in ms */
  debounceMs?: number;
  /** Number of choices to fetch */
  numChoices?: number;
  /** Placeholder text */
  placeholder?: string;
  /** Currently selected cron (controlled) */
  value?: string;
  /** Callback when a cron is selected */
  onCronSelected?: (cron: string) => void;
  /** Additional class name */
  className?: string;
}

export interface NextRunsProps {
  cron: string;
  count?: number;
}

// ============================================================================
// Utility Functions
// ============================================================================

const formatRunDate = (date: Date): string => {
  const datePart = format(date, "EEE, MMM d");
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? "pm" : "am";
  const displayHours = hours % 12 || 12;
  const timePart =
    minutes === 0
      ? `${displayHours}${ampm}`
      : `${displayHours}:${minutes.toString().padStart(2, "0")}${ampm}`;
  return `${datePart}, ${timePart}`;
};

const getCronDescription = (cron: string): string => {
  try {
    return cronstrue.toString(cron);
  } catch {
    return "";
  }
};

const getNextRuns = (
  cron: string,
  count: number = 5,
): { runs: string[]; timezone: string } => {
  try {
    const interval = parseExpression(cron);
    const runs: string[] = [];
    let timezone = "";

    for (let i = 0; i < count; i++) {
      const date = interval.next().toDate();
      if (i === 0) {
        try {
          const parts = new Intl.DateTimeFormat("en-US", {
            timeZoneName: "short",
          }).formatToParts(date);
          const tzPart = parts.find((part) => part.type === "timeZoneName");
          timezone = tzPart ? tzPart.value : "";
        } catch {}
      }
      runs.push(formatRunDate(date));
    }
    return { runs, timezone };
  } catch {
    return { runs: [], timezone: "" };
  }
};

// ============================================================================
// Subcomponents
// ============================================================================

/**
 * Displays the next scheduled runs for a cron expression
 */
export function NextRuns({ cron, count = 5 }: NextRunsProps) {
  const { runs, timezone } = getNextRuns(cron, count);

  if (runs.length === 0) return null;

  return (
    <div className="text-base">
      <p className="font-semibold mb-3">
        Next scheduled runs{timezone ? ` (${timezone})` : ""}:
      </p>
      <ul className="list-disc pl-5 space-y-2 text-gray-600">
        {runs.map((run, index) => (
          <li key={index}>{run}</li>
        ))}
      </ul>
    </div>
  );
}

// ============================================================================
// CronInput Component
// ============================================================================

/**
 * A cron input component with dropdown suggestions.
 *
 * @example
 * ```tsx
 * <CronInput
 *   apiEndpoint="/api/cron"
 *   onCronSelected={(cron) => console.log('Selected:', cron)}
 * />
 * ```
 */
export function CronInput({
  apiEndpoint = import.meta.env.VITE_CRONFORMER_API_URL ?? "/api/cron",
  debounceMs = 300,
  numChoices = 5,
  placeholder = "e.g. every last day of the month at 2pm",
  value,
  onCronSelected,
  className,
}: CronInputProps) {
  const [prompt, setPrompt] = useState("");
  // Throttle (leading) + debounce (trailing) for responsive feel
  const [debouncedPrompt] = useDebounce(prompt, debounceMs, {
    leading: true,
    trailing: true,
    maxWait: 1000,
  });
  const [choices, setChoices] = useState<CronChoice[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedCron, setSelectedCron] = useState(value ?? "");
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync with controlled value
  useEffect(() => {
    if (value !== undefined) {
      setSelectedCron(value);
    }
  }, [value]);

  const fetchCron = useCallback(
    async (text: string) => {
      if (!text) {
        setChoices([]);
        setIsOpen(false);
        return;
      }

      setLoading(true);

      try {
        const response = await fetch(apiEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: text, k: numChoices }),
        });

        if (!response.ok) {
          throw new Error("Failed to convert to cron expression");
        }

        const data: CronResult = await response.json();
        const newChoices = data.choices ?? [
          { cron: data.cron, probability: 1.0 },
        ];
        setChoices(newChoices);
        setIsOpen(newChoices.length > 0);
      } catch {
        setChoices([]);
        setIsOpen(false);
      } finally {
        setLoading(false);
      }
    },
    [apiEndpoint, numChoices],
  );

  useEffect(() => {
    fetchCron(debouncedPrompt);
  }, [debouncedPrompt, fetchCron]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (cron: string) => {
    setSelectedCron(cron);
    setIsOpen(false);
    setShowExplanation(true);
    // Keep the prompt text - don't clear it
    onCronSelected?.(cron);
  };

  const handleCopy = () => {
    if (selectedCron) {
      navigator.clipboard.writeText(selectedCron);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleInputFocus = () => {
    setShowExplanation(false);
    if (choices.length > 0) {
      setIsOpen(true);
    }
  };

  const handleInputBlur = () => {
    // Clear selection when input is empty and blurred
    if (!prompt.trim() && selectedCron) {
      setSelectedCron("");
      setShowExplanation(false);
      setChoices([]);
      onCronSelected?.("");
    }
  };

  const description = selectedCron ? getCronDescription(selectedCron) : "";

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`}>
      {/* Input */}
      <div className="relative">
        <Input
          type="text"
          placeholder={placeholder}
          value={prompt}
          onChange={setPrompt}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          className="h-14 text-lg px-4"
        />
        {loading && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <div className="h-5 w-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && choices.length > 0 && (
        <div className="absolute z-50 w-full mt-2 bg-white border border-gray-200 rounded-lg shadow-lg max-h-80 overflow-auto">
          {choices.map((choice, index) => {
            const desc = getCronDescription(choice.cron);
            return (
              <button
                key={`${choice.cron}-${index}`}
                className="w-full px-4 py-3 text-left hover:bg-gray-100 focus:bg-gray-100 focus:outline-none border-b border-gray-100 last:border-b-0"
                onClick={() => handleSelect(choice.cron)}
              >
                <div className="font-mono text-base font-medium">
                  {choice.cron}
                </div>
                {desc && (
                  <div className="text-sm text-gray-500 truncate">{desc}</div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Selected Cron Display - fixed space reserved, opacity transition only */}
      <div
        className={`mt-4 p-4 bg-gray-100 rounded-lg transition-opacity duration-300 ease-out ${
          showExplanation ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="flex justify-between items-start gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-lg font-mono font-bold">
              {selectedCron || "\u00A0"}
            </p>
            <p className="text-base text-gray-600 mt-1">
              {description || "\u00A0"}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-gray-500 hover:text-gray-900"
            onClick={handleCopy}
            disabled={!selectedCron}
          >
            {copied ? (
              <Check className="h-4 w-4" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            <span className="sr-only">Copy cron expression</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Page Component
// ============================================================================

export default csr(function TextToCronPage() {
  const [selectedCron, setSelectedCron] = useState("");

  return (
    <div className="min-h-screen bg-background relative">
      {/* Header - top left, absolute positioned */}
      <div className="absolute top-0 left-0 p-6 md:p-12">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-6 w-fit"
        >
          <ArrowLeft className="w-4 h-4" />
          UncommonStash
        </Link>

        <div className="mb-4">
          <h1 className="text-3xl font-bold tracking-tight mb-2">
            Text to Cron
          </h1>
        </div>
      </div>

      {/* Form - centered on screen */}
      <div className="min-h-screen flex items-center justify-center px-6 md:px-12">
        <div className="w-full max-w-lg">
          <CronInput onCronSelected={setSelectedCron} value={selectedCron} />
        </div>
      </div>
    </div>
  );
});
