import React, { Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import * as gtag from "@/lib/gtag";
import { PageMeta } from "@/components/page-meta";
import HomePage from "@/pages/home";
import BlogIndex from "@/pages/blog/BlogIndex";
import BlogPostPage from "@/pages/blog/BlogPost";
import DynamicConverterClient from "@/pages/DynamicConverter";
import { NotFoundPage } from "@/pages/NotFound";

// Eager (small) pages
import Base64ConverterPage from "@/pages/base64-converter/base64-converter";
import CaseConverterPage from "@/pages/case-converter/case-converter";
import DisclaimerGeneratorPage from "@/pages/disclaimer-generator/disclaimer-generator";
import EncryptTextPage from "@/pages/encrypt-text/encrypt-text";
import OnlineNotepadPage from "@/pages/online-notepad/online-notepad";
import QRCodeGeneratorPage from "@/pages/qr-code-generator/qr-code-generator";
import RandomNumberGeneratorPage from "@/pages/random-number-generator/random-number-generator";
import TokenGenerator from "@/pages/token-generator/token-generator";
import UTMBuilderPage from "@/pages/utm-builder/utm-builder";
import WordCounterPage from "@/pages/word-counter/word-counter";
import HtmlFormatterPage from "@/pages/html-formatter/html-formatter";
import { BillSplitterView } from "@/pages/bill-splitter/bill-splitter-view";
import { ColorPickerView } from "@/pages/color-picker/color-picker-view";
import AudioCutter from "@/pages/audio/cut/audio-cutter";
import AudioCombinerDefault, {
  AudioCombiner,
} from "@/pages/audio/combine/audio-combiner";
import AudioConverterDefault, {
  AudioConverter,
} from "@/pages/audio/convert/audio-converter";
import AudioRecorderDefault from "@/pages/audio/recorder/audio-recorder";
import TextToCronPage from "@/pages/text-to-cron/text-to-cron";
import ImageConvertPage from "@/pages/images/convert/image-convert";

// Lazy (heavy WASM) pages — responsiveness MVP
const CodeScreenshot = React.lazy(
  () => import("@/pages/code-screenshot/client"),
);
const HtmlEditor = React.lazy(() => import("@/pages/html-editor/client"));
const ImageResizerClient = React.lazy(
  () => import("@/pages/image-resizer/client"),
);
const ImageCompressorClient = React.lazy(
  () => import("@/pages/images/compress/client"),
);
const ImageToPdfPage = React.lazy(() => import("@/pages/images/to-pdf/client"));
const MarkdownConverter = React.lazy(
  () => import("@/pages/markdown-to-html/client"),
);
const VideoConverterClient = React.lazy(
  () => import("@/pages/videos/convert/client"),
);

void AudioCombiner;
void AudioConverter;

function RouteWithMeta({
  title,
  description,
  children,
}: {
  title?: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <PageMeta
        title={title}
        description={description}
        jsonLd={
          title && description
            ? {
                "@context": "https://schema.org",
                "@type": "SoftwareApplication",
                name: title,
                description,
                applicationCategory: "UtilitiesApplication",
                operatingSystem: "Web",
              }
            : undefined
        }
      />
      {children}
    </>
  );
}

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="h-6 w-6 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
    </div>
  );
}

function useGoogleAnalytics() {
  React.useEffect(() => {
    const trackingId = import.meta.env.VITE_GA_ID;
    if (!import.meta.env.PROD || !trackingId) return;
    if (document.querySelector('script[data-ga="true"]')) return;
    const script = document.createElement("script");
    script.async = true;
    script.dataset.ga = "true";
    script.src = `https://www.googletagmanager.com/gtag/js?id=${trackingId}`;
    document.head.appendChild(script);
    const inline = document.createElement("script");
    inline.dataset.ga = "true";
    inline.innerHTML = `
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', '${trackingId}');
    `;
    document.head.appendChild(inline);
  }, []);
  return null;
}

function useGtagPageview() {
  React.useEffect(() => {
    try {
      gtag.pageview(new URL(window.location.href));
    } catch {
      // ignore
    }
  }, []);
  return null;
}

export default function App() {
  useGoogleAnalytics();
  useGtagPageview();
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto min-h-0">
        <Suspense fallback={<LoadingFallback />}>
          <Routes>
            <Route path="/" element={<HomePage ssr={true} />} />
            <Route path="/blog" element={<BlogIndex />} />
            <Route path="/blog/:slug" element={<BlogPostPage />} />

            <Route
              path="/bill-splitter"
              element={
                <RouteWithMeta
                  title="Bill Splitter"
                  description="Upload a receipt to split expenses with friends. Our tool parses your receipt and lets you select items to calculate your share."
                >
                  <BillSplitterView ssr={true} />
                </RouteWithMeta>
              }
            />
            <Route
              path="/color-picker"
              element={
                <RouteWithMeta
                  title="Color Picker"
                  description="Pick colors and convert between HEX, RGB, and HSL values."
                >
                  <ColorPickerView ssr={true} />
                </RouteWithMeta>
              }
            />
            <Route
              path="/audio/convert"
              element={
                <RouteWithMeta
                  title="Audio Converter"
                  description="Convert audio files to different formats online. Supports MP3, WAV, OGG, and more."
                >
                  <AudioConverterDefault ssr={true} />
                </RouteWithMeta>
              }
            />
            <Route
              path="/audio/cut"
              element={
                <RouteWithMeta
                  title="Audio Cutter"
                  description="Cut and trim audio files online. Edit your audio tracks easily in the browser."
                >
                  <AudioCutter ssr={true} />
                </RouteWithMeta>
              }
            />
            <Route
              path="/audio/combine"
              element={
                <RouteWithMeta
                  title="Audio Combiner"
                  description="Combine multiple audio files in the browser."
                >
                  <AudioCombinerDefault ssr={true} />
                </RouteWithMeta>
              }
            />
            <Route
              path="/audio/recorder"
              element={
                <RouteWithMeta
                  title="Voice Recorder"
                  description="Record voice and audio online. Simple browser-based audio recorder."
                >
                  <AudioRecorderDefault ssr={true} />
                </RouteWithMeta>
              }
            />
            <Route
              path="/audio-recorder"
              element={<Navigate to="/audio/recorder" replace />}
            />
            <Route
              path="/base64-converter"
              element={
                <RouteWithMeta
                  title="Base64 Converter"
                  description="Easily encode and decode text to and from Base64. Supports standard and URL-safe variants with or without padding."
                >
                  <Base64ConverterPage ssr={true} />
                </RouteWithMeta>
              }
            />
            <Route
              path="/case-converter"
              element={
                <RouteWithMeta
                  title="Case Converter"
                  description="Convert text between uppercase, lowercase, camelCase, snake_case, and more."
                >
                  <CaseConverterPage ssr={true} />
                </RouteWithMeta>
              }
            />
            <Route
              path="/code-screenshot"
              element={
                <RouteWithMeta
                  title="Code Screenshot"
                  description="Create aesthetic, shareable images of code snippets with custom backgrounds and window controls."
                >
                  <CodeScreenshot ssr={true} />
                </RouteWithMeta>
              }
            />
            <Route
              path="/disclaimer-generator"
              element={
                <RouteWithMeta
                  title="Disclaimer Generator"
                  description="Generate standard disclaimer text for websites and apps."
                >
                  <DisclaimerGeneratorPage ssr={true} />
                </RouteWithMeta>
              }
            />
            <Route
              path="/encrypt-text"
              element={
                <RouteWithMeta
                  title="Encrypt Text"
                  description="Securely encrypt and decrypt text in the browser using AES. All processing happens client-side for privacy."
                >
                  <EncryptTextPage ssr={true} />
                </RouteWithMeta>
              }
            />
            <Route
              path="/html-editor"
              element={
                <RouteWithMeta
                  title="Realtime HTML Editor"
                  description="Live preview editor for HTML/CSS."
                >
                  <HtmlEditor ssr={true} />
                </RouteWithMeta>
              }
            />
            <Route
              path="/html-formatter"
              element={
                <RouteWithMeta
                  title="HTML Formatter"
                  description="Beautify or minify HTML code with syntax highlighting."
                >
                  <HtmlFormatterPage ssr={true} />
                </RouteWithMeta>
              }
            />
            <Route
              path="/image-resizer"
              element={
                <RouteWithMeta
                  title="Image Resizer"
                  description="Resize images to specific dimensions or percentages. Free online image resizer."
                >
                  <ImageResizerClient ssr={true} />
                </RouteWithMeta>
              }
            />
            <Route
              path="/images/compress"
              element={
                <RouteWithMeta
                  title="Image Compressor"
                  description="Reduce image file size (JPG/PNG) without significant quality loss."
                >
                  <ImageCompressorClient ssr={true} />
                </RouteWithMeta>
              }
            />
            <Route
              path="/images/convert"
              element={
                <RouteWithMeta
                  title="Image Converter"
                  description="Convert images between formats in the browser."
                >
                  <ImageConvertPage ssr={true} />
                </RouteWithMeta>
              }
            />
            <Route
              path="/images/to-pdf"
              element={
                <RouteWithMeta
                  title="Image to PDF Converter"
                  description="Convert multiple images into a single PDF document. Reorder images before generating the PDF."
                >
                  <ImageToPdfPage ssr={true} />
                </RouteWithMeta>
              }
            />
            <Route
              path="/markdown-to-html"
              element={
                <RouteWithMeta
                  title="Markdown to HTML"
                  description="Convert Markdown to HTML online. Real-time preview and raw HTML output."
                >
                  <MarkdownConverter ssr={true} />
                </RouteWithMeta>
              }
            />
            <Route
              path="/online-notepad"
              element={
                <RouteWithMeta
                  title="Online Notepad"
                  description="A simple persistent browser-based notepad. Auto-save content to localStorage on every keystroke."
                >
                  <OnlineNotepadPage ssr={true} />
                </RouteWithMeta>
              }
            />
            <Route
              path="/qr-code-generator"
              element={
                <RouteWithMeta
                  title="QR Code Generator"
                  description="Generate a QR code for a given URL or text."
                >
                  <QRCodeGeneratorPage />
                </RouteWithMeta>
              }
            />
            <Route
              path="/random-number-generator"
              element={
                <RouteWithMeta
                  title="Random Number Generator"
                  description="Generate random integers within a specific range. Customize minimum and maximum values, count, and uniqueness."
                >
                  <RandomNumberGeneratorPage ssr={true} />
                </RouteWithMeta>
              }
            />
            <Route
              path="/text-to-cron"
              element={
                <RouteWithMeta
                  title="Text to Cron"
                  description="Generate Cron expressions from text. Convert natural language to cron schedules."
                >
                  <TextToCronPage ssr={true} />
                </RouteWithMeta>
              }
            />
            <Route
              path="/token-generator"
              element={
                <RouteWithMeta
                  title="Token Generator"
                  description="Generate secure random API keys, UUIDs, passwords, and Base64 strings."
                >
                  <TokenGenerator ssr={true} />
                </RouteWithMeta>
              }
            />
            <Route
              path="/utm-builder"
              element={
                <RouteWithMeta
                  title="UTM Builder"
                  description="Create marketing campaign URLs with standard UTM parameters."
                >
                  <UTMBuilderPage ssr={true} />
                </RouteWithMeta>
              }
            />
            <Route
              path="/videos/convert"
              element={
                <RouteWithMeta
                  title="Video Converter"
                  description="Convert videos to different formats like MP4, WebM, GIF, and more."
                >
                  <VideoConverterClient ssr={true} />
                </RouteWithMeta>
              }
            />
            <Route
              path="/word-counter"
              element={
                <RouteWithMeta
                  title="Word Counter"
                  description="Online word counter tool. Count words, characters, and analyze text statistics."
                >
                  <WordCounterPage ssr={true} />
                </RouteWithMeta>
              }
            />
            <Route path="/:slug" element={<DynamicConverterClient />} />
            <Route path="/404" element={<NotFoundPage />} />
            <Route path="*" element={<Navigate to="/404" replace />} />
          </Routes>
        </Suspense>
      </div>
    </div>
  );
}
