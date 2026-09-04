import React from "react";
import { Button } from "@/components/ui/button";
import { X, ArrowLeft, Download, FileAudio, FileVideo } from "lucide-react";
import { Link } from "react-router-dom";

// Header Component
interface HeaderProps {
  title: string;
  description: string;
  backLink?: string;
  badge?: string;
}

export function Header({
  title,
  description,
  backLink = "/",
  badge = "OFFLINE",
}: HeaderProps) {
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
          {badge && (
            <span className="text-sm font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full border align-middle">
              {badge}
            </span>
          )}
        </h1>
        <p className="text-muted-foreground">{description}</p>
      </div>
    </>
  );
}

// FileSelector Component
interface FileSelectorProps {
  files: File[];
  onFilesSelected: (files: File[]) => void;
  onRemoveFile: (index: number) => void;
  accept: string;
  label?: string;
  disabled?: boolean;
  multiple?: boolean;
}

export function FileSelector({
  files,
  onFilesSelected,
  onRemoveFile,
  accept,
  label = "Add File",
  disabled = false,
  multiple = true,
}: FileSelectorProps) {
  const [isDragging, setIsDragging] = React.useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (disabled) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFilesSelected(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesSelected(Array.from(e.target.files));
    }
  };

  return (
    <div className="space-y-4 w-full py-2 flex-1 overflow-y-auto min-h-0 basis-0 md:order-1 md:-mr-4 md:pr-4">
      <div className="flex flex-wrap gap-6 mt-2 pt-0 border-t-0">
        <label
          className={`w-40 h-40 border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition-colors shrink-0 ${
            isDragging
              ? "bg-muted/50 border-primary"
              : "hover:bg-muted/50 border-muted-foreground/25 hover:border-muted-foreground/50"
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <input
            type="file"
            accept={accept}
            onChange={handleFileInput}
            disabled={disabled}
            className="hidden"
            multiple={multiple}
          />
          <div className="p-3 bg-muted rounded-full mb-3">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-muted-foreground"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <span className="text-sm font-medium text-muted-foreground">
            {label}
          </span>
        </label>
        {files.map((file, index) => (
          <div
            key={index}
            className="relative w-40 h-40 rounded-xl overflow-hidden border group bg-gray-50 flex items-center justify-center p-4 shadow-sm"
          >
            {file.type.startsWith("image/") ? (
              <img
                src={URL.createObjectURL(file)}
                alt={`Preview ${index}`}
                className="object-contain w-full h-full"
                onLoad={(e) => URL.revokeObjectURL(e.currentTarget.src)}
              />
            ) : (
              <div className="flex flex-col items-center text-center">
                {file.type.startsWith("video/") ? (
                  <FileVideo className="w-8 h-8 text-gray-400 mb-2" />
                ) : (
                  <FileAudio className="w-8 h-8 text-gray-400 mb-2" />
                )}
                <span className="text-sm break-all font-medium text-gray-500 line-clamp-3">
                  {file.name}
                </span>
              </div>
            )}

            <button
              type="button"
              className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-all hover:scale-105"
              onClick={() => onRemoveFile(index)}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ResultItem Component
interface ResultItemProps {
  url: string;
  name: string;
  type?: "image" | "audio";
  isVideo?: boolean;
}

export function ResultItem({
  url,
  name,
  type = "image",
  isVideo = false,
}: ResultItemProps) {
  return (
    <div className="group relative flex flex-col bg-background border rounded-xl overflow-hidden shadow-sm transition-shadow hover:shadow-md">
      <div className="aspect-[4/3] w-full bg-gray-100 p-4 flex items-center justify-center overflow-hidden">
        {isVideo ? (
          <video src={url} controls className="w-full h-full object-contain" />
        ) : type === "image" ? (
          <img src={url} alt={name} className="w-full h-full object-contain" />
        ) : (
          <div className="flex flex-col items-center w-full">
            <FileAudio className="w-12 h-12 text-gray-400 mb-2" />
            <audio controls src={url} className="w-full max-w-[90%]" />
          </div>
        )}
      </div>
      <div className="p-4 border-t bg-background/50 backdrop-blur-sm">
        <p className="text-sm font-medium truncate mb-3" title={name}>
          {name}
        </p>
        <Button asChild size="sm" className="w-full">
          <a href={url} download={name}>
            Download
          </a>
        </Button>
      </div>
    </div>
  );
}

// EmptyState Component
interface EmptyStateProps {
  title?: string;
  description?: string;
}

export function EmptyState({
  title = "No converted files yet",
  description = "Upload files on the left and click convert to see them here.",
}: EmptyStateProps) {
  return (
    <div className="grow flex flex-col items-center justify-center text-center p-8 border-2 border-dashed rounded-xl border-muted-foreground/10 bg-muted/20">
      <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-muted-foreground"
        >
          <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      </div>
      <h3 className="text-lg font-medium mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-xs">{description}</p>
    </div>
  );
}

// OutputHeader Component
interface OutputHeaderProps {
  count: number;
  onClear: () => void;
  onDownloadAll?: () => void;
  title?: string;
}

export function OutputHeader({
  count,
  onClear,
  onDownloadAll,
  title = "Processed Files",
}: OutputHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden -ml-2"
          onClick={onClear}
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h2 className="text-xl font-semibold flex items-center gap-2 tracking-tight">
          {title}
          {count > 0 && (
            <span className="text-sm font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full border">
              {count}
            </span>
          )}
        </h2>
      </div>
      {count > 0 && onDownloadAll && (
        <Button
          variant="outline"
          size="sm"
          onClick={onDownloadAll}
          className="gap-2"
        >
          <Download className="w-4 h-4" />
          Download All
        </Button>
      )}
    </div>
  );
}
