import DOMPurify from "dompurify";
import { marked } from "marked";
import { useEffect, useState } from "react";
import { useDebounce } from "use-debounce";
import { BackLink } from "@/components/back-link";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { csr } from "@/lib/compat";
import * as gtag from "@/lib/gtag";

export default csr(function MarkdownConverter() {
  const [markdown, setMarkdown] = useState("# Hello, world!");
  const [debouncedMarkdown] = useDebounce(markdown, 500);
  const [html, setHtml] = useState("");
  const [isEditorVisible, setIsEditorVisible] = useState(true);
  const [showRawHtml, setShowRawHtml] = useState(false);

  useEffect(() => {
    const convertMarkdown = async () => {
      const convertedHtml = await marked(markdown);
      setHtml(DOMPurify.sanitize(convertedHtml));
    };
    convertMarkdown();
  }, [markdown]);

  useEffect(() => {
    if (debouncedMarkdown) {
      gtag.event({
        action: "run_action",
        category: "engagement",
        label: "convert_markdown",
        value: 1,
      });
    }
  }, [debouncedMarkdown]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(html);
  };

  return (
    <div className="container mx-auto p-4 h-full flex flex-col">
      <BackLink />
      <h1 className="text-2xl font-bold mb-4">Markdown to HTML Converter</h1>

      {/* Mobile view toggle */}
      <div className="md:hidden mb-4">
        <Button
          onClick={() => setIsEditorVisible(true)}
          variant={isEditorVisible ? "default" : "outline"}
          className="mr-2"
        >
          Editor
        </Button>
        <Button
          onClick={() => setIsEditorVisible(false)}
          variant={!isEditorVisible ? "default" : "outline"}
        >
          Preview
        </Button>
      </div>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 h-full">
        {/* Editor Pane */}
        <div
          className={`flex flex-col h-full ${!isEditorVisible && "hidden"} md:flex`}
        >
          <h2 className="text-lg font-semibold mb-2">Markdown</h2>
          <Textarea
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            className="flex-1 resize-none font-mono"
            placeholder="Enter your Markdown here..."
          />
        </div>

        {/* Preview Pane */}
        <div
          className={`flex flex-col h-full ${isEditorVisible && "hidden"} md:flex`}
        >
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-lg font-semibold">Preview</h2>
            <div className="flex gap-2">
              <Button
                onClick={() => setShowRawHtml(!showRawHtml)}
                variant="outline"
              >
                {showRawHtml ? "Rendered" : "Raw HTML"}
              </Button>
              <Button onClick={copyToClipboard} variant="outline">
                Copy HTML
              </Button>
            </div>
          </div>
          <div className="flex-1 border rounded-md p-4 bg-white prose dark:prose-invert">
            {showRawHtml ? (
              <pre className="whitespace-pre-wrap break-all">{html}</pre>
            ) : (
              <>
                {/* biome-ignore lint/security/noDangerouslySetInnerHtml: `html` is DOMPurify-sanitized at the data layer above; never raw user input. */}
                <div dangerouslySetInnerHTML={{ __html: html }} />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});
