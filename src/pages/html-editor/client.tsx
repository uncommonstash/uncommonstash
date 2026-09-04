import { useEffect, useState } from "react";
import { useDebounce } from "use-debounce";
import { BackLink } from "@/components/back-link";
import { Textarea } from "@/components/ui/textarea";
import { csr } from "@/lib/compat";
import * as gtag from "@/lib/gtag";

export default csr(function HtmlEditor() {
  const [html, setHtml] = useState(
    "<h1>Hello World</h1>\n<style>\n  h1 { color: red; }\n</style>",
  );
  const [debouncedHtml] = useDebounce(html, 500);

  useEffect(() => {
    if (debouncedHtml) {
      gtag.event({
        action: "run_action",
        category: "engagement",
        label: "edit_html",
        value: 1,
      });
    }
  }, [debouncedHtml]);

  return (
    <div className="container mx-auto p-4 h-full flex flex-col">
      <BackLink />
      <h1 className="text-2xl font-bold mb-4">Realtime HTML Editor</h1>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 h-full min-h-[500px]">
        {/* Editor Pane */}
        <div className="flex flex-col h-full">
          <h2 className="text-lg font-semibold mb-2">Code</h2>
          <Textarea
            value={html}
            onChange={(e) => setHtml(e.target.value)}
            className="flex-1 resize-none font-mono p-4"
            placeholder="Enter HTML here..."
          />
        </div>

        {/* Preview Pane */}
        <div className="flex flex-col h-full">
          <h2 className="text-lg font-semibold mb-2">Preview</h2>
          <iframe
            srcDoc={debouncedHtml}
            className="flex-1 border bg-white w-full h-full rounded-md"
            title="Preview"
            sandbox="allow-scripts"
          />
        </div>
      </div>
    </div>
  );
});
