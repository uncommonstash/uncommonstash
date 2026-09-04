import { AlertCircle, ArrowLeft, Check, Copy, Shuffle } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Switch } from "@/components/ui";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { csr } from "@/lib/compat";

export default csr(function RandomNumberGeneratorPage() {
  const [min, setMin] = useState<number | "">(1);
  const [max, setMax] = useState<number | "">(100);
  const [count, setCount] = useState<number | "">(10);
  const [unique, setUnique] = useState(false);
  const [results, setResults] = useState<{ id: string; value: number }[]>([]);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateNumbers = () => {
    setError(null);
    const minVal = Number(min);
    const maxVal = Number(max);
    const countVal = Number(count);

    if (isNaN(minVal) || isNaN(maxVal) || isNaN(countVal)) {
      setError("Please enter valid numbers.");
      return;
    }

    if (minVal > maxVal) {
      setError("Min value cannot be greater than Max value.");
      return;
    }

    if (countVal <= 0) {
      setError("Count must be greater than 0.");
      return;
    }

    if (countVal > 10000) {
      setError("Count cannot exceed 10,000 for performance reasons.");
      return;
    }

    const range = maxVal - minVal + 1;
    if (unique && countVal > range) {
      setError(
        `Cannot generate ${countVal} unique numbers from a range of ${range} numbers.`,
      );
      return;
    }

    let newResults: { id: string; value: number }[] = [];
    if (unique) {
      // Use Set for uniqueness.
      // If range is large and count is close to range, this might be slow (coupon collector problem).
      // But we capped count at 10,000.
      const set = new Set<number>();

      // Safety break to prevent infinite loops if logic is flawed (though checks should prevent it)
      let attempts = 0;
      const maxAttempts = countVal * 100; // ample attempts

      while (set.size < countVal && attempts < maxAttempts) {
        const num = Math.floor(Math.random() * range) + minVal;
        set.add(num);
        attempts++;
      }

      if (set.size < countVal) {
        setError(
          "Failed to generate unique numbers within reasonable time. Try a smaller count or larger range.",
        );
        return;
      }

      newResults = Array.from(set, (value) => ({
        id: crypto.randomUUID(),
        value,
      }));
    } else {
      for (let i = 0; i < countVal; i++) {
        newResults.push({
          id: crypto.randomUUID(),
          value: Math.floor(Math.random() * range) + minVal,
        });
      }
    }
    setResults(newResults);
  };

  const copyToClipboard = () => {
    if (results.length === 0) return;
    const text = results.map((result) => result.value).join(", ");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-secondary/30 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-5xl mb-8">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Tools
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">
          Random Number Generator
        </h1>
        <p className="text-muted-foreground mt-2">
          Generate random integers within a specific range.
        </p>
      </div>

      <div className="w-full max-w-5xl flex flex-col md:flex-row gap-4 h-auto md:h-[80vh]">
        {/* Configuration Card */}
        <Card className="flex-1 flex flex-col shrink-0 md:max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shuffle className="w-5 h-5" />
              Configuration
            </CardTitle>
            <CardDescription>
              Set the parameters for your random numbers.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="min">Min Value</Label>
                <Input
                  id="min"
                  type="number"
                  value={min}
                  onChange={(val) => setMin(val === "" ? "" : Number(val))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="max">Max Value</Label>
                <Input
                  id="max"
                  type="number"
                  value={max}
                  onChange={(val) => setMax(val === "" ? "" : Number(val))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="count">Count (Max 10,000)</Label>
              <Input
                id="count"
                type="number"
                value={count}
                onChange={(val) => setCount(val === "" ? "" : Number(val))}
              />
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="unique"
                checked={unique}
                onCheckedChange={setUnique}
              />
              <Label htmlFor="unique">Unique Numbers Only</Label>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 p-3 rounded-md">
                <AlertCircle className="w-4 h-4" />
                <span>{error}</span>
              </div>
            )}

            <div className="mt-auto pt-4">
              <Button onClick={generateNumbers} className="w-full" size="lg">
                Generate Numbers
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Results Card */}
        <Card className="flex-1 flex flex-col h-[500px] md:h-auto min-w-0">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="flex flex-col space-y-1.5">
              <CardTitle>Results</CardTitle>
              <CardDescription>
                Generated {results.length > 0 ? results.length : 0} numbers.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={copyToClipboard}
              disabled={results.length === 0}
              className="gap-2"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Copy All
                </>
              )}
            </Button>
          </CardHeader>
          <CardContent className="flex-1 min-h-0 overflow-hidden relative">
            <div className="h-full overflow-y-auto pr-2 pb-2">
              {results.length > 0 ? (
                <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-2">
                  {results.map((result) => (
                    <div
                      key={result.id}
                      className="flex items-center justify-center p-2 bg-muted rounded-md font-mono text-lg font-medium select-all"
                    >
                      {result.value}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
                  <Shuffle className="w-8 h-8 opacity-20" />
                  <p>Click Generate to see results</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
});
