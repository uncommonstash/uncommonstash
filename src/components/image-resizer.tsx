import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { DualRangeSlider } from "@/components/ui/dual-range-slider";
import {
  initializeImageMagick,
  ImageMagick,
  MagickGeometry,
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
  ResultItem,
  EmptyState,
  OutputHeader,
} from "@/components/converter/ui";

interface ImageResizerProps {
  title?: string;
}

interface ConvertedImage {
  url: string;
  name: string;
}

export const ImageResizer = ({
  title = "Image Resizer",
}: ImageResizerProps) => {
  const [files, setFiles] = useState<File[]>([]);
  const [convertedImages, setConvertedImages] = useState<ConvertedImage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // Dimensions state
  const [width, setWidth] = useState<number | "">("");
  const [height, setHeight] = useState<number | "">("");
  const [lockAspectRatio, setLockAspectRatio] = useState(true);
  const [percentage, setPercentage] = useState<number>(100);

  // Reference dimensions from the first file
  const [originalDimensions, setOriginalDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    const initialize = async () => {
      try {
        await initializeImageMagick(
          new URL(window.location.origin + "/magick.wasm"),
        );
      } catch (e) {
        console.error("Failed to initialize ImageMagick", e);
      }
    };
    initialize();
  }, []);

  // Cleanup object URLs when convertedImages changes or component unmounts
  useEffect(() => {
    return () => {
      convertedImages.forEach((img) => URL.revokeObjectURL(img.url));
    };
  }, [convertedImages]);

  const handleFileChange = (newFiles: File[]) => {
    setFiles((prev) => {
      const updated = [...prev, ...newFiles];
      // If we didn't have files before, or if we didn't have dimensions, try to set them from the first new file
      if (prev.length === 0 && newFiles.length > 0) {
        readImageDimensions(newFiles[0]);
      }
      return updated;
    });
    setConvertedImages([]);
  };

  const readImageDimensions = (file: File) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      setOriginalDimensions({
        width: img.naturalWidth,
        height: img.naturalHeight,
      });
      setWidth(img.naturalWidth);
      setHeight(img.naturalHeight);
      setPercentage(100);
      URL.revokeObjectURL(objectUrl);
    };
    img.src = objectUrl;
  };

  const removeFile = (index: number) => {
    setFiles((prev) => {
      const newFiles = prev.filter((_, i) => i !== index);
      if (newFiles.length === 0) {
        setOriginalDimensions(null);
        setWidth("");
        setHeight("");
        setPercentage(100);
      } else if (index === 0 && prev.length > 0) {
        // If we removed the first file, update dimensions to the new first file
        readImageDimensions(newFiles[0]);
      }
      return newFiles;
    });
    setConvertedImages([]);
  };

  const handleWidthChange = (val: string) => {
    const newWidth = parseInt(val, 10);

    if (val === "") {
      setWidth("");
      if (lockAspectRatio) setHeight("");
      return;
    }

    if (!isNaN(newWidth)) {
      setWidth(newWidth);
      if (lockAspectRatio && originalDimensions) {
        const ratio = originalDimensions.height / originalDimensions.width;
        const newHeight = Math.round(newWidth * ratio);
        setHeight(newHeight);

        // Update percentage
        const newPercentage = Math.round(
          (newWidth / originalDimensions.width) * 100,
        );
        setPercentage(newPercentage);
      } else if (originalDimensions && !lockAspectRatio) {
        // If not locked, percentage is ambiguous, maybe just don't update it or set to custom?
        // For simplicity, let's say percentage tracks width relative to original width
        const newPercentage = Math.round(
          (newWidth / originalDimensions.width) * 100,
        );
        setPercentage(newPercentage);
      }
    }
  };

  const handleHeightChange = (val: string) => {
    const newHeight = parseInt(val, 10);

    if (val === "") {
      setHeight("");
      if (lockAspectRatio) setWidth("");
      return;
    }

    if (!isNaN(newHeight)) {
      setHeight(newHeight);
      if (lockAspectRatio && originalDimensions) {
        const ratio = originalDimensions.width / originalDimensions.height;
        const newWidth = Math.round(newHeight * ratio);
        setWidth(newWidth);

        // Update percentage
        const newPercentage = Math.round(
          (newHeight / originalDimensions.height) * 100,
        );
        setPercentage(newPercentage);
      } else if (originalDimensions && !lockAspectRatio) {
        const newPercentage = Math.round(
          (newHeight / originalDimensions.height) * 100,
        );
        setPercentage(newPercentage);
      }
    }
  };

  const handlePercentageChange = (values: number[]) => {
    const p = values[0];
    setPercentage(p);
    if (originalDimensions) {
      const newWidth = Math.round(originalDimensions.width * (p / 100));
      const newHeight = Math.round(originalDimensions.height * (p / 100));
      setWidth(newWidth);
      setHeight(newHeight);
    }
  };

  const handleResize = async () => {
    if (files.length === 0) return;

    // Validate dimensions
    const targetWidth = typeof width === "number" ? width : 0;
    const targetHeight = typeof height === "number" ? height : 0;

    if (targetWidth <= 0 || targetHeight <= 0) {
      alert("Please specify valid dimensions.");
      return;
    }

    setIsProcessing(true);
    setConvertedImages([]);
    const newConvertedImages: ConvertedImage[] = [];

    gtag.event({
      action: "run_action",
      category: "engagement",
      label: "resize_image",
      value: 1,
    });

    try {
      for (const file of files) {
        const arrayBuffer = await file.arrayBuffer();
        const data = new Uint8Array(arrayBuffer);

        await new Promise<void>((resolve, _reject) => {
          try {
            ImageMagick.read(data, (image) => {
              // If batching and lock aspect ratio is on, we should technically recalculate height for this specific image
              // if we want to respect "Lock Aspect Ratio" logic for mixed batches.
              // But the current UI sets explicit Width/Height.
              // If I use the inputs, I am forcing dimensions.
              // If I want to support percentage based resizing for batch, I should use the percentage value.

              let w = targetWidth;
              let h = targetHeight;

              // If we are strictly using percentage logic, we can recalculate.
              // But the UI inputs are the source of truth.
              // However, if the user used the slider, they expect scaling.
              // If the user used inputs, they expect specific dimensions.
              // Since inputs and slider are synced, it's ambiguous.
              // Standard behavior:
              // If Lock Aspect Ratio is ON, we usually resize to fit in the box or scale by width.
              // Let's treat the inputs as "bounding box" if Lock is ON, or exact dimensions if Lock is OFF?
              // "Resize images to specific dimensions or percentages."
              // If I have a 100x100 image and a 200x100 image.
              // First image is 100x100. I set Width=50. Height becomes 50 (Lock ON). Percentage=50%.
              // For second image (200x100):
              // If I use 50x50, it distorts to square.
              // If I use 50% scale, it becomes 100x50.
              // Which one does the user want?
              // Usually "Image Resizer" with specific W/H inputs implies exact target dimensions (or fit).
              // Given the "Percentage slider" feature, it strongly implies scaling.
              // I will implement a hybrid approach:
              // If Lock Aspect Ratio is ON, I will use `MagickGeometry` with `ignoreAspectRatio: false` (default),
              // which fits within the dimensions while preserving aspect ratio.
              // If Lock Aspect Ratio is OFF, I will use `ignoreAspectRatio: true`.

              const geometry = new MagickGeometry(w, h);
              geometry.ignoreAspectRatio = !lockAspectRatio;

              image.resize(geometry);

              // We output in the same format if possible, or PNG/JPG?
              // Let's try to keep original format or default to PNG/JPG.
              // MagickFormat maps to extensions.
              // Let's detect format from file name or just use the current format of the image.
              // image.format returns the format.

              image.write(image.format, (data) => {
                const blob = new Blob([data as any], { type: file.type });
                const url = URL.createObjectURL(blob);
                newConvertedImages.push({
                  url,
                  name: file.name, // Keep original name? Or prefix?
                });
                resolve();
              });
            });
          } catch (err) {
            console.error("Error processing file", file.name, err);
            resolve(); // Continue with other files
          }
        });
      }
      setConvertedImages(newConvertedImages);
    } catch (error) {
      console.error("Batch resize failed", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadAll = async () => {
    if (convertedImages.length === 0) return;

    const zip = new JSZip();
    const promises = convertedImages.map(async (img) => {
      try {
        const response = await fetch(img.url);
        const blob = await response.blob();
        zip.file(img.name, blob);
      } catch (err) {
        console.error("Error fetching blob for zip", err);
      }
    });

    await Promise.all(promises);

    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    const link = document.createElement("a");
    link.href = url;
    link.download = "resized_images.zip";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  return (
    <ConverterLayout>
      <InputPanel show={convertedImages.length === 0}>
        <Header
          title={title}
          description="Upload images to resize them to your desired dimensions or percentage."
        />

        <FileSelector
          files={files}
          onFilesSelected={handleFileChange}
          onRemoveFile={removeFile}
          accept="image/*"
          label="Add Images"
          disabled={isProcessing}
        />

        <div className="flex flex-col gap-6 w-full py-4 md:order-2">
          {/* Dimensions Inputs */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="width">Width (px)</Label>
              <Input
                id="width"
                type="number"
                value={width}
                onChange={handleWidthChange}
                placeholder="Width"
                disabled={files.length === 0}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="height">Height (px)</Label>
              <Input
                id="height"
                type="number"
                value={height}
                onChange={handleHeightChange}
                placeholder="Height"
                disabled={files.length === 0}
              />
            </div>
          </div>

          {/* Lock Aspect Ratio */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="lock-ratio"
              checked={lockAspectRatio}
              onCheckedChange={(checked) =>
                setLockAspectRatio(checked === true)
              }
              disabled={files.length === 0}
            />
            <Label htmlFor="lock-ratio" className="cursor-pointer">
              Lock Aspect Ratio
            </Label>
          </div>

          {/* Percentage Slider */}
          <div className="space-y-4">
            <div className="flex justify-between">
              <Label>Scale Percentage</Label>
              <span className="text-sm text-muted-foreground">
                {percentage}%
              </span>
            </div>
            <DualRangeSlider
              value={[percentage]}
              onValueChange={handlePercentageChange}
              min={1}
              max={200}
              step={1}
              disabled={files.length === 0}
              className="py-4"
            />
          </div>

          <Button
            onClick={handleResize}
            disabled={files.length === 0 || isProcessing}
            size="lg"
            className="w-full sm:w-auto"
          >
            {isProcessing ? "Resizing..." : "Resize & Download"}
          </Button>
        </div>
      </InputPanel>

      <OutputPanel show={convertedImages.length > 0}>
        <OutputHeader
          count={convertedImages.length}
          onClear={() => setConvertedImages([])}
          onDownloadAll={handleDownloadAll}
          title="Resized Images"
        />

        {convertedImages.length > 0 ? (
          <div className="grid grid-cols-2 gap-6">
            {convertedImages.map((img, i) => (
              <ResultItem key={i} url={img.url} name={img.name} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No resized images yet"
            description="Upload images and click resize to see them here."
          />
        )}
      </OutputPanel>
    </ConverterLayout>
  );
};
