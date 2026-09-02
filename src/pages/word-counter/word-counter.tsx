import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import React, { useState, useMemo, useEffect } from "react";
import { csr } from "@/lib/compat";
import { stopWords } from "./stop-words";
import { useDebounce } from "use-debounce";
import * as gtag from "@/lib/gtag";
import { BackLink } from "@/components/back-link";

export default csr(function WordCounterPage() {
  const [text, setText] = useState("");
  const [debouncedText] = useDebounce(text, 500);

  useEffect(() => {
    if (debouncedText) {
      gtag.event({
        action: "run_action",
        category: "engagement",
        label: "count_words",
        value: 1,
      });
    }
  }, [debouncedText]);

  const wordCount = text.trim()
    ? text.trim().split(/\s+/).filter(Boolean).length
    : 0;
  const sentenceCount = text.trim()
    ? text
        .trim()
        .split(/[.!?]+/)
        .filter((s) => s.trim().length > 0).length
    : 0;
  const charCount = text.length;

  const topKeywords = useMemo(() => {
    if (!text) return [];
    const words = text.toLowerCase().match(/\b[\w']+\b/g) || [];
    const frequency: Record<string, number> = {};

    words.forEach((word) => {
      if (!stopWords.has(word) && word.length > 2 && !/^\d+$/.test(word)) {
        frequency[word] = (frequency[word] || 0) + 1;
      }
    });

    return Object.entries(frequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  }, [text]);

  return (
    <div className="min-h-screen bg-secondary/30 flex items-center justify-center p-4 relative">
      <div className="absolute top-0 left-0 p-6 md:p-12">
        <BackLink />
      </div>
      <div className="w-full max-w-5xl flex gap-4 h-[80vh]">
        <Card className="flex-1 flex flex-col">
          <CardHeader>
            <CardTitle>Word Counter</CardTitle>
            <CardDescription>
              Count words, sentences, and characters in your text.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col gap-4 min-h-0">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
              <div className="p-4 bg-background rounded-lg border shadow-sm">
                <div className="text-2xl font-bold">{wordCount}</div>
                <div className="text-sm text-muted-foreground">Words</div>
              </div>
              <div className="p-4 bg-background rounded-lg border shadow-sm">
                <div className="text-2xl font-bold">{sentenceCount}</div>
                <div className="text-sm text-muted-foreground">Sentences</div>
              </div>
              <div className="p-4 bg-background rounded-lg border shadow-sm">
                <div className="text-2xl font-bold">{charCount}</div>
                <div className="text-sm text-muted-foreground">Characters</div>
              </div>
            </div>
            <Textarea
              className="flex-1 resize-none p-4 font-mono text-sm leading-relaxed"
              placeholder="Paste or type your text here..."
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </CardContent>
        </Card>

        <Card className="w-80 hidden lg:flex flex-col">
          <CardHeader>
            <CardTitle>Top Keywords</CardTitle>
            <CardDescription>Most frequent words.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-auto">
            {topKeywords.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8">
                Type some text to see keywords.
              </div>
            ) : (
              <div className="space-y-2">
                {topKeywords.map(([word, count]) => (
                  <div
                    key={word}
                    className="flex justify-between items-center p-2 bg-background rounded border shadow-sm"
                  >
                    <span className="font-medium">{word}</span>
                    <span className="text-muted-foreground text-sm">
                      {count}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
});
