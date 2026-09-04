import { VideoConverter } from "@/components/video-converter";
import { csr } from "@/lib/compat";

export default csr(function VideoConverterClient() {
  return (
    <div className="h-full bg-background">
      <VideoConverter />
    </div>
  );
});
