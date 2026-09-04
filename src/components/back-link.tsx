import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

interface BackLinkProps {
  to?: string;
  label?: string;
  className?: string;
}

/** Standard back-to-home navigation link used on all tool pages. */
export function BackLink({
  to = "/",
  label = "UncommonStash",
  className = "",
}: BackLinkProps) {
  return (
    <Link
      to={to}
      className={`inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-6 w-fit ${className}`}
    >
      <ArrowLeft className="w-4 h-4" />
      {label}
    </Link>
  );
}
