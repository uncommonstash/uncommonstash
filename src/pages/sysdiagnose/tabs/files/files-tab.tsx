import type { ArchiveEntry } from "../../lib";

export function FilesTab({ entries }: { entries: ArchiveEntry[] }) {
  return <section className="space-y-3"><div><h2 className="text-base font-semibold">Archive files</h2><p className="text-xs text-muted-foreground">{entries.length.toLocaleString()} indexed files</p></div><ul className="divide-y border-y font-mono text-xs">{entries.map((entry) => <li key={entry.path} className="flex items-center justify-between gap-4 px-2 py-2"><span className="truncate">{entry.path}</span><span className="shrink-0 text-muted-foreground">{entry.kind} · {(entry.size / 1024).toFixed(1)} KB</span></li>)}</ul></section>;
}
