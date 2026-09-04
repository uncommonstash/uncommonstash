import { DownloadIcon } from "@radix-ui/react-icons";
import { useEffect, useState } from "react";
import { BackLink } from "@/components/back-link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { csr } from "@/lib/compat";
import * as gtag from "@/lib/gtag";

export default csr(function OnlineNotepadPage() {
  const [text, setText] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("uncommonstash-notepad-content");
    if (saved) {
      setText(saved);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) {
      localStorage.setItem("uncommonstash-notepad-content", text);
    }
  }, [text, loaded]);

  const handleDownload = () => {
    const element = document.createElement("a");
    const file = new Blob([text], { type: "text/plain" });
    element.href = URL.createObjectURL(file);
    element.download = "notepad.txt";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);

    gtag.event({
      action: "download",
      category: "engagement",
      label: "notepad_download",
      value: 1,
    });
  };

  const wordCount = text.trim()
    ? text.trim().split(/\s+/).filter(Boolean).length
    : 0;
  const charCount = text.length;

  return (
    <div className="min-h-screen bg-secondary/30 flex items-center justify-center p-4 relative">
      <div className="absolute top-0 left-0 p-6 md:p-12">
        <BackLink />
      </div>
      <div className="w-full max-w-5xl h-[80vh] flex flex-col gap-4">
        <Card className="flex-1 flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="flex flex-col space-y-1.5">
              <CardTitle>Online Notepad</CardTitle>
              <CardDescription>
                A simple persistent browser-based notepad.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <DownloadIcon className="mr-2 h-4 w-4" />
              Download
            </Button>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col min-h-0 pt-0">
            <div className="flex justify-end gap-4 text-sm text-muted-foreground mb-2">
              <span>{charCount} chars</span>
              <span>{wordCount} words</span>
            </div>
            <Textarea
              className="flex-1 resize-none p-4 font-mono text-sm leading-relaxed focus-visible:ring-0 focus-visible:ring-offset-0 border-0 shadow-none"
              placeholder="Type your notes here..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoFocus
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
});
