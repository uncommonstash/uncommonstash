import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import React, { useState } from "react";
import { csr } from "@/lib/compat";
import * as gtag from "@/lib/gtag";
import { CopyIcon, TrashIcon, CheckIcon } from "@radix-ui/react-icons";
import { BackLink } from "@/components/back-link";

// Helper functions for text transformation
const splitWords = (str: string) => {
  return (
    str.match(
      /[A-Z]{2,}(?=[A-Z][a-z]+[0-9]*|\b)|[A-Z]?[a-z]+[0-9]*|[A-Z]|[0-9]+/g,
    ) || []
  );
};

const toTitleCase = (str: string) => {
  return str.replace(
    /\w\S*/g,
    (txt) => txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase(),
  );
};

const toCamelCase = (str: string) => {
  const words = splitWords(str);
  if (words.length === 0) return str;
  return words
    .map((w, i) =>
      i === 0
        ? w.toLowerCase()
        : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
    )
    .join("");
};

const toSnakeCase = (str: string) => {
  const words = splitWords(str);
  if (words.length === 0) return str;
  return words.map((w) => w.toLowerCase()).join("_");
};

const toKebabCase = (str: string) => {
  const words = splitWords(str);
  if (words.length === 0) return str;
  return words.map((w) => w.toLowerCase()).join("-");
};

export default csr(function CaseConverterPage() {
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);

  const handleTransform = (fn: (s: string) => string, label: string) => {
    if (!text) return;
    const newText = fn(text);
    setText(newText);
    gtag.event({
      action: "run_action",
      category: "engagement",
      label: "case_converter_" + label,
      value: 1,
    });
  };

  const copyToClipboard = () => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const clearText = () => {
    setText("");
  };

  return (
    <div className="min-h-screen bg-secondary/30 flex items-center justify-center p-4 relative">
      <div className="absolute top-0 left-0 p-6 md:p-12">
        <BackLink />
      </div>
      <div className="w-full max-w-5xl h-[80vh] flex flex-col">
        <Card className="flex-1 flex flex-col h-full">
          <CardHeader>
            <CardTitle>Case Converter</CardTitle>
            <CardDescription>
              Convert text between uppercase, lowercase, camelCase, and more.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col gap-4 min-h-0">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => handleTransform((t) => t.toUpperCase(), "upper")}
              >
                UPPERCASE
              </Button>
              <Button
                variant="outline"
                onClick={() => handleTransform((t) => t.toLowerCase(), "lower")}
              >
                lowercase
              </Button>
              <Button
                variant="outline"
                onClick={() => handleTransform(toTitleCase, "title")}
              >
                Title Case
              </Button>
              <Button
                variant="outline"
                onClick={() => handleTransform(toCamelCase, "camel")}
              >
                camelCase
              </Button>
              <Button
                variant="outline"
                onClick={() => handleTransform(toSnakeCase, "snake")}
              >
                snake_case
              </Button>
              <Button
                variant="outline"
                onClick={() => handleTransform(toKebabCase, "kebab")}
              >
                kebab-case
              </Button>
              <div className="flex-1" />
              <Button
                variant="outline"
                size="icon"
                onClick={copyToClipboard}
                title="Copy Result"
                disabled={!text}
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
                onClick={clearText}
                title="Clear"
                disabled={!text}
              >
                <TrashIcon className="w-4 h-4" />
              </Button>
            </div>
            <Textarea
              className="flex-1 resize-none p-4 font-mono text-sm leading-relaxed"
              placeholder="Type or paste your text here..."
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
});
