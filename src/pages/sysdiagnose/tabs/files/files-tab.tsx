import { ScrollArea } from "@/components/ui/scroll-area";
import type { ArchiveEntry } from "../../lib";

export function FilesTab({ entries }: { entries: ArchiveEntry[] }) {
  return (
    <section className="flex h-full min-h-0 flex-col gap-3">
      <div className="shrink-0 px-4 sm:px-6">
        <h2 className="text-base font-semibold">Archive files</h2>
        <p className="text-xs text-muted-foreground">
          {entries.length.toLocaleString()} indexed files
        </p>
      </div>
      <ScrollArea type="always" className="min-h-0 flex-1">
        <ul className="divide-y border-y font-mono text-xs">
          {entries.map((entry) => (
            <li
              key={entry.path}
              className="flex items-center justify-between gap-4 px-4 py-2 sm:px-6"
            >
              <span className="truncate">{entry.path}</span>
              <span className="shrink-0 text-muted-foreground">
                {entry.kind} · {(entry.size / 1024).toFixed(1)} KB
              </span>
            </li>
          ))}
        </ul>
      </ScrollArea>
    </section>
  );
}
