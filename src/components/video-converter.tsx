import { useState } from "react";
import { Button } from "@/components/ui/button";
import { convertVideo } from "@/lib/ffmpeg";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui";
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

interface ConvertedVideo {
  url: string;
  name: string;
}

const SUPPORTED_FORMATS = {
  mp4: "video/mp4",
  webm: "video/webm",
  gif: "image/gif",
  mov: "video/quicktime",
  avi: "video/x-msvideo",
};

export const VideoConverter = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [outputFormat, setOutputFormat] =
    useState<keyof typeof SUPPORTED_FORMATS>("mp4");
  const [convertedVideos, setConvertedVideos] = useState<ConvertedVideo[]>([]);
  const [isConverting, setIsConverting] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleFileChange = (newFiles: File[]) => {
    setFiles((prev) => [...prev, ...newFiles]);
    setConvertedVideos([]);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setConvertedVideos([]);
  };

  const handleConvert = async () => {
    if (files.length === 0) {
      return;
    }

    gtag.event({
      action: "run_action",
      category: "engagement",
      label: "convert_video",
      value: 1,
    });
    setIsConverting(true);
    setProgress(0);
    setConvertedVideos([]);
    const newConvertedVideos: ConvertedVideo[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const result = await convertVideo(
          file,
          outputFormat,
          SUPPORTED_FORMATS[outputFormat],
          (p) => {
            const clampedP = Math.min(Math.max(p, 0), 1);
            const globalProgress = ((i + clampedP) / files.length) * 100;
            setProgress(globalProgress);
          },
        );
        newConvertedVideos.push(result);
        setConvertedVideos((prev) => [...prev, result]);
      }
    } catch (error) {
      console.error("Conversion batch failed", error);
    } finally {
      setIsConverting(false);
      setProgress(0);
    }
  };

  const handleDownloadAll = async () => {
    if (convertedVideos.length === 0) return;

    const zip = new JSZip();
    const promises = convertedVideos.map(async (vid) => {
      try {
        const response = await fetch(vid.url);
        const blob = await response.blob();
        zip.file(vid.name, blob);
      } catch (err) {
        console.error("Error fetching blob for zip", err);
      }
    });

    await Promise.all(promises);

    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    const link = document.createElement("a");
    link.href = url;
    link.download = "converted_videos.zip";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  return (
    <ConverterLayout>
      <InputPanel show={convertedVideos.length === 0}>
        <Header
          title="Video Converter"
          description="Upload videos to convert them to your desired format."
        />

        <FileSelector
          files={files}
          onFilesSelected={handleFileChange}
          onRemoveFile={removeFile}
          accept="video/*"
          label="Add Video"
          disabled={isConverting}
        />

        <div className="flex flex-col gap-4 w-full py-1 md:order-2">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-foreground">
              Output Format
            </label>
            <Select
              onValueChange={(value) =>
                setOutputFormat(value as keyof typeof SUPPORTED_FORMATS)
              }
              defaultValue={outputFormat}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select output format" />
              </SelectTrigger>
              <SelectContent>
                {Object.keys(SUPPORTED_FORMATS).map((format) => (
                  <SelectItem key={format} value={format}>
                    {format.toUpperCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleConvert}
            disabled={files.length === 0 || isConverting}
            size="lg"
            className="w-full sm:w-auto min-w-[140px]"
          >
            {isConverting
              ? `Converting... ${progress.toFixed(2)}%`
              : "Convert All"}
          </Button>
        </div>
      </InputPanel>

      <OutputPanel show={convertedVideos.length > 0}>
        <OutputHeader
          count={convertedVideos.length}
          onClear={() => setConvertedVideos([])}
          onDownloadAll={handleDownloadAll}
        />

        {convertedVideos.length > 0 ? (
          <div className="grid grid-cols-2 gap-6">
            {convertedVideos.map((vid, i) => (
              <ResultItem key={i} url={vid.url} name={vid.name} isVideo />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No converted videos yet"
            description="Upload videos on the left and click convert to see them here."
          />
        )}
      </OutputPanel>
    </ConverterLayout>
  );
};
