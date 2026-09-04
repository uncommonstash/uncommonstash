import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useEffect, useState } from "react";
import Tesseract from "tesseract.js";
import {
  initializeImageMagick,
  ImageMagick,
  MagickFormat,
} from "@imagemagick/magick-wasm";
import { csr } from "@/lib/compat";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, Upload } from "lucide-react";

interface LineItem {
  id: number;
  name: string;
  quantity: number;
  price: number;
  selected: boolean;
}

export const BillSplitterView = csr(function BillSplitterPage() {
  const [image, setImage] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [tip, setTip] = useState(0);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);

  useEffect(() => {
    const initialize = async () => {
      await initializeImageMagick(
        new URL(window.location.origin + "/magick.wasm"),
      );
    };
    initialize();
  }, []);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      setImage(event.target.files[0]);
      setError(null);
      setLineItems([]);
      setTip(0);
      setTotal(0);
      setProgress(0);
      setHasScanned(false);
    }
  };

  const parseText = (text: string) => {
    const lines = text.split("\n");
    const items: LineItem[] = [];
    let idCounter = 0;

    for (const line of lines) {
      // Try to match standard "Item Qty Price" format
      let match = line.match(/(.+?)\s+(\d+)\s+([\d,]+\.\d{2})/);

      if (!match) {
        // Fallback to "Item Price" format (implied quantity 1)
        // Matches "Some Item Name 12.34" or "Some Item Name 12"
        const fallbackMatch = line.match(/(.+?)\s+([\d,]+\.?\d*)/);
        if (fallbackMatch) {
          const priceStr = fallbackMatch[2].replace(",", "");
          // Basic validation to ensure the last part looks like a price
          if (!isNaN(parseFloat(priceStr))) {
            items.push({
              id: idCounter++,
              name: fallbackMatch[1].trim(),
              quantity: 1,
              price: parseFloat(priceStr),
              selected: false,
            });
            continue; // Skip next check
          }
        }
      }

      if (match) {
        items.push({
          id: idCounter++,
          name: match[1].trim(),
          quantity: parseInt(match[2]),
          price: parseFloat(match[3].replace(",", "")),
          selected: false,
        });
      } else {
        const tipMatch = line.match(/tip\s+([\d,]+\.\d{2})/i);
        if (tipMatch) {
          setTip(parseFloat(tipMatch[1].replace(",", "")));
        }
      }
    }
    setLineItems(items);
  };

  const handleOCR = async () => {
    if (!image) return;
    setError(null);
    setProgress(0);
    setIsProcessing(true);

    try {
      const arrayBuffer = await image.arrayBuffer();
      const data = new Uint8Array(arrayBuffer);
      let pngBlob: Blob | null = null;

      await new Promise<void>((resolve, reject) => {
        try {
          ImageMagick.read(data, (img) => {
            img.write(MagickFormat.Png, (convertedData) => {
              pngBlob = new Blob([convertedData as unknown as BlobPart], {
                type: "image/png",
              });
              resolve();
            });
          });
        } catch (err) {
          reject(err);
        }
      });

      if (!pngBlob) {
        throw new Error("Failed to convert image");
      }

      const imageUrl = URL.createObjectURL(pngBlob);

      try {
        const {
          data: { text },
        } = await Tesseract.recognize(imageUrl, "eng", {
          logger: (m) => {
            if (m.status === "recognizing text") {
              setProgress(m.progress);
            }
          },
        });
        parseText(text);
      } finally {
        URL.revokeObjectURL(imageUrl);
      }
    } catch (e) {
      console.error(e);
      setError(
        e instanceof Error ? e.message : "An error occurred during scanning",
      );
    } finally {
      setIsProcessing(false);
      setHasScanned(true);
    }
  };

  const handleCheckboxChange = (id: number) => {
    setLineItems((prevItems) =>
      prevItems.map((item) =>
        item.id === id ? { ...item, selected: !item.selected } : item,
      ),
    );
  };

  useEffect(() => {
    const selectedItemsTotal = lineItems
      .filter((item) => item.selected)
      .reduce((acc, item) => acc + item.price, 0);
    setTotal(selectedItemsTotal + tip);
  }, [lineItems, tip]);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-6 md:px-12 py-12">
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
            <h1 className="text-4xl font-bold tracking-tight mb-3">
              Bill Splitter
            </h1>
            <p className="text-muted-foreground text-lg">
              Upload a receipt to split expenses with friends.
            </p>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex flex-col md:flex-row items-start gap-8">
          {/* Input Section */}
          <div className="w-full md:w-1/3 flex flex-col gap-6">
            <div className="rounded-lg border border-dashed border-border p-8 text-center hover:bg-secondary/50 transition-colors relative">
              <input
                id="picture"
                type="file"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                onChange={handleFileChange}
                accept="image/*"
              />
              <div className="flex flex-col items-center gap-2">
                <div className="p-4 rounded-full bg-secondary text-secondary-foreground">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <p className="font-medium">Click to upload receipt</p>
                  <p className="text-sm text-muted-foreground">
                    JPG, PNG, or AVIF
                  </p>
                </div>
                {image && (
                  <p className="text-sm font-medium text-primary mt-2">
                    Selected: {image.name}
                  </p>
                )}
              </div>
            </div>

            <Button
              onClick={handleOCR}
              disabled={!image || isProcessing}
              className="w-full h-12 text-lg"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing {Math.round(progress * 100)}%
                </>
              ) : (
                "Scan Receipt"
              )}
            </Button>

            {error && (
              <div className="p-4 text-sm text-red-500 bg-red-50 rounded-md border border-red-200">
                {error}
              </div>
            )}
          </div>

          {/* Output Section */}
          <div className="w-full md:w-2/3">
            {lineItems.length > 0 ? (
              <div className="rounded-lg border border-border bg-card text-card-foreground shadow-sm overflow-hidden">
                <div className="p-6 border-b border-border flex justify-between items-center">
                  <h2 className="text-xl font-semibold">Parsed Items</h2>
                  <div className="text-lg font-mono">
                    Total:{" "}
                    <span className="font-bold">${total.toFixed(2)}</span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[50px]">Select</TableHead>
                        <TableHead>Item</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Price</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lineItems.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <Checkbox
                              checked={item.selected}
                              onCheckedChange={() =>
                                handleCheckboxChange(item.id)
                              }
                            />
                          </TableCell>
                          <TableCell className="font-medium">
                            {item.name}
                          </TableCell>
                          <TableCell className="text-right">
                            {item.quantity}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            ${item.price.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="p-6 bg-secondary/20 border-t border-border">
                  <div className="flex justify-between items-center text-sm text-muted-foreground">
                    <span>Tip detected: ${tip.toFixed(2)}</span>
                    <span>
                      {lineItems.filter((i) => i.selected).length} items
                      selected
                    </span>
                  </div>
                </div>
              </div>
            ) : hasScanned ? (
              <div className="h-64 flex flex-col items-center justify-center rounded-lg border border-dashed border-destructive/50 text-destructive bg-destructive/10 gap-2">
                <p className="font-semibold">No items found</p>
                <p className="text-sm opacity-80">
                  Make sure the receipt is clear and well-lit.
                </p>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground bg-secondary/10">
                <p>Parsed line items will appear here</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});
