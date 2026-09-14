import { GitHubLogoIcon } from "@radix-ui/react-icons";
import * as Popover from "@radix-ui/react-popover";
import { Info, Laptop, Moon, Sun } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTheme } from "@/lib/theme";

interface BuildInfoSummary {
  commit: string;
  commitTime: string;
  commitUrl: string;
}

function BuildInfoPopover() {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<BuildInfoSummary | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Grace period so the pointer can travel the gap between trigger and
  // content without the popover dismissing mid-trip.
  const scheduleClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 200);
  };
  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setOpen(true);
  };

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

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
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          aria-label="About this deployment"
          title="About this deployment"
          className="flex items-center text-muted-foreground hover:text-foreground transition-colors outline-none focus:outline-none focus-visible:outline-none"
        >
          <Info className="w-4 h-4" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={8}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          onOpenAutoFocus={(event) => event.preventDefault()}
          className="z-50 w-72 rounded-md border bg-card p-4 shadow-lg outline-none focus:outline-none focus-visible:outline-none"
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

export function ThemeToggle() {
  const { preference, setTheme } = useTheme();

  return (
    <div
      aria-label="Color theme"
      className="flex items-center rounded-md border border-input p-0.5"
      role="group"
    >
      {[
        { icon: Sun, label: "Light", value: "light" as const },
        { icon: Moon, label: "Dark", value: "dark" as const },
        { icon: Laptop, label: "System", value: "system" as const },
      ].map(({ icon: Icon, label, value }) => (
        <button
          key={value}
          type="button"
          aria-label={label}
          aria-pressed={preference === value}
          title={label}
          onClick={() => setTheme(value)}
          className={`flex h-7 w-7 items-center justify-center rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            preference === value
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

export default function AppBar({
  showThemeToggle = false,
}: {
  showThemeToggle?: boolean;
}) {
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
          <div className="flex items-center gap-4">
            <Link
              to="/blog"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Blog
            </Link>
            <a
              href="https://github.com/uncommonstash/uncommonstash"
              target="_blank"
              rel="noreferrer"
              aria-label="GitHub repository"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <GitHubLogoIcon className="h-4 w-4" aria-hidden="true" />
            </a>
            {showThemeToggle && <ThemeToggle />}
          </div>
        </div>
      </div>
    </header>
  );
}
