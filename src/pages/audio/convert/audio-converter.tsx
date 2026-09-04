import React, { useState } from "react";
import { convertAudio } from "@/lib/ffmpeg";
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui";
import { csr } from "@/lib/compat";
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
import JSZip from "jszip";

interface ConvertedFile {
  url: string;
  name: string;
}

interface AudioConverterProps {
  defaultOutputFormat?: string;
  title?: string;
}

export function AudioConverter({
  defaultOutputFormat = "mp3",
  title = "Audio Converter",
}: AudioConverterProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [convertedFiles, setConvertedFiles] = useState<ConvertedFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [outputFormat, setOutputFormat] = useState(defaultOutputFormat);

  const handleFileChange = (newFiles: File[]) => {
    setFiles((prev) => [...prev, ...newFiles]);
    setConvertedFiles([]);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setConvertedFiles([]);
  };

  const handleConvert = async () => {
    if (files.length === 0) return;
    gtag.event({
      action: "run_action",
      category: "engagement",
      label: "convert_audio",
      value: 1,
    });
    setLoading(true);
    setConvertedFiles([]);

    const newConvertedFiles: ConvertedFile[] = [];

    try {
      for (const file of files) {
        const outputBlob = await convertAudio(file, outputFormat);
        const url = URL.createObjectURL(outputBlob);
        // Replace extension
        const name =
          file.name.substring(0, file.name.lastIndexOf(".")) +
          "." +
          outputFormat;
        newConvertedFiles.push({ url, name });
      }
      setConvertedFiles(newConvertedFiles);
    } catch (error) {
      console.error("Conversion failed", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadAll = async () => {
    if (convertedFiles.length === 0) return;
    const zip = new JSZip();

    const promises = convertedFiles.map(async (file) => {
      try {
        const response = await fetch(file.url);
        const blob = await response.blob();
        zip.file(file.name, blob);
      } catch (err) {
        console.error("Error fetching blob", err);
      }
    });

    await Promise.all(promises);

    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    const link = document.createElement("a");
    link.href = url;
    link.download = "converted_audio.zip";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  return (
    <ConverterLayout>
      <InputPanel show={convertedFiles.length === 0}>
        <Header
          title={title}
          description="Upload audio files to convert them to your desired format."
          badge="OFFLINE"
        />

        <FileSelector
          files={files}
          onFilesSelected={handleFileChange}
          onRemoveFile={removeFile}
          accept="audio/*"
          label="Add Audio"
          disabled={loading}
        />

        <div className="flex flex-col gap-4 w-full py-1 md:order-2">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-foreground">
              Output Format
            </label>
            <Select value={outputFormat} onValueChange={setOutputFormat}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select format" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mp3">MP3</SelectItem>
                <SelectItem value="wav">WAV</SelectItem>
                <SelectItem value="ogg">OGG</SelectItem>
                <SelectItem value="flac">FLAC</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleConvert}
            disabled={files.length === 0 || loading}
            size="lg"
            className="w-full sm:w-auto min-w-[140px]"
          >
            {loading ? "Converting..." : "Convert All"}
          </Button>
        </div>
      </InputPanel>

      <OutputPanel show={convertedFiles.length > 0}>
        <OutputHeader
          count={convertedFiles.length}
          onClear={() => setConvertedFiles([])}
          onDownloadAll={handleDownloadAll}
          title="Processed Audio"
        />

        {convertedFiles.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {convertedFiles.map((file, i) => (
              <ResultItem
                key={i}
                url={file.url}
                name={file.name}
                type="audio"
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No converted audio yet"
            description="Upload audio on the left and click convert to see them here."
          />
        )}
      </OutputPanel>
    </ConverterLayout>
  );
}

export default csr(AudioConverter);
