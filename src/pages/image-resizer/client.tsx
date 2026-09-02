import React from "react";
import { csr } from "@/lib/compat";
import { ImageResizer } from "@/components/image-resizer";

export default csr(function ImageResizerClient() {
  return (
    <div className="h-full bg-background">
      <ImageResizer
        title="Image Resizer"
      />
    </div>
  );
});
