import { Copy } from "lucide-react";
import { useMemo, useState } from "react";
import { BackLink } from "@/components/back-link";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { csr } from "@/lib/compat";
import * as gtag from "@/lib/gtag";

// Basic HTML formatter
export function formatHtml(html: string) {
  let formatted = "";
  let indent = 0;
  const tab = "  ";

  // Normalize newlines and remove whitespace between tags to start clean
  const cleanHtml = html
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/>\s+</g, "><")
    .trim();

  // Tokenize: match tags or non-tag content
  const tokens = cleanHtml.match(/<[^>]+>|[^<]+/g) || [];

  tokens.forEach((token) => {
    let currentIndent = indent;

    if (token.startsWith("</")) {
      // Closing tag - decrease indent before printing
      indent = Math.max(0, indent - 1);
      currentIndent = indent;
    }

    const padding = new Array(currentIndent).fill(tab).join("");
    formatted += padding + token + "\n";

    if (
      token.startsWith("<") &&
      !token.startsWith("</") &&
      !token.endsWith("/>") &&
      !token.startsWith("<!")
    ) {
      // Opening tag - increase indent for next token
      // Handle void tags which don't increase indent
      const voidTags = [
        "area",
        "base",
        "br",
        "col",
        "embed",
        "hr",
        "img",
        "input",
        "link",
        "meta",
        "param",
        "source",
        "track",
        "wbr",
      ];
      const tagName = token.match(/<([a-zA-Z0-9-]+)/)?.[1]?.toLowerCase();
      if (tagName && !voidTags.includes(tagName)) {
        indent++;
      }
    }
  });

  return formatted.trim();
}

// Basic HTML minifier
export function minifyHtml(html: string) {
  return html
    .replace(/>\s+</g, "><") // Remove spaces between tags
    .replace(/\s{2,}/g, " ") // Collapse multiple spaces
    .replace(/<!--[\s\S]*?-->/g, "") // Remove comments
    .replace(/\n/g, "") // Remove newlines
    .trim();
}

// Syntax Highlighter Component
function HighlightHtml({ code }: { code: string }) {
  const tokens = useMemo(() => {
    if (!code) return [];
    // Regex to split by tags, capturing the tag parts
    // Group 1: Opening/Closing bracket + Tag Name + Attributes + End bracket
    // This simple regex won't perfectly parse attributes but is good enough for simple highlighting

    const result: React.ReactNode[] = [];
    // Stable keys without array indices: identical token text recurs, so
    // suffix each role-scoped key with its occurrence count. Deterministic
    // per input, so keys survive re-renders of unchanged code.
    const seen = new Map<string, number>();
    const keyFor = (role: string, content: string) => {
      const n = (seen.get(content) ?? 0) + 1;
      seen.set(content, n);
      return `${role}-${content}-${n}`;
    };
    // Split by tags
    const parts = code.split(/(<\/?[^>]+>)/g);

    parts.forEach((part) => {
      if (!part) return;

      if (part.startsWith("<")) {
        // It's a tag
        // Try to match tag structure
        const tagMatch = part.match(/^(<\/?)([a-zA-Z0-9-]+)([^>]*?)(\/?>)$/);
        if (tagMatch) {
          result.push(
            <span
              key={keyFor("open", tagMatch[1])}
              className="text-blue-600 dark:text-blue-400"
            >
              {tagMatch[1]}
            </span>,
          ); // < or </
          result.push(
            <span
              key={keyFor("name", tagMatch[2])}
              className="text-purple-600 dark:text-purple-400 font-bold"
            >
              {tagMatch[2]}
            </span>,
          ); // tag name

          // Attributes
          if (tagMatch[3]) {
            // Naive attribute highlighting
            result.push(
              <span
                key={keyFor("attrs", tagMatch[3])}
                className="text-orange-600 dark:text-orange-400"
              >
                {tagMatch[3]}
              </span>,
            );
          }

          result.push(
            <span
              key={keyFor("close", tagMatch[4])}
              className="text-blue-600 dark:text-blue-400"
            >
              {tagMatch[4]}
            </span>,
          ); // > or />
        } else {
          // Comment or malformed tag
          if (part.startsWith("<!--")) {
            result.push(
              <span
                key={keyFor("comment", part)}
                className="text-gray-500 italic"
              >
                {part}
              </span>,
            );
          } else {
            result.push(
              <span
                key={keyFor("malformed", part)}
                className="text-blue-600 dark:text-blue-400"
              >
                {part}
              </span>,
            );
          }
        }
      } else {
        // Text content
        result.push(
          <span
            key={keyFor("text", part)}
            className="text-gray-800 dark:text-gray-200"
          >
            {part}
          </span>,
        );
      }
    });

    return result;
  }, [code]);

  return (
    <pre className="font-mono text-sm whitespace-pre-wrap break-all p-4 h-full overflow-auto">
      {tokens}
    </pre>
  );
}

const INITIAL_HTML =
  "<div>\n<h1>Hello World</h1>\n<p>This is a sample HTML.</p>\n</div>";

export default csr(function HtmlFormatterPage() {
  const [input, setInput] = useState(INITIAL_HTML);
  // Initialize formatted on first render instead of syncing in an effect.
  const [output, setOutput] = useState(() => formatHtml(INITIAL_HTML));

  const handleFormat = () => {
    const formatted = formatHtml(input);
    setOutput(formatted);
    gtag.event({
      action: "run_action",
      category: "engagement",
      label: "format_html",
      value: 1,
    });
  };

  const handleMinify = () => {
    const minified = minifyHtml(input);
    setOutput(minified);
    gtag.event({
      action: "run_action",
      category: "engagement",
      label: "minify_html",
      value: 1,
    });
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(output);
  };

  return (
    <div className="container mx-auto p-4 h-[calc(100vh-100px)] flex flex-col">
      <BackLink />
      <h1 className="text-2xl font-bold mb-4">HTML Formatter</h1>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 h-full min-h-0">
        {/* Input Pane */}
        <div className="flex flex-col h-full min-h-0">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-lg font-semibold">Input HTML</h2>
            <div className="flex gap-2">
              <Button onClick={handleFormat} size="sm">
                Format
              </Button>
              <Button onClick={handleMinify} size="sm" variant="outline">
                Minify
              </Button>
            </div>
          </div>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-1 resize-none font-mono text-sm p-4 leading-relaxed"
            placeholder="Paste your HTML here..."
          />
        </div>

        {/* Output Pane */}
        <div className="flex flex-col h-full min-h-0">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-lg font-semibold">Output</h2>
            <Button onClick={handleCopy} size="sm" variant="ghost">
              <Copy className="w-4 h-4 mr-2" /> Copy
            </Button>
          </div>
          <div className="flex-1 border rounded-md bg-white dark:bg-black overflow-hidden">
            <HighlightHtml code={output} />
          </div>
        </div>
      </div>
    </div>
  );
});
