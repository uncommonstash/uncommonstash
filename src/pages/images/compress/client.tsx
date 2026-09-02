import React from "react";
import { csr } from "@/lib/compat";
import { ImageCompressor } from "@/components/image-compressor";

export default csr(function ImageCompressorClient() {
  return (
    <div className="h-full bg-background">
      <ImageCompressor />
    </div>
  );
});
