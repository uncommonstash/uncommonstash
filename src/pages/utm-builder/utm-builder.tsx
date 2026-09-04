import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { csr } from "@/lib/compat";
import * as gtag from "@/lib/gtag";
import { CopyIcon, CheckIcon } from "lucide-react";
import { useDebounce } from "use-debounce";
import { BackLink } from "@/components/back-link";

export default csr(function UTMBuilderPage() {
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [source, setSource] = useState("");
  const [medium, setMedium] = useState("");
  const [campaign, setCampaign] = useState("");
  const [term, setTerm] = useState("");
  const [content, setContent] = useState("");
  const [generatedUrl, setGeneratedUrl] = useState("");
  const [isCopied, setIsCopied] = useState(false);

  const [debouncedUrl] = useDebounce(generatedUrl, 1000);

  useEffect(() => {
    if (debouncedUrl) {
      gtag.event({
        action: "run_action",
        category: "engagement",
        label: "build_utm",
        value: 1,
      });
    }
  }, [debouncedUrl]);

  useEffect(() => {
    if (!websiteUrl) {
      setGeneratedUrl("");
      return;
    }

    try {
      let urlStr = websiteUrl.trim();
      // Basic check to see if protocol is missing
      if (!/^https?:\/\//i.test(urlStr)) {
        urlStr = "https://" + urlStr;
      }

      const url = new URL(urlStr);

      if (source) url.searchParams.set("utm_source", source);
      if (medium) url.searchParams.set("utm_medium", medium);
      if (campaign) url.searchParams.set("utm_campaign", campaign);
      if (term) url.searchParams.set("utm_term", term);
      if (content) url.searchParams.set("utm_content", content);

      setGeneratedUrl(url.toString());
    } catch (_e) {
      // Invalid URL
      setGeneratedUrl("");
    }
  }, [websiteUrl, source, medium, campaign, term, content]);

  const handleCopy = () => {
    if (!generatedUrl) return;
    navigator.clipboard.writeText(generatedUrl);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-secondary/30 flex items-center justify-center p-4 relative">
      <div className="absolute top-0 left-0 p-6 md:p-12">
        <BackLink />
      </div>
      <div className="w-full max-w-5xl flex flex-col lg:flex-row gap-4">
        <Card className="flex-1">
          <CardHeader>
            <CardTitle>UTM Builder</CardTitle>
            <CardDescription>
              Generate tracking URLs with UTM parameters for your marketing
              campaigns.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="websiteUrl">Website URL (required)</Label>
              <Input
                id="websiteUrl"
                placeholder="https://example.com"
                value={websiteUrl}
                onChange={setWebsiteUrl}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="source">Campaign Source</Label>
                <Input
                  id="source"
                  placeholder="google, newsletter"
                  value={source}
                  onChange={setSource}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="medium">Campaign Medium</Label>
                <Input
                  id="medium"
                  placeholder="cpc, banner, email"
                  value={medium}
                  onChange={setMedium}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="campaign">Campaign Name</Label>
                <Input
                  id="campaign"
                  placeholder="spring_sale"
                  value={campaign}
                  onChange={setCampaign}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="term">Campaign Term</Label>
                <Input
                  id="term"
                  placeholder="running+shoes"
                  value={term}
                  onChange={setTerm}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="content">Campaign Content</Label>
              <Input
                id="content"
                placeholder="logolink, textlink"
                value={content}
                onChange={setContent}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="w-full lg:w-96 flex flex-col h-fit">
          <CardHeader>
            <CardTitle>Generated URL</CardTitle>
            <CardDescription>Copy this URL for your campaign.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-muted rounded-md break-all min-h-[100px] text-sm font-mono border">
              {generatedUrl || (
                <span className="text-muted-foreground italic">
                  Enter a website URL to start...
                </span>
              )}
            </div>
            <Button
              className="w-full"
              onClick={handleCopy}
              disabled={!generatedUrl}
            >
              {isCopied ? (
                <>
                  <CheckIcon className="mr-2 h-4 w-4" /> Copied!
                </>
              ) : (
                <>
                  <CopyIcon className="mr-2 h-4 w-4" /> Copy URL
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
});
