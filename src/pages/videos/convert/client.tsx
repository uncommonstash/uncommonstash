import React from "react";
import { csr } from "@/lib/compat";
import { VideoConverter } from "@/components/video-converter";

export default csr(function VideoConverterClient() {
  return (
    <div className="h-full bg-background">
      <VideoConverter />
    </div>
  );
});
