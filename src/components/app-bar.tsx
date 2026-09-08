import * as Popover from "@radix-ui/react-popover";
import { Info } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

interface BuildInfoSummary {
  commit: string;
  commitTime: string;
  commitUrl: string;
}

function BuildInfoPopover() {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<BuildInfoSummary | null>(null);

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

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          aria-label="About this deployment"
          title="About this deployment"
          className="flex items-center text-muted-foreground hover:text-foreground transition-colors"
        >
          <Info className="w-4 h-4" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={8}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          onOpenAutoFocus={(event) => event.preventDefault()}
          className="z-50 w-72 rounded-md border bg-card p-4 shadow-lg"
        >
          <p className="text-sm text-muted-foreground">
            {info ? (
              <>
                This page was built from{" "}
                <a
                  className="underline underline-offset-4 font-mono"
                  href={info.commitUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {info.commit.slice(0, 12)}
                </a>{" "}
                —{" "}
              </>
            ) : (
              <>Build provenance is unavailable here — </>
            )}
            <Link
              to="/verify"
              className="font-medium text-foreground underline underline-offset-4"
            >
              verify here.
            </Link>
          </p>
          <Popover.Arrow className="fill-border" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
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
