import React from "react";
import { useParams, Navigate } from "react-router-dom";
import { ImageConverter } from "@/components/image-converter";
import { AudioConverter } from "@/pages/audio/convert/audio-converter";
import { PageMeta } from "@/components/page-meta";
import { MagickFormat } from "@imagemagick/magick-wasm";
import { printProlog } from "@/lib/prolog";

// Define supported formats
const audioFormats = ["mp3", "wav", "ogg", "flac"];

const imageInputs: Record<string, string> = {
  jpeg: "JPEG",
  png: "PNG",
  webp: "WEBP",
  avif: "AVIF",
  heic: "HEIC",
  gif: "GIF",
  tiff: "TIFF",
  bmp: "BMP",
  ico: "ICO",
  psd: "PSD",
  svg: "SVG",
};

const imageOutputs: Record<string, { name: string; enum: string }> = {
  jpeg: { name: "JPEG", enum: "Jpeg" },
  png: { name: "PNG", enum: "Png" },
  webp: { name: "WEBP", enum: "WebP" },
  avif: { name: "AVIF", enum: "Avif" },
  heic: { name: "HEIC", enum: "Heic" },
  gif: { name: "GIF", enum: "Gif" },
  tiff: { name: "TIFF", enum: "Tiff" },
  bmp: { name: "BMP", enum: "Bmp" },
  ico: { name: "ICO", enum: "Ico" },
  psd: { name: "PSD", enum: "Psd" },
};

export function getConverterSlugs(): string[] {
  const slugs: string[] = [];
  for (const input of audioFormats) {
    for (const output of audioFormats) {
      slugs.push(`${input}-to-${output}`);
    }
  }
  for (const input of Object.keys(imageInputs)) {
    for (const output of Object.keys(imageOutputs)) {
      slugs.push(`${input}-to-${output}`);
    }
  }
  return slugs;
}

export default function DynamicConverterClient() {
  React.useEffect(() => {
    if (typeof window !== "undefined") printProlog();
  }, []);

  const params = useParams();
  const rawSlug = params?.slug;

  if (!rawSlug || Array.isArray(rawSlug)) {
    return <Navigate to="/404" replace />;
  }

  const slug = rawSlug.toLowerCase().trim();

  if (!slug.includes("-to-")) {
    return <Navigate to="/404" replace />;
  }

  const [inputSlug, outputSlug] = slug
    .split("-to-")
    .map((s) => s.toLowerCase().trim());

  if (!inputSlug || !outputSlug) {
    return <Navigate to="/404" replace />;
  }

  // Check Audio
  if (audioFormats.includes(inputSlug) && audioFormats.includes(outputSlug)) {
    const title = `Convert ${inputSlug.toUpperCase()} to ${outputSlug.toUpperCase()}`;
    const description = `Convert ${inputSlug.toUpperCase()} to ${outputSlug.toUpperCase()} online. Free audio converter in the browser.`;
    return (
      <div className="h-full bg-background">
        <PageMeta
          title={title}
          description={description}
          jsonLd={{
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: title,
            description,
            applicationCategory: "UtilitiesApplication",
            operatingSystem: "Web",
          }}
        />
        <AudioConverter title={title} defaultOutputFormat={outputSlug} />
      </div>
    );
  }

  // Check Image
  if (imageInputs[inputSlug] && imageOutputs[outputSlug]) {
    const inputName = imageInputs[inputSlug];
    const outputInfo = imageOutputs[outputSlug];
    const format = (MagickFormat as unknown as Record<string, unknown>)[
      outputInfo.enum
    ];
    const title = `Convert ${inputName} to ${outputInfo.name}`;
    const description = `Convert ${inputName} to ${outputInfo.name} online. Free image converter in the browser.`;

    return (
      <div className="h-full bg-background">
        <PageMeta
          title={title}
          description={description}
          jsonLd={{
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: title,
            description,
            applicationCategory: "UtilitiesApplication",
            operatingSystem: "Web",
          }}
        />
        <ImageConverter title={title} defaultOutputFormat={format as never} />
      </div>
    );
  }

  return <Navigate to="/404" replace />;
}
