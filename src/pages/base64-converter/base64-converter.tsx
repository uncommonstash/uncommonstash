import React, { useState, useEffect, useCallback } from "react";
import { csr } from "@/lib/compat";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch, Label, Tabs, TabsList, TabsTrigger } from "@/components/ui";
import {
  CopyIcon,
  TrashIcon,
  CheckIcon,
  UpdateIcon,
} from "@radix-ui/react-icons";
import * as gtag from "@/lib/gtag";
import { BackLink } from "@/components/back-link";

type Variant = "standard" | "url-safe";

export default csr(function Base64ConverterPage() {
  const [inputText, setInputText] = useState("");
  const [outputText, setOutputText] = useState("");
  const [variant, setVariant] = useState<Variant>("standard");
  const [padding, setPadding] = useState(true);
  const [mode, setMode] = useState<"encode" | "decode">("encode");

  const handleModeChange = (newMode: "encode" | "decode") => {
    setMode(newMode);
  };
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const encode = useCallback(
    (str: string, variant: Variant, usePadding: boolean) => {
      try {
        // Use TextEncoder to handle UTF-8 correctly
        const bytes = new TextEncoder().encode(str);
        let binary = "";
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        let base64 = btoa(binary);

        if (variant === "url-safe") {
          base64 = base64.replace(/\+/g, "-").replace(/\//g, "_");
        }

        if (!usePadding) {
          base64 = base64.replace(/=+$/, "");
        }

        return base64;
      } catch {
        throw new Error("Failed to encode text to Base64.");
      }
    },
    [],
  );

  const decode = useCallback((str: string, variant: Variant) => {
    try {
      let base64 = str.trim();

      // Handle URL-safe variant
      if (variant === "url-safe") {
        base64 = base64.replace(/-/g, "+").replace(/_/g, "/");
      }

      // Add padding if missing (atob requires correct padding)
      while (base64.length % 4 !== 0) {
        base64 += "=";
      }

      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return new TextDecoder().decode(bytes);
    } catch {
      throw new Error("Invalid Base64 input.");
    }
  }, []);

  useEffect(() => {
    setError(null);
    if (!inputText) {
      setOutputText("");
      return;
    }

    try {
      if (mode === "encode") {
        setOutputText(encode(inputText, variant, padding));
      } else {
        setOutputText(decode(inputText, variant));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "An unknown error occurred");
      setOutputText("");
    }
  }, [inputText, variant, padding, mode, encode, decode]);

  const copyToClipboard = () => {
    if (!outputText) return;
    navigator.clipboard.writeText(outputText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      gtag.event({
        action: "run_action",
        category: "engagement",
        label: "base64_copy",
        value: 1,
      });
    });
  };

  const clearAll = () => {
    setInputText("");
    setOutputText("");
    setError(null);
  };

  const toggleMode = () => {
    const newMode = mode === "encode" ? "decode" : "encode";
    setMode(newMode);
    // Swap input and output if there is result
    if (outputText && !error) {
      setInputText(outputText);
    }
    gtag.event({
      action: "run_action",
      category: "engagement",
      label: "base64_toggle_mode",
      value: 1,
    });
  };

  return (
    <div className="min-h-screen bg-secondary/30 flex items-center justify-center p-4 relative">
      <div className="absolute top-0 left-0 p-6 md:p-12">
        <BackLink />
      </div>
      <div className="w-full max-w-5xl h-[80vh] flex flex-col">
        <Card className="flex-1 flex flex-col h-full">
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle>Base64 Converter</CardTitle>
                <CardDescription>
                  Encode or decode text with support for URL-safe variants and
                  padding control.
                </CardDescription>
              </div>
              <Tabs
                value={mode}
                onValueChange={(v) =>
                  handleModeChange(v as "encode" | "decode")
                }
              >
                <TabsList className="h-9">
                  <TabsTrigger value="encode" className="h-7">
                    Encode
                  </TabsTrigger>
                  <TabsTrigger value="decode" className="h-7">
                    Decode
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col gap-6 min-h-0 overflow-auto">
            <div className="flex flex-wrap items-center gap-6">
              <div className="flex items-center space-x-2">
                <Label className="text-sm font-medium">Variant:</Label>
                <Tabs
                  value={variant}
                  onValueChange={(v) => setVariant(v as Variant)}
                >
                  <TabsList className="h-8">
                    <TabsTrigger value="standard" className="h-6 text-xs px-2">
                      Standard
                    </TabsTrigger>
                    <TabsTrigger value="url-safe" className="h-6 text-xs px-2">
                      URL Safe
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              {mode === "encode" && (
                <div className="flex items-center space-x-2">
                  <Switch
                    id="padding-toggle"
                    checked={padding}
                    onCheckedChange={setPadding}
                  />
                  <Label
                    htmlFor="padding-toggle"
                    className="text-sm font-medium"
                  >
                    Padding (=)
                  </Label>
                </div>
              )}

              <div className="flex-1" />

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={toggleMode}
                  title="Swap Input/Output"
                >
                  <UpdateIcon className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={copyToClipboard}
                  title="Copy Result"
                  disabled={!outputText}
                >
                  {copied ? (
                    <CheckIcon className="w-4 h-4" />
                  ) : (
                    <CopyIcon className="w-4 h-4" />
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={clearAll}
                  title="Clear All"
                  disabled={!inputText && !outputText}
                >
                  <TrashIcon className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 min-h-0">
              <div className="flex flex-col gap-2 h-full">
                <Label
                  htmlFor="input"
                  className="text-xs text-muted-foreground uppercase tracking-wider font-bold"
                >
                  {mode === "encode" ? "Text to Encode" : "Base64 to Decode"}
                </Label>
                <Textarea
                  id="input"
                  className="flex-1 resize-none p-4 font-mono text-sm leading-relaxed"
                  placeholder={
                    mode === "encode"
                      ? "Enter plain text here..."
                      : "Enter Base64 string here..."
                  }
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2 h-full relative">
                <Label
                  htmlFor="output"
                  className="text-xs text-muted-foreground uppercase tracking-wider font-bold"
                >
                  {mode === "encode" ? "Encoded Base64" : "Decoded Text"}
                </Label>
                <Textarea
                  id="output"
                  className={`flex-1 resize-none p-4 font-mono text-sm leading-relaxed ${error ? "border-destructive" : "bg-muted/50"}`}
                  placeholder="Result will appear here..."
                  value={outputText}
                  readOnly
                />
                {error && (
                  <div className="absolute bottom-4 left-4 right-4 p-2 bg-destructive/10 border border-destructive/20 text-destructive text-xs rounded">
                    {error}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
});
