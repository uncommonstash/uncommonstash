import {
  Radio,
  Settings,
  SignalLow,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const ICON_CACHE_KEY = "sysdiagnose-app-icons-v1";

const PRESET_APP_ICONS: Record<string, LucideIcon> = {
  hls: Radio,
  poorcellcondition: SignalLow,
  settings: Settings,
  deletedapp: Trash2,
};

function readIconCache(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(ICON_CACHE_KEY) ?? "{}") as Record<
      string,
      string
    >;
  } catch {
    return {};
  }
}

/**
 * Battery UI supplies the roster identity. Artwork is looked up only by its
 * public bundle ID and cached locally; a deterministic monogram is immediate
 * and remains the offline fallback.
 */
export function useAppIcons(bundleIds: string[]) {
  const [icons, setIcons] = useState<Record<string, string>>(() =>
    readIconCache(),
  );
  const key = useMemo(
    () => [...new Set(bundleIds.filter(Boolean))].sort().join(","),
    [bundleIds],
  );

  useEffect(() => {
    if (!key) return;
    const ids = key.split(",");
    const cached = readIconCache();
    const missing = ids.filter((id) => !(id in cached));
    if (missing.length === 0) {
      setIcons(cached);
      return;
    }
    let cancelled = false;
    void fetch(
      `https://itunes.apple.com/lookup?bundleId=${missing
        .map(encodeURIComponent)
        .join(",")}&entity=software&limit=${missing.length}`,
    )
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (cancelled || !payload?.results) return;
        const next = { ...readIconCache() };
        for (const result of payload.results as Array<{
          artworkUrl60?: string;
          bundleId?: string;
        }>) {
          if (result.bundleId && result.artworkUrl60) {
            next[result.bundleId] = result.artworkUrl60;
          }
        }
        for (const bundleId of missing) next[bundleId] ??= "";
        try {
          localStorage.setItem(ICON_CACHE_KEY, JSON.stringify(next));
        } catch {
          // Private browsing can reject storage; retain the in-memory result.
        }
        setIcons(next);
      })
      .catch(() => {
        // The monogram remains the deliberate offline/blocked-network state.
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return icons;
}

function Monogram({ name, bundleId }: { name: string; bundleId: string }) {
  const initials = name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
  let hue = 0;
  for (const character of bundleId || name) {
    hue = (hue * 31 + character.charCodeAt(0)) % 360;
  }
  return (
    <span
      aria-hidden
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold text-white"
      style={{ backgroundColor: `hsl(${hue} 45% 45%)` }}
    >
      {initials || "?"}
    </span>
  );
}

export function AppIcon({
  name,
  bundleId,
  artworkUrl,
}: {
  name: string;
  bundleId: string;
  artworkUrl?: string;
}) {
  const PresetIcon = PRESET_APP_ICONS[name.toLowerCase()];
  if (PresetIcon) {
    return (
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground">
        <PresetIcon className="h-4 w-4" strokeWidth={1.75} />
      </span>
    );
  }
  if (artworkUrl) {
    return (
      <img
        src={artworkUrl}
        alt=""
        loading="lazy"
        width={28}
        height={28}
        className="h-7 w-7 shrink-0 rounded-md border"
      />
    );
  }
  return <Monogram name={name} bundleId={bundleId} />;
}
