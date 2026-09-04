import { Link } from "react-router-dom";

export default function AppBar() {
  return (
    <header className="bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link
            to="/"
            className="flex items-center gap-2 text-xl font-bold tracking-tighter"
          >
            <img
              src="/logo.svg"
              alt="UncommonStash Logo"
              width={16}
              height={16}
              className="text-foreground"
            />
            UncommonStash
          </Link>
          <Link
            to="/blog"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Blog
          </Link>
        </div>
      </div>
    </header>
  );
}
