import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  initializeImageMagick,
  ImageMagick,
  MagickFormat,
} from "@imagemagick/magick-wasm";
import JSZip from "jszip";
import * as gtag from "@/lib/gtag";
import {
  ConverterLayout,
  InputPanel,
  OutputPanel,
} from "@/components/converter/layout";
import {
  Header,
  FileSelector,
  OutputHeader,
  EmptyState,
} from "@/components/converter/ui";
import { Download } from "lucide-react";

const formatBytes = (bytes: number, decimals = 2) => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
};

interface CompressedImage {
  originalUrl: string;
  compressedUrl: string;
  name: string;
  originalSize: number;
  compressedSize: number;
}

export const ImageCompressor = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [compressionLevel, setCompressionLevel] = useState(80);
  const [compressedImages, setCompressedImages] = useState<CompressedImage[]>(
    [],
  );
  const [isCompressing, setIsCompressing] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const initialize = async () => {
      try {
        await initializeImageMagick(
          new URL(window.location.origin + "/magick.wasm"),
        );
        setIsInitialized(true);
      } catch (error) {
        console.error("Failed to initialize ImageMagick", error);
      }
    };
    initialize();
  }, []);

  const handleFileChange = (newFiles: File[]) => {
    setFiles((prev) => [...prev, ...newFiles]);
    setCompressedImages([]); // Clear previous results when adding new files
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setCompressedImages([]);
  };

  const getFormat = (filename: string): MagickFormat => {
    const ext = filename.split(".").pop()?.toLowerCase();
    switch (ext) {
      case "png":
        return MagickFormat.Png;
      case "jpg":
      case "jpeg":
        return MagickFormat.Jpg;
      case "webp":
        return MagickFormat.WebP;
      default:
        return MagickFormat.Jpg;
    }
  };

  const handleCompress = async () => {
    if (files.length === 0) return;

    gtag.event({
      action: "run_action",
      category: "engagement",
      label: "compress_image",
      value: 1,
    });

    setIsCompressing(true);
    setCompressedImages([]);
    const newCompressedImages: CompressedImage[] = [];

    try {
      for (const file of files) {
        const arrayBuffer = await file.arrayBuffer();
        const data = new Uint8Array(arrayBuffer);
        const format = getFormat(file.name);

        await new Promise<void>((resolve) => {
          ImageMagick.read(data, (image) => {
            image.quality = compressionLevel;
            image.write(format, (compressedData) => {
              const resultBlob = new Blob(
                [compressedData as unknown as BlobPart],
                {
                  type: file.type,
                },
              );
              const compressedUrl = URL.createObjectURL(resultBlob);
              const originalUrl = URL.createObjectURL(file);

              newCompressedImages.push({
                originalUrl,
                compressedUrl,
                name: file.name,
                originalSize: file.size,
                compressedSize: resultBlob.size,
              });
              resolve();
            });
          });
        });
      }
      setCompressedImages(newCompressedImages);
    } catch (error) {
      console.error("Compression failed", error);
    } finally {
      setIsCompressing(false);
    }
  };

  const handleDownloadAll = async () => {
    if (compressedImages.length === 0) return;

    if (compressedImages.length === 1) {
      const img = compressedImages[0];
      const link = document.createElement("a");
      link.href = img.compressedUrl;
      link.download = `compressed_${img.name}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    const zip = new JSZip();
    const promises = compressedImages.map(async (img) => {
      try {
        const response = await fetch(img.compressedUrl);
        const blob = await response.blob();
        zip.file(`compressed_${img.name}`, blob);
      } catch (err) {
        console.error("Error fetching blob for zip", err);
      }
    });

    await Promise.all(promises);

    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    const link = document.createElement("a");
    link.href = url;
    link.download = "compressed_images.zip";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  return (
    <ConverterLayout>
      <InputPanel show={compressedImages.length === 0}>
        <Header
          title="Image Compressor"
          description="Reduce image file size without significant quality loss."
        />

        <FileSelector
          files={files}
          onFilesSelected={handleFileChange}
          onRemoveFile={removeFile}
          accept="image/png, image/jpeg, image/jpg"
          label="Add PNG/JPG"
          disabled={isCompressing}
        />

        <div className="flex flex-col gap-6 w-full py-1 md:order-2 mt-4">
          <div className="space-y-4">
            <div className="flex justify-between">
              <label className="text-sm font-medium text-foreground">
                Compression Level
              </label>
              <span className="text-sm text-muted-foreground">
                {compressionLevel}%
              </span>
            </div>
            <Slider
              value={[compressionLevel]}
              onValueChange={(vals) => setCompressionLevel(vals[0])}
              min={1}
              max={100}
              step={1}
              className="w-full"
            />
          </div>

          <Button
            onClick={handleCompress}
            disabled={files.length === 0 || isCompressing || !isInitialized}
            size="lg"
            className="w-full sm:w-auto min-w-[140px]"
          >
            {!isInitialized
              ? "Loading..."
              : isCompressing
                ? "Compressing..."
                : "Compress Images"}
          </Button>
        </div>
      </InputPanel>

      <OutputPanel show={compressedImages.length > 0}>
        <OutputHeader
          count={compressedImages.length}
          onClear={() => setCompressedImages([])}
          onDownloadAll={handleDownloadAll}
          title="Compressed Images"
        />

        {compressedImages.length > 0 ? (
          <div className="grid gap-6">
            {compressedImages.map((img, i) => {
              const reduction =
                ((img.originalSize - img.compressedSize) / img.originalSize) *
                100;
              const isReduction = reduction > 0;

              return (
                <div
                  key={i}
                  className="bg-card border rounded-xl overflow-hidden shadow-sm"
                >
                  <div className="p-4 grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Original
                      </p>
                      <div className="aspect-[4/3] bg-muted/30 rounded-lg flex items-center justify-center overflow-hidden border">
                        <img
                          src={img.originalUrl}
                          alt="Original"
                          className="max-w-full max-h-full object-contain"
                        />
                      </div>
                      <p className="text-sm font-medium text-center">
                        {formatBytes(img.originalSize)}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Compressed
                      </p>
                      <div className="aspect-[4/3] bg-muted/30 rounded-lg flex items-center justify-center overflow-hidden border relative">
                        <img
                          src={img.compressedUrl}
                          alt="Compressed"
                          className="max-w-full max-h-full object-contain"
                        />
                        {isReduction && (
                          <div className="absolute top-2 right-2 bg-green-500 text-white text-xs font-bold px-2 py-1 rounded-full shadow-sm">
                            -{reduction.toFixed(1)}%
                          </div>
                        )}
                      </div>
                      <div className="flex items-center justify-center gap-2">
                        <p className="text-sm font-medium">
                          {formatBytes(img.compressedSize)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-muted/30 p-4 flex justify-between items-center border-t">
                    <p
                      className="text-sm font-medium truncate max-w-[200px]"
                      title={img.name}
                    >
                      {img.name}
                    </p>
                    <Button asChild size="sm">
                      <a
                        href={img.compressedUrl}
                        download={`compressed_${img.name}`}
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Download
                      </a>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState />
        )}
      </OutputPanel>
    </ConverterLayout>
  );
};
