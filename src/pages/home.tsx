import * as Icons from "@radix-ui/react-icons";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useDebounce } from "use-debounce";
import AppBar from "@/components/app-bar";
import { Input } from "@/components/ui";
import { csr } from "@/lib/compat";
import * as gtag from "@/lib/gtag";
import tools from "../lib/tools.json";

const Icon = ({ name, ...props }: { name: string; className?: string }) => {
  const IconComponent = (Icons[name as keyof typeof Icons] ??
    Icons.MixerHorizontalIcon) as React.ComponentType<{ className?: string }>;
  return <IconComponent {...props} />;
};

const useColumns = () => {
  const [cols, setCols] = useState(4);

  useEffect(() => {
    let raf = 0;
    const updateCols = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const w = window.innerWidth;
        if (w >= 1024) setCols(4);
        else if (w >= 768) setCols(3);
        else if (w >= 640) setCols(2);
        else setCols(1);
      });
    };
    updateCols();
    window.addEventListener("resize", updateCols);
    return () => {
      window.removeEventListener("resize", updateCols);
      cancelAnimationFrame(raf);
    };
  }, []);

  return cols;
};

export default csr(function HomePage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 500);

  useEffect(() => {
    if (debouncedSearch) {
      gtag.event({
        action: "search",
        category: "engagement",
        label: debouncedSearch,
        value: 1,
      });
    }
  }, [debouncedSearch]);

  const columns = useColumns();

  const filteredTools = useMemo(
    () =>
      tools.filter(
        (tool) =>
          tool.ready &&
          (tool.name.toLowerCase().includes(search.toLowerCase()) ||
            tool.description.toLowerCase().includes(search.toLowerCase())),
      ),
    [search],
  );

  // Grid filler cells have no data identity; derive stable ids from the
  // layout (count + position) outside the render loop instead of index keys.
  const fillerCount = (columns - (filteredTools.length % columns)) % columns;
  const fillerIds = useMemo(
    () =>
      Array.from({ length: fillerCount }, (_, position) => `empty-${position}`),
    [fillerCount],
  );

  return (
    <div className="min-h-screen bg-secondary/30">
      <AppBar />
      <section className="py-12 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <label htmlFor="tool-search" className="sr-only">
              Search tools
            </label>
            <div className="relative max-w-lg mx-auto">
              <Input
                id="tool-search"
                type="text"
                placeholder="Search for tools..."
                value={search}
                onChange={setSearch}
                className="h-12 px-4 text-lg pr-10"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xl leading-none"
                >
                  ×
                </button>
              )}
            </div>
            <p
              role="status"
              aria-live="polite"
              className="text-center text-sm text-muted-foreground mt-3"
            >
              {search
                ? `${filteredTools.length} ${filteredTools.length === 1 ? "result" : "results"} for "${search}"`
                : `${filteredTools.length} ${filteredTools.length === 1 ? "tool" : "tools"} available`}
            </p>
          </div>
          {filteredTools.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">
                No tools found for &lsquo;{search}&rsquo;
              </p>
              <button
                type="button"
                onClick={() => setSearch("")}
                className="text-sm font-medium underline underline-offset-4"
              >
                Reset search
              </button>
            </div>
          ) : (
            <div
              className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 bg-border"
              style={{ /*tailwind doesn't work*/ gap: 1 }}
            >
              {filteredTools.map((tool) => (
                <Link
                  to={tool.slug}
                  key={tool.slug}
                  className="bg-card p-8 hover:bg-muted/50 transition-colors text-center group block h-full"
                >
                  <Icon name={tool.icon} className="w-8 h-8 mx-auto mb-4" />
                  <h3 className="text-card-foreground text-2xl font-semibold mb-2">
                    {tool.name}
                  </h3>
                  <p className="text-muted-foreground">{tool.description}</p>
                </Link>
              ))}
              {fillerIds.map((id) => (
                <div key={id} className="bg-card h-full" aria-hidden="true" />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
});
