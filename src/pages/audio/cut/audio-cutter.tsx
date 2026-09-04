import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { cutAudio } from "@/lib/ffmpeg";
import { DualRangeSlider } from "@/components/ui/dual-range-slider";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Download,
  FileAudio,
  X,
  Music,
  Scissors,
} from "lucide-react";
import * as gtag from "@/lib/gtag";
import { csr } from "@/lib/compat";

// Helper Components (Locally defined to avoid code sharing as requested)

function AudioCutterLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col md:flex-row h-full min-h-[calc(100vh-4rem)]">
      {children}
    </div>
  );
}

function InputPanel({
  children,
  className = "",
  show = true,
}: {
  children: React.ReactNode;
  className?: string;
  show?: boolean;
}) {
  return (
    <div
      className={`w-full md:w-1/2 p-6 md:p-12 flex flex-col bg-background border-b md:border-b-0 md:border-r ${show ? "flex" : "hidden md:flex"} ${className}`}
    >
      <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full">
        {children}
      </div>
    </div>
  );
}

function OutputPanel({
  children,
  className = "",
  show = false,
}: {
  children: React.ReactNode;
  className?: string;
  show?: boolean;
}) {
  return (
    <div
      className={`w-full md:w-1/2 bg-muted/30 p-6 md:p-12 overflow-y-auto min-h-[50vh] md:min-h-auto flex-col ${show ? "flex" : "hidden md:flex"} ${className}`}
    >
      <div className="flex flex-col max-w-2xl mx-auto w-full flex-1">
        {children}
      </div>
    </div>
  );
}

function Header({
  title,
  description,
  backLink = "/",
}: {
  title: string;
  description: string;
  backLink?: string;
}) {
  return (
    <>
      <Link
        to={backLink}
        className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-6 w-fit"
      >
        <ArrowLeft className="w-4 h-4" />
        UncommonStash
      </Link>
      <div className="mb-4">
        <h1 className="text-3xl font-bold tracking-tight mb-2 flex items-center gap-3">
          {title}
        </h1>
        <p className="text-muted-foreground">{description}</p>
      </div>
    </>
  );
}

function FileSelector({
  file,
  onFileSelected,
  onRemoveFile,
  accept,
  disabled = false,
}: {
  file: File | null;
  onFileSelected: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveFile: () => void;
  accept: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-4 w-full py-2">
      {!file ? (
        <label className="w-full h-40 border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors border-muted-foreground/25 hover:border-muted-foreground/50 shrink-0">
          <input
            type="file"
            accept={accept}
            onChange={onFileSelected}
            disabled={disabled}
            className="hidden"
          />
          <div className="p-3 bg-muted rounded-full mb-3">
            <Music className="w-6 h-6 text-muted-foreground" />
          </div>
          <span className="text-sm font-medium text-muted-foreground">
            Click to upload audio
          </span>
        </label>
      ) : (
        <div className="relative w-full h-32 rounded-xl overflow-hidden border bg-gray-50 flex items-center p-4 shadow-sm gap-4">
          <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center shrink-0">
            <FileAudio className="w-8 h-8 text-gray-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate" title={file.name}>
              {file.name}
            </p>
            <p className="text-sm text-muted-foreground">
              {(file.size / 1024 / 1024).toFixed(2)} MB
            </p>
          </div>
          <button
            type="button"
            className="bg-black/10 hover:bg-black/20 text-black rounded-full p-2 transition-all"
            onClick={onRemoveFile}
            disabled={disabled}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function ResultItem({ url, name }: { url: string; name: string }) {
  return (
    <div className="group relative flex flex-col bg-background border rounded-xl overflow-hidden shadow-sm transition-shadow hover:shadow-md mb-4">
      <div className="p-4 bg-gray-50 flex flex-col items-center justify-center border-b">
        <FileAudio className="w-12 h-12 text-gray-400 mb-4" />
        <audio controls src={url} className="w-full" />
      </div>
      <div className="p-4 flex items-center justify-between gap-4">
        <p className="text-sm font-medium truncate flex-1" title={name}>
          {name}
        </p>
        <Button asChild size="sm">
          <a href={url} download={name}>
            <Download className="w-4 h-4 mr-2" />
            Download
          </a>
        </Button>
      </div>
    </div>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="grow flex flex-col items-center justify-center text-center p-8 border-2 border-dashed rounded-xl border-muted-foreground/10 bg-muted/20 h-full min-h-[300px]">
      <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
        <Scissors className="w-8 h-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-medium mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-xs">{description}</p>
    </div>
  );
}

function OutputHeader({
  count,
  onClear,
}: {
  count: number;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center justify-between mb-6">
      <h2 className="text-xl font-semibold flex items-center gap-2 tracking-tight">
        Processed Files
        {count > 0 && (
          <span className="text-sm font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full border">
            {count}
          </span>
        )}
      </h2>
      {count > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          className="text-muted-foreground hover:text-foreground"
        >
          Clear All
        </Button>
      )}
    </div>
  );
}

interface ProcessedFile {
  url: string;
  name: string;
}

export default csr(function AudioCutter() {
  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [loading, setLoading] = useState(false);
  const [processedFiles, setProcessedFiles] = useState<ProcessedFile[]>([]);
  const processedFilesRef = useRef<ProcessedFile[]>([]);

  // Update ref whenever state changes so cleanup function has access to latest list
  useEffect(() => {
    processedFilesRef.current = processedFiles;
  }, [processedFiles]);

  useEffect(() => {
    // Cleanup function to revoke URLs on unmount
    return () => {
      processedFilesRef.current.forEach((file) => {
        URL.revokeObjectURL(file.url);
      });
    };
  }, []);

  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file);
      const audio = new Audio(url);
      audio.onloadedmetadata = () => {
        setDuration(audio.duration);
        setEndTime(audio.duration);
        setStartTime(0);
        // Revoke the URL created for duration check
        URL.revokeObjectURL(url);
      };
    } else {
      setDuration(0);
      setStartTime(0);
      setEndTime(0);
    }
  }, [file]);

  const handleCut = async () => {
    if (!file) return;
    gtag.event({
      action: "run_action",
      category: "engagement",
      label: "cut_audio",
      value: 1,
    });
    setLoading(true);
    try {
      const outputBlob = await cutAudio(file, startTime, endTime);
      const url = URL.createObjectURL(outputBlob);
      const name = `cut_${startTime.toFixed(1)}_${endTime.toFixed(1)}_${file.name}`;
      setProcessedFiles((prev) => [{ url, name }, ...prev]);
    } catch (e) {
      console.error("Failed to cut audio", e);
    } finally {
      setLoading(false);
    }
  };

  const handleClearAll = () => {
    // Revoke all current URLs before clearing
    processedFiles.forEach((file) => {
      URL.revokeObjectURL(file.url);
    });
    setProcessedFiles([]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setFile(e.target.files[0]);
    }
  };

  return (
    <AudioCutterLayout>
      <InputPanel show={true}>
        <Header
          title="Audio Cutter"
          description="Upload an audio file, select the segment you want to keep, and download the result."
        />

        <FileSelector
          file={file}
          onFileSelected={handleFileChange}
          onRemoveFile={() => setFile(null)}
          accept="audio/*"
          disabled={loading}
        />

        {file && (
          <div className="mt-8 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-muted/30 p-6 rounded-xl border space-y-6">
              <div className="flex justify-between items-center text-sm font-medium">
                <span>Start: {startTime.toFixed(2)}s</span>
                <span>End: {endTime.toFixed(2)}s</span>
              </div>

              <DualRangeSlider
                min={0}
                max={duration}
                step={0.1}
                value={[startTime, endTime]}
                onValueChange={(values) => {
                  setStartTime(values[0]);
                  setEndTime(values[1]);
                }}
                className="py-4"
              />

              <div className="text-xs text-muted-foreground text-center">
                Duration: {(endTime - startTime).toFixed(2)}s
              </div>
            </div>

            <Button
              onClick={handleCut}
              disabled={loading}
              size="lg"
              className="w-full"
            >
              {loading ? "Cutting..." : "Cut Audio"}
            </Button>
          </div>
        )}
      </InputPanel>

      <OutputPanel show={processedFiles.length > 0 || !!file}>
        <OutputHeader count={processedFiles.length} onClear={handleClearAll} />

        {processedFiles.length > 0 ? (
          <div className="space-y-4">
            {processedFiles.map((pf, i) => (
              <ResultItem key={i} url={pf.url} name={pf.name} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No clips yet"
            description="Your cut audio clips will appear here."
          />
        )}
      </OutputPanel>
    </AudioCutterLayout>
  );
});
