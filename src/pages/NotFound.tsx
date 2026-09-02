import { Link } from "react-router-dom";
import { PageMeta } from "@/components/page-meta";

const popularTools = [
  { name: "Audio Converter", to: "/audio/convert" },
  { name: "Audio Cutter", to: "/audio/cut" },
  { name: "Word Counter", to: "/word-counter" },
  { name: "Base64 Converter", to: "/base64-converter" },
  { name: "QR Code Generator", to: "/qr-code-generator" },
  { name: "Image Compressor", to: "/images/compress" },
];

export function NotFoundPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <PageMeta title="Not Found" description="Page not found." />
      <div className="text-center max-w-md mx-auto">
        <h1 className="text-4xl font-bold tracking-tight mb-2">404</h1>
        <p className="text-muted-foreground mb-6">
          Sorry, the page you are looking for doesn&apos;t exist.
        </p>
        <Link to="/" className="text-sm font-medium underline underline-offset-4">
          Go home
        </Link>
        <div className="mt-8 text-left">
          <h2 className="text-sm font-semibold mb-3 text-center">Popular tools</h2>
          <ul className="space-y-2 text-center">
            {popularTools.map((tool) => (
              <li key={tool.to}>
                <Link
                  to={tool.to}
                  className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-4"
                >
                  {tool.name}
                </Link>
              </li>
            ))}
            <li>
              <Link
                to="/blog"
                className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-4"
              >
                Blog
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
