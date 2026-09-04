import html2canvas from "html2canvas";
import { useRef, useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { BackLink } from "@/components/back-link";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { csr } from "@/lib/compat";
import * as gtag from "@/lib/gtag";

const LANGUAGES = [
  "javascript",
  "typescript",
  "python",
  "java",
  "c",
  "cpp",
  "csharp",
  "go",
  "rust",
  "sql",
  "json",
  "yaml",
  "markdown",
  "html",
  "css",
  "bash",
];

const BACKGROUNDS = [
  { name: "Gradient 1", value: "linear-gradient(to right, #ff7e5f, #feb47b)" },
  { name: "Gradient 2", value: "linear-gradient(to right, #6a11cb, #2575fc)" },
  { name: "Gradient 3", value: "linear-gradient(to right, #43e97b, #38f9d7)" },
  { name: "Gradient 4", value: "linear-gradient(to right, #fa709a, #fee140)" },
  { name: "Solid Black", value: "#000000" },
  { name: "Solid White", value: "#ffffff" },
  { name: "Solid Gray", value: "#333333" },
  { name: "Transparent", value: "transparent" },
];

export default csr(function CodeScreenshot() {
  const [code, setCode] = useState(`function helloWorld() {
  console.log("Hello, World!");
}`);
  const [language, setLanguage] = useState("javascript");
  const [background, setBackground] = useState(BACKGROUNDS[1].value);
  const [padding, setPadding] = useState(32);
  const previewRef = useRef<HTMLDivElement>(null);

  const handleExport = async () => {
    if (!previewRef.current) return;

    gtag.event({
      action: "run_action",
      category: "engagement",
      label: "code_screenshot_export",
      value: 1,
    });

    try {
      const canvas = await html2canvas(previewRef.current, {
        backgroundColor: null,
        scale: 2, // Higher resolution
        onclone: (clonedDoc: Document) => {
          // html2canvas cannot parse oklch() color functions used by Tailwind v4.
          // Walk the cloned DOM and replace any oklch CSS variable values with safe fallbacks.
          const root = clonedDoc.documentElement;
          const style = root.style;
          const computed = clonedDoc.defaultView?.getComputedStyle(root);
          if (computed) {
            for (let i = 0; i < computed.length; i++) {
              const prop = computed[i];
              const val = computed.getPropertyValue(prop);
              if (val.includes("oklch")) {
                style.setProperty(prop, "transparent");
              }
            }
          }
        },
      });
      const link = document.createElement("a");
      link.download = "code-screenshot.png";
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err) {
      console.error("Export failed", err);
    }
  };

  return (
    <div className="container mx-auto p-4 h-full flex flex-col gap-6">
      <BackLink />
      <div className="flex flex-col md:flex-row gap-6 h-full">
        {/* Controls & Input */}
        <div className="w-full md:w-1/3 flex flex-col gap-4">
          <h1 className="text-2xl font-bold">Code Screenshot</h1>
          <p className="text-muted-foreground">
            Create aesthetic code snippets.
          </p>

          <div className="space-y-2">
            <label className="text-sm font-medium">Language</label>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger>
                <SelectValue placeholder="Select Language" />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((lang) => (
                  <SelectItem key={lang} value={lang}>
                    {lang}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Background</label>
            <Select value={background} onValueChange={setBackground}>
              <SelectTrigger>
                <SelectValue placeholder="Select Background" />
              </SelectTrigger>
              <SelectContent>
                {BACKGROUNDS.map((bg) => (
                  <SelectItem key={bg.name} value={bg.value}>
                    {bg.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Padding (px)</label>
            <input
              type="range"
              min="0"
              max="100"
              value={padding}
              onChange={(e) => setPadding(Number(e.target.value))}
              className="w-full"
            />
          </div>

          <div className="flex-1 min-h-[200px] flex flex-col gap-2">
            <label className="text-sm font-medium">Code</label>
            <Textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="font-mono flex-1 resize-none"
              placeholder="Paste your code here..."
            />
          </div>
          <Button onClick={handleExport} className="w-full">
            Export to PNG
          </Button>
        </div>

        {/* Preview */}
        <div className="flex-1 bg-muted/30 rounded-lg p-8 flex items-center justify-center overflow-auto min-h-[400px]">
          <div
            ref={previewRef}
            style={{ background: background, padding: `${padding}px` }}
            className="rounded-lg shadow-2xl transition-all"
          >
            <div className="bg-[#1e1e1e] rounded-lg overflow-hidden min-w-[300px]">
              {/* Window Controls */}
              <div className="h-8 bg-[#1e1e1e] flex items-center px-4 gap-2">
                <div className="w-3 h-3 rounded-full bg-[#ff5f56]"></div>
                <div className="w-3 h-3 rounded-full bg-[#ffbd2e]"></div>
                <div className="w-3 h-3 rounded-full bg-[#27c93f]"></div>
              </div>
              {/* Code Area */}
              <SyntaxHighlighter
                language={language}
                style={vscDarkPlus}
                customStyle={{
                  margin: 0,
                  padding: "1rem",
                  background: "transparent",
                }}
                showLineNumbers={false}
                wrapLines={true}
              >
                {code}
              </SyntaxHighlighter>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
