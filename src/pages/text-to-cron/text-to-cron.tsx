import * as CronParserModule from "cron-parser";
import cronstrue from "cronstrue";
import { format } from "date-fns";
import { ArrowLeft, Check, Copy } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useDebounce } from "use-debounce";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { csr } from "@/lib/compat";
import { CronformerClient } from "@/workers/cronformer/cronformer.client";
import type { CronformerProgress } from "@/workers/cronformer/cronformer.protocol";

// ============================================================================
// Types
// ============================================================================

export interface CronChoice {
  cron: string;
  probability: number;
}

export interface CronInputProps {
  /** Debounce delay in ms */
  debounceMs?: number;
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

const parseCronExpression = (
  cron: string,
): { next: () => { toDate: () => Date } } => {
  // biome-ignore lint/suspicious/noExplicitAny: compat shim for cron-parser v4/v5
  const m = CronParserModule as unknown as Record<string, any>;
  // cron-parser v5 exposes CronExpressionParser.parse; v4 exposes parseExpression
  const parse =
    m.CronExpressionParser?.parse?.bind(m.CronExpressionParser) ??
    m.parseExpression;
  return parse(cron);
};

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
    const interval = parseCronExpression(cron);
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
      <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
        {runs.map((run) => (
          <li key={run}>{run}</li>
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
 *   onCronSelected={(cron) => console.log('Selected:', cron)}
 * />
 * ```
 */
export function CronInput({
  debounceMs = 300,
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
  const [loadProgress, setLoadProgress] = useState<CronformerProgress | null>(
    null,
  );
  const [error, setError] = useState("");
  const [selectedCron, setSelectedCron] = useState(value ?? "");
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<CronformerClient | null>(null);
  const latestRequestRef = useRef(0);

  useEffect(() => {
    return () => clientRef.current?.dispose();
  }, []);

  // Sync with controlled value
  useEffect(() => {
    if (value !== undefined) {
      setSelectedCron(value);
    }
  }, [value]);

  const fetchCron = useCallback(async (text: string) => {
    const requestId = ++latestRequestRef.current;
    if (!text) {
      setChoices([]);
      setIsOpen(false);
      setError("");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    setLoadProgress(null);

    try {
      clientRef.current ??= new CronformerClient();
      // Do not let the first conversion race model download, WASM compilation,
      // or ORT session creation. This promise resets after a failed cold start.
      await clientRef.current.ready((progress) => {
        if (requestId === latestRequestRef.current) setLoadProgress(progress);
      });
      const data = await clientRef.current.infer(text, (progress) => {
        if (requestId === latestRequestRef.current) setLoadProgress(progress);
      });
      if (requestId !== latestRequestRef.current) return;
      const newChoices = [{ cron: data.cron, probability: 1.0 }];
      setChoices(newChoices);
      setIsOpen(newChoices.length > 0);
    } catch {
      if (requestId !== latestRequestRef.current) return;
      setChoices([]);
      setIsOpen(false);
      setError("Cronformer could not start. Try again in a moment.");
    } finally {
      if (requestId === latestRequestRef.current) {
        setLoading(false);
        setLoadProgress(null);
      }
    }
  }, []);

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

  const retry = () => {
    clientRef.current?.dispose();
    clientRef.current = null;
    void fetchCron(prompt);
  };

  const loadingLabel = (() => {
    if (!loading) return "";
    if (loadProgress?.phase === "downloading") {
      if (loadProgress.source === "cache") return "Loading cached Cronformer…";
      if (loadProgress.totalBytes > 0) {
        return `Downloading Cronformer · ${Math.round((loadProgress.loadedBytes / loadProgress.totalBytes) * 100)}%`;
      }
      return "Downloading Cronformer…";
    }
    if (loadProgress?.phase === "initializing")
      return "Loading Cronformer model…";
    if (!loadProgress) return "Loading Cronformer model…";
    return "Converting to cron…";
  })();

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
            <div className="h-5 w-5 border-2 border-border border-t-muted-foreground rounded-full animate-spin" />
          </div>
        )}
      </div>

      {loading && (
        <p className="mt-2 text-sm text-muted-foreground" role="status">
          {loadingLabel}
        </p>
      )}

      {/* Dropdown */}
      {isOpen && choices.length > 0 && (
        <div className="absolute z-50 w-full mt-2 bg-popover border rounded-lg shadow-lg max-h-80 overflow-auto">
          {choices.map((choice) => {
            const desc = getCronDescription(choice.cron);
            return (
              <button
                key={choice.cron}
                className="w-full px-4 py-3 text-left hover:bg-accent focus:bg-accent focus:outline-none border-b border-border last:border-b-0"
                onClick={() => handleSelect(choice.cron)}
              >
                <div className="font-mono text-base font-medium">
                  {choice.cron}
                </div>
                {desc && (
                  <div className="text-sm text-muted-foreground truncate">
                    {desc}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {error && (
        <div className="mt-2 flex items-center gap-2 text-sm text-destructive">
          <p>{error}</p>
          <Button onClick={retry} size="sm" type="button" variant="outline">
            Try again
          </Button>
        </div>
      )}

      {/* Selected Cron Display - fixed space reserved, opacity transition only */}
      <div
        className={`mt-4 p-4 bg-muted rounded-lg transition-opacity duration-300 ease-out ${
          showExplanation ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="flex justify-between items-start gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-lg font-mono font-bold">
              {selectedCron || "\u00A0"}
            </p>
            <p className="text-base text-muted-foreground mt-1">
              {description || "\u00A0"}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
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
