import { ImageCompressor } from "@/components/image-compressor";
import { csr } from "@/lib/compat";

export default csr(function ImageCompressorClient() {
  return (
    <div className="h-full bg-background">
      <ImageCompressor />
    </div>
  );
});
