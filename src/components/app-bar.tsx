import { Info } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

interface BuildInfoSummary {
  commit: string;
  commitTime: string;
  commitUrl: string;
}

function BuildInfoPopover() {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<BuildInfoSummary | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/build-info.json")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: BuildInfoSummary) => setInfo(data))
      .catch(() => {
        setInfo(null);
      });
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label="About this deployment"
        title="About this deployment"
        className="flex items-center text-muted-foreground hover:text-foreground transition-colors"
      >
        <Info className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute left-0 top-8 z-50 w-72 rounded-md border bg-card p-4 shadow-lg">
          <p className="text-sm font-semibold">This deployment</p>
          {info ? (
            <p className="text-xs text-muted-foreground mt-1">
              Built from{" "}
              <a
                className="underline underline-offset-4 font-mono"
                href={info.commitUrl}
                target="_blank"
                rel="noreferrer"
              >
                {info.commit.slice(0, 12)}
              </a>{" "}
              ({info.commitTime.slice(0, 10)})
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-1">
              Build provenance unavailable in this environment.
            </p>
          )}
          <Link
            to="/verify"
            onClick={() => setOpen(false)}
            className="inline-block mt-3 text-sm font-medium underline underline-offset-4"
          >
            Verify this deployment →
          </Link>
        </div>
      )}
    </div>
  );
}

export default function AppBar() {
  return (
    <header className="bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <Link
              to="/"
              className="flex items-center gap-2 text-xl font-bold tracking-tighter"
            >
              <img
                src="/logo.svg"
                alt="uncommonstash.com logo"
                width={16}
                height={16}
                className="text-foreground"
              />
              uncommonstash.com
            </Link>
            <BuildInfoPopover />
          </div>
          <Link
            to="/blog"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Blog
          </Link>
        </div>
      </div>
    </header>
  );
}
