import { csr } from "@/lib/compat";
import { ImageConverter } from "../../../components/image-converter";

export default csr(function ImageConvertPage() {
  return (
    <div className="h-full bg-background">
      <ImageConverter />
    </div>
  );
});
