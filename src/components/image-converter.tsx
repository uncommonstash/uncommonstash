import type React from "react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui";
import {
  initializeImageMagick,
  ImageMagick,
  MagickFormat,
} from "@imagemagick/magick-wasm";
import JSZip from "jszip";
import * as gtag from "@/lib/gtag";
import { toBlobPart } from "@/lib/utils";
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

const SUPPORTED_EXTENSIONS = [
  "jpg",
  "png",
  "webp",
  "avif",
  "heic",
  "gif",
  "tiff",
  "bmp",
  "ico",
  "psd",
];

interface ImageConverterProps {
  defaultOutputFormat?: MagickFormat;
  title?: string;
}

interface ConvertedImage {
  url: string;
  name: string;
}

export const ImageConverter = ({
  defaultOutputFormat = MagickFormat.Png,
  title = "Image Converter",
}: ImageConverterProps) => {
  const [files, setFiles] = useState<File[]>([]);
  const [outputFormat, setOutputFormat] =
    useState<MagickFormat>(defaultOutputFormat);
  const [convertedImages, setConvertedImages] = useState<ConvertedImage[]>([]);
  const [isConverting, setIsConverting] = useState(false);
  const [width, setWidth] = useState<number | "">("");
  const [height, setHeight] = useState<number | "">("");
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);

  const isSvg = files.some((f) => f.type === "image/svg+xml");

  useEffect(() => {
    const initialize = async () => {
      await initializeImageMagick(
        new URL(window.location.origin + "/magick.wasm"),
      );
    };
    initialize();
  }, []);

  const handleFileChange = (newFiles: File[]) => {
    setFiles((prev) => [...prev, ...newFiles]);
    // Reset conversions when new files are added
    setConvertedImages([]);

    const firstSvg = newFiles.find((f) => f.type === "image/svg+xml");
    if (firstSvg && width === "") {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        const viewBoxMatch = content.match(
          /viewBox="([\d\.]+)[,\s]+([\d\.]+)[,\s]+([\d\.]+)[,\s]+([\d\.]+)"/,
        );
        if (viewBoxMatch) {
          const w = parseFloat(viewBoxMatch[3]);
          const h = parseFloat(viewBoxMatch[4]);
          setWidth(w);
          setHeight(h);
          if (h !== 0) {
            setAspectRatio(w / h);
          } else {
            setAspectRatio(null);
          }
        }
      };
      reader.readAsText(firstSvg);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setConvertedImages([]);
  };

  const handleWidthChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newWidth = event.target.value;
    const parsedWidth = parseInt(newWidth, 10);
    if (newWidth === "") {
      setWidth("");
      setHeight("");
    } else if (!isNaN(parsedWidth)) {
      setWidth(parsedWidth);
      if (aspectRatio !== null) {
        setHeight(Math.round(parsedWidth / aspectRatio));
      }
    }
  };

  const handleHeightChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newHeight = event.target.value;
    const parsedHeight = parseInt(newHeight, 10);
    if (newHeight === "") {
      setWidth("");
      setHeight("");
    } else if (!isNaN(parsedHeight)) {
      setHeight(parsedHeight);
      if (aspectRatio !== null) {
        setWidth(Math.round(parsedHeight * aspectRatio));
      }
    }
  };

  const rasterizeSvg = (
    file: File,
    width: number,
    height: number,
  ): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const scale = window.devicePixelRatio;
          canvas.width = width * scale;
          canvas.height = height * scale;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.scale(scale, scale);
            ctx.drawImage(img, 0, 0, width, height);
            canvas.toBlob((blob) => {
              if (blob) {
                resolve(blob);
              } else {
                reject(new Error("Failed to create blob from canvas"));
              }
            }, "image/png");
          } else {
            reject(new Error("Failed to get canvas context"));
          }
        };
        img.onerror = reject;
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleConvert = async () => {
    if (files.length === 0) {
      return;
    }

    gtag.event({
      action: "run_action",
      category: "engagement",
      label: "convert_image",
      value: 1,
    });
    setIsConverting(true);
    setConvertedImages([]);
    const newConvertedImages: ConvertedImage[] = [];

    try {
      for (const file of files) {
        // If it's an SVG and we have dimensions, rasterize it first
        if (file.type === "image/svg+xml" && width !== "" && height !== "") {
          try {
            const pngBlob = await rasterizeSvg(
              file,
              width as number,
              height as number,
            );
            if (!pngBlob) throw new Error("Failed to rasterize SVG");

            const arrayBuffer = await pngBlob.arrayBuffer();
            const data = new Uint8Array(arrayBuffer);

            await new Promise<void>((resolve) => {
              ImageMagick.read(data, (image) => {
                image.write(outputFormat, (convertedData) => {
                  const resultBlob = new Blob([toBlobPart(convertedData)], {
                    type: `image/${outputFormat}`,
                  });
                  const url = URL.createObjectURL(resultBlob);
                  newConvertedImages.push({
                    url,
                    name: `${file.name.lastIndexOf(".") > 0 ? file.name.slice(0, file.name.lastIndexOf(".")) : file.name}.${outputFormat}`,
                  });
                  resolve();
                });
              });
            });
          } catch (error) {
            console.error(`Failed to convert SVG ${file.name}:`, error);
          }
        } else {
          // Standard image conversion
          const arrayBuffer = await file.arrayBuffer();
          const data = new Uint8Array(arrayBuffer);

          await new Promise<void>((resolve) => {
            ImageMagick.read(data, (image) => {
              image.write(outputFormat, (convertedData) => {
                const resultBlob = new Blob([toBlobPart(convertedData)], {
                  type: `image/${outputFormat}`,
                });
                const url = URL.createObjectURL(resultBlob);
                newConvertedImages.push({
                  url,
                  name: `${file.name.lastIndexOf(".") > 0 ? file.name.slice(0, file.name.lastIndexOf(".")) : file.name}.${outputFormat}`,
                });
                resolve();
              });
            });
          });
        }
      }
      setConvertedImages(newConvertedImages);
    } catch (error) {
      console.error("Conversion batch failed", error);
    } finally {
      setIsConverting(false);
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
    link.download = "converted_images.zip";
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
          description="Upload images to convert them to your desired format."
        />

        <FileSelector
          files={files}
          onFilesSelected={handleFileChange}
          onRemoveFile={removeFile}
          accept="image/*"
          label="Add Image"
          disabled={isConverting}
        />

        <div className="flex flex-col gap-4 w-full py-1 md:order-2">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-foreground">
              Output Format
            </label>
            <Select
              onValueChange={(value) => setOutputFormat(value as MagickFormat)}
              defaultValue={outputFormat}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select output format" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(MagickFormat)
                  .filter(([, value]) =>
                    SUPPORTED_EXTENSIONS.includes(value.toLowerCase()),
                  )
                  .map(([key, value]) => (
                    <SelectItem key={key} value={value}>
                      {key}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {isSvg && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label
                  htmlFor="width"
                  className="text-sm font-medium text-foreground"
                >
                  Width
                </label>
                <input
                  id="width"
                  type="number"
                  value={width}
                  onChange={handleWidthChange}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
              <div className="space-y-2">
                <label
                  htmlFor="height"
                  className="text-sm font-medium text-foreground"
                >
                  Height
                </label>
                <input
                  id="height"
                  type="number"
                  value={height}
                  onChange={handleHeightChange}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
            </div>
          )}

          <Button
            onClick={handleConvert}
            disabled={files.length === 0 || isConverting}
            size="lg"
            className="w-full sm:w-auto min-w-[140px]"
          >
            {isConverting ? "Converting..." : "Convert All"}
          </Button>
        </div>
      </InputPanel>

      <OutputPanel show={convertedImages.length > 0}>
        <OutputHeader
          count={convertedImages.length}
          onClear={() => setConvertedImages([])}
          onDownloadAll={handleDownloadAll}
        />

        {convertedImages.length > 0 ? (
          <div className="grid grid-cols-2 gap-6">
            {convertedImages.map((img, i) => (
              <ResultItem key={i} url={img.url} name={img.name} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No converted images yet"
            description="Upload images on the left and click convert to see them here."
          />
        )}
      </OutputPanel>
    </ConverterLayout>
  );
};
