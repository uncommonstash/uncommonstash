import { csr } from "@/lib/compat";
import { ImageToPdf } from "../../../components/image-to-pdf";

export default csr(function ImageToPdfPage() {
  return (
    <div className="h-full bg-background">
      <ImageToPdf />
    </div>
  );
});
