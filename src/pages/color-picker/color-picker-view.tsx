import { csr } from "@/lib/compat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Copy, Check } from "lucide-react";
import { Link } from "react-router-dom";
import { useState } from "react";
import {
  hexToRgb,
  rgbToHex,
  rgbToHsl,
  hslToRgb,
} from "../../lib/color-utils";

export const ColorPickerView = csr(function ColorPickerPage() {
  // State for the color picker (HTML input expects hex)
  const [pickerValue, setPickerValue] = useState("#3b82f6");

  // State for text inputs
  const [hexInput, setHexInput] = useState("#3b82f6");
  const [rgbInput, setRgbInput] = useState("59, 130, 246");
  const [hslInput, setHslInput] = useState("217, 91%, 60%");

  // State for copy feedback
  const [copied, setCopied] = useState<string | null>(null);

  // Update all inputs from a validated RGB color
  const updateAll = (r: number, g: number, b: number, source: 'picker' | 'hex' | 'rgb' | 'hsl') => {
    const hex = rgbToHex(r, g, b);
    const hsl = rgbToHsl(r, g, b);
    const rgbStr = `${r}, ${g}, ${b}`;
    const hslStr = `${hsl.h}, ${hsl.s}%, ${hsl.l}%`;

    if (source !== 'picker') setPickerValue(hex);
    if (source !== 'hex') setHexInput(hex);
    if (source !== 'rgb') setRgbInput(rgbStr);
    if (source !== 'hsl') setHslInput(hslStr);
  };

  const handlePickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const hex = e.target.value;
    setPickerValue(hex);
    const rgb = hexToRgb(hex);
    if (rgb) {
      updateAll(rgb.r, rgb.g, rgb.b, 'picker');
    }
  };

  const handleHexChange = (val: string) => {
    setHexInput(val);
    const rgb = hexToRgb(val);
    if (rgb) {
      updateAll(rgb.r, rgb.g, rgb.b, 'hex');
    }
  };

  const handleRgbChange = (val: string) => {
    setRgbInput(val);
    // Parse "r, g, b" or "r g b"
    const parts = val.split(/[,\s]+/).map(Number).filter(n => !isNaN(n));
    if (parts.length === 3) {
      const [r, g, b] = parts;
      if (r >= 0 && r <= 255 && g >= 0 && g <= 255 && b >= 0 && b <= 255) {
        updateAll(r, g, b, 'rgb');
      }
    }
  };

  const handleHslChange = (val: string) => {
    setHslInput(val);
    // Parse "h, s%, l%" or "h s l"
    // Remove % and split
    const parts = val.replace(/%/g, '').split(/[,\s]+/).map(Number).filter(n => !isNaN(n));
    if (parts.length === 3) {
      const [h, s, l] = parts;
      if (h >= 0 && h <= 360 && s >= 0 && s <= 100 && l >= 0 && l <= 100) {
        const rgb = hslToRgb(h, s, l);
        updateAll(rgb.r, rgb.g, rgb.b, 'hsl');
      }
    }
  };

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-6 md:px-12 py-12">
        {/* Header */}
        <div className="mb-12">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-8 w-fit"
          >
            <ArrowLeft className="w-4 h-4" />
            UncommonStash
          </Link>

          <div>
            <h1 className="text-4xl font-bold tracking-tight mb-3">Color Picker</h1>
            <p className="text-muted-foreground text-lg">Pick colors and convert between HEX, RGB, and HSL values.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          {/* Visual Picker & Swatch */}
          <div className="space-y-6">
            <div className="relative aspect-square rounded-xl overflow-hidden shadow-lg border border-border">
              <input
                type="color"
                value={pickerValue}
                onChange={handlePickerChange}
                className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[150%] h-[150%] p-0 m-0 border-0 cursor-pointer"
                style={{ background: 'none' }}
              />
            </div>
            <div className="text-center text-sm text-muted-foreground">
              Click the swatch above to pick a color
            </div>
          </div>

          {/* Inputs */}
          <div className="space-y-8">
            <div className="space-y-2">
              <Label htmlFor="hex-input">HEX</Label>
              <div className="flex gap-2">
                <Input
                  id="hex-input"
                  value={hexInput}
                  onChange={handleHexChange}
                  placeholder="#000000"
                  className="font-mono"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(hexInput, 'hex')}
                >
                  {copied === 'hex' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="rgb-input">RGB</Label>
              <div className="flex gap-2">
                <Input
                  id="rgb-input"
                  value={rgbInput}
                  onChange={handleRgbChange}
                  placeholder="255, 255, 255"
                  className="font-mono"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(rgbInput, 'rgb')}
                >
                  {copied === 'rgb' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="hsl-input">HSL</Label>
              <div className="flex gap-2">
                <Input
                  id="hsl-input"
                  value={hslInput}
                  onChange={handleHslChange}
                  placeholder="0, 0%, 100%"
                  className="font-mono"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(hslInput, 'hsl')}
                >
                  {copied === 'hsl' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
