import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ArchiveEntry } from "../../lib";
import { parseLogText, redact } from "../../lib";

export function LogsTab({ entries }: { entries: ArchiveEntry[] }) {
  const [query, setQuery] = useState("");
  const [redaction, setRedaction] = useState(true);
  const lines = useMemo(
    () =>
      entries
        .filter((entry) => entry.kind === "text")
        .slice(0, 20)
        .flatMap((entry) =>
          parseLogText(
            entry.path,
            new TextDecoder().decode(entry.data.slice(0, 2_000_000)),
          ),
        )
        .filter((line) =>
          line.message.toLowerCase().includes(query.toLowerCase()),
        )
        .slice(0, 500),
    [entries, query],
  );
  return (
    <section className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 sm:px-6">
        <div>
          <h2 className="text-base font-semibold">Log entries</h2>
          <p className="text-xs text-muted-foreground">
            {lines.length.toLocaleString()} matching indexed lines
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={query}
            onChange={setQuery}
            placeholder="Search messages"
            aria-label="Search messages"
            className="w-60"
          />
          <label className="text-xs text-muted-foreground">
            <input
              className="mr-1"
              type="checkbox"
              checked={redaction}
              onChange={(event) => setRedaction(event.target.checked)}
            />
            redact identifiers
          </label>
        </div>
      </div>
      <ScrollArea
        type="always"
        className="min-h-0 flex-1 border-y"
        viewportClassName="font-mono text-xs"
      >
        {lines.map((line) => (
          <details
            key={`${line.source}:${line.ts}:${line.process}:${line.message}`}
            className="border-b px-4 py-1 sm:px-6"
          >
            <summary className="cursor-pointer truncate">
              {line.process} — {redact(line.message.slice(0, 160), redaction)}
            </summary>
            <pre className="whitespace-pre-wrap p-2 text-muted-foreground">
              {redact(line.message, redaction)}
              {"\n"}[{line.source}]
            </pre>
          </details>
        ))}
      </ScrollArea>
    </section>
  );
}
