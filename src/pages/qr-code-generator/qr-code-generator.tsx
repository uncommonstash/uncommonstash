import { DownloadIcon } from "@radix-ui/react-icons";
import { QRCodeCanvas } from "qrcode.react";
import { useRef, useState } from "react";
import { BackLink } from "@/components/back-link";
import { PageMeta } from "@/components/page-meta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

export default function QRCodeGeneratorPage() {
  const [value, setValue] = useState("https://leveled.com");
  const [size, setSize] = useState(256);
  const [fgColor, setFgColor] = useState("#000000");
  const [bgColor, setBgColor] = useState("#ffffff");
  const [includeMargin, setIncludeMargin] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);

  const handleDownload = () => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current.querySelector("canvas");
    if (!canvas) return;

    const url = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.download = "qrcode.png";
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <>
      <PageMeta
        title="QR Code Generator"
        description="Generate a QR code for a given URL or text."
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "QR Code Generator",
          description: "Generate a QR code for a given URL or text.",
          applicationCategory: "UtilitiesApplication",
          operatingSystem: "Web",
        }}
      />
      <div className="flex flex-col gap-8 max-w-2xl mx-auto p-4 md:p-8">
        <BackLink />
        <div className="flex flex-col gap-4">
          <h1 className="text-3xl font-bold">QR Code Generator</h1>
          <p className="text-muted-foreground">
            Generate a QR code for a given URL or text.
          </p>
        </div>

        <div className="flex flex-col md:flex-row gap-8 items-start">
          <div className="flex flex-col gap-6 w-full md:w-1/2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="url">URL or Text</Label>
              <Input
                id="url"
                name="url"
                value={value}
                onChange={setValue}
                placeholder="Enter URL or text"
              />
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex justify-between items-center">
                <Label htmlFor="size">Size</Label>
                <span className="text-sm text-muted-foreground">{size}px</span>
              </div>
              <Slider
                id="size"
                min={128}
                max={512}
                step={8}
                value={[size]}
                onValueChange={(val) => setSize(val[0])}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="fgColor">Foreground Color</Label>
              <div className="flex gap-2 items-center">
                <Input
                  type="color"
                  id="fgColor"
                  name="fgColor"
                  value={fgColor}
                  onChange={setFgColor}
                  className="w-12 h-12 p-1 cursor-pointer"
                />
                <Input
                  type="text"
                  value={fgColor}
                  onChange={setFgColor}
                  className="flex-1"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="bgColor">Background Color</Label>
              <div className="flex gap-2 items-center">
                <Input
                  type="color"
                  id="bgColor"
                  name="bgColor"
                  value={bgColor}
                  onChange={setBgColor}
                  className="w-12 h-12 p-1 cursor-pointer"
                />
                <Input
                  type="text"
                  value={bgColor}
                  onChange={setBgColor}
                  className="flex-1"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="includeMargin"
                checked={includeMargin}
                onChange={(e) => setIncludeMargin(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300"
              />
              <Label htmlFor="includeMargin">Include Margin</Label>
            </div>
          </div>

          <div className="flex flex-col gap-6 items-center w-full md:w-1/2 p-8 border rounded-lg bg-card">
            {/* We render QRCodeCanvas for downloading, but it's fine for display too. */}
            <div
              ref={canvasRef}
              className="flex items-center justify-center bg-white p-4 rounded-md shadow-sm overflow-hidden w-full max-w-full aspect-square"
            >
              {value ? (
                <QRCodeCanvas
                  value={value}
                  size={Math.min(size, 250)} // limit display size so it fits
                  fgColor={fgColor}
                  bgColor={bgColor}
                  includeMargin={includeMargin}
                  style={{ width: "100%", height: "auto", maxWidth: size }}
                />
              ) : (
                <div className="text-muted-foreground text-sm flex items-center justify-center h-full w-full">
                  Enter text or URL to generate QR code
                </div>
              )}
            </div>

            <Button
              onClick={handleDownload}
              disabled={!value}
              className="w-full flex gap-2 items-center"
            >
              <DownloadIcon />
              Download PNG
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
