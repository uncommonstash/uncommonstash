import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  ConverterLayout,
  InputPanel,
  OutputPanel,
} from "@/components/converter/layout";
import { Header, FileSelector, OutputHeader } from "@/components/converter/ui";
import { jsPDF } from "jspdf";
import { ArrowUp, ArrowDown, X, FileText, Download, Plus } from "lucide-react";
import * as gtag from "@/lib/gtag";

interface ImageFile {
  id: string;
  file: File;
  previewUrl: string;
}

export const ImageToPdf = () => {
  const [files, setFiles] = useState<ImageFile[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  // Keep a ref to files for cleanup on unmount
  const filesRef = useRef(files);
  filesRef.current = files;

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      filesRef.current.forEach((file) => URL.revokeObjectURL(file.previewUrl));
    };
  }, []);

  // Cleanup PDF URL when it changes or on unmount
  useEffect(() => {
    if (pdfUrl) {
      return () => URL.revokeObjectURL(pdfUrl);
    }
  }, [pdfUrl]);

  const handleFilesSelected = (newFiles: File[]) => {
    const newImageFiles = newFiles.map((file) => ({
      id: Math.random().toString(36).substring(7),
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    setFiles((prev) => [...prev, ...newImageFiles]);
    setPdfUrl(null); // Reset result
  };

  const removeFile = (id: string) => {
    setFiles((prev) => {
      const newFiles = prev.filter((f) => f.id !== id);
      // Revoke object URL for removed file
      const removedFile = prev.find((f) => f.id === id);
      if (removedFile) {
        URL.revokeObjectURL(removedFile.previewUrl);
      }
      return newFiles;
    });
    setPdfUrl(null);
  };

  const moveFile = (index: number, direction: "up" | "down") => {
    if (
      (direction === "up" && index === 0) ||
      (direction === "down" && index === files.length - 1)
    ) {
      return;
    }

    const newFiles = [...files];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    [newFiles[index], newFiles[targetIndex]] = [
      newFiles[targetIndex],
      newFiles[index],
    ];
    setFiles(newFiles);
    setPdfUrl(null);
  };

  const generatePdf = async () => {
    if (files.length === 0) return;

    setIsGenerating(true);
    gtag.event({
      action: "run_action",
      category: "engagement",
      label: "image_to_pdf",
      value: 1,
    });

    try {
      const doc = new jsPDF();

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (i > 0) {
          doc.addPage();
        }

        const img = new Image();
        img.src = file.previewUrl;
        await new Promise((resolve) => {
          img.onload = resolve;
        });

        const imgWidth = img.width;
        const imgHeight = img.height;

        // Calculate dimensions to fit in A4 (210x297mm)
        const pageWidth = 210;
        const pageHeight = 297;
        const ratio = Math.min(pageWidth / imgWidth, pageHeight / imgHeight);

        const width = imgWidth * ratio;
        const height = imgHeight * ratio;
        const x = (pageWidth - width) / 2;
        const y = (pageHeight - height) / 2;

        // Get file extension
        const format = file.file.type.split("/")[1].toUpperCase();
        const supportedFormats = ["JPEG", "PNG", "WEBP"];
        const safeFormat = supportedFormats.includes(format) ? format : "JPEG";

        doc.addImage(img, safeFormat, x, y, width, height);
      }

      const pdfBlob = doc.output("blob");
      const url = URL.createObjectURL(pdfBlob);
      setPdfUrl(url);
    } catch (error) {
      console.error("Error generating PDF:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <ConverterLayout>
      <InputPanel show={!pdfUrl}>
        <Header
          title="Image to PDF"
          description="Convert multiple images into a single PDF document. Upload images, then reorder them as needed before generating."
          badge="NEW"
        />

        {files.length === 0 ? (
          <FileSelector
            files={[]}
            onFilesSelected={handleFilesSelected}
            onRemoveFile={() => {}}
            accept="image/*"
            label="Drop images here"
            disabled={isGenerating}
            multiple={true}
          />
        ) : (
          <div className="flex flex-col gap-4 w-full flex-1 overflow-hidden">
            <div className="flex justify-end">
              <label className="cursor-pointer inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80">
                <Plus className="w-4 h-4" />
                Add more images
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleFilesSelected(Array.from(e.target.files));
                    }
                  }}
                  className="hidden"
                  multiple
                />
              </label>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-2">
              {files.map((file, index) => (
                <div
                  key={file.id}
                  className="flex items-center gap-4 p-3 bg-card border rounded-lg group"
                >
                  <div className="w-16 h-16 shrink-0 bg-muted rounded overflow-hidden flex items-center justify-center">
                    <img
                      src={file.previewUrl}
                      alt={file.file.name}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p
                      className="text-sm font-medium truncate"
                      title={file.file.name}
                    >
                      {file.file.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {(file.file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      disabled={index === 0 || isGenerating}
                      onClick={() => moveFile(index, "up")}
                      title="Move up"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      disabled={index === files.length - 1 || isGenerating}
                      onClick={() => moveFile(index, "down")}
                      title="Move down"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive/90 hover:bg-destructive/10"
                      disabled={isGenerating}
                      onClick={() => removeFile(file.id)}
                      title="Remove"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <Button
              onClick={generatePdf}
              disabled={files.length === 0 || isGenerating}
              size="lg"
              className="w-full mt-4"
            >
              {isGenerating ? "Generating PDF..." : "Generate PDF"}
            </Button>
          </div>
        )}
      </InputPanel>

      <OutputPanel show={!!pdfUrl}>
        <OutputHeader
          count={pdfUrl ? 1 : 0}
          onClear={() => setPdfUrl(null)}
          title="PDF Ready"
        />

        {pdfUrl ? (
          <div className="flex flex-col items-center justify-center h-full gap-6 p-8 border rounded-xl bg-card">
            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center text-primary">
              <FileText className="w-10 h-10" />
            </div>

            <div className="text-center space-y-2">
              <h3 className="text-xl font-semibold">Conversion Complete!</h3>
              <p className="text-muted-foreground">
                Your PDF containing {files.length} images is ready for download.
              </p>
            </div>

            <Button size="lg" className="gap-2 min-w-[200px]" asChild>
              <a href={pdfUrl} download="images.pdf">
                <Download className="w-4 h-4" />
                Download PDF
              </a>
            </Button>

            <Button variant="ghost" onClick={() => setPdfUrl(null)}>
              Convert more images
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center p-8 text-muted-foreground">
            <FileText className="w-16 h-16 mb-4 opacity-20" />
            <p>Generate a PDF to see the result here</p>
          </div>
        )}
      </OutputPanel>
    </ConverterLayout>
  );
};
