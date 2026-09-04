import DOMPurify from "dompurify";
import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { BackLink } from "@/components/back-link";
import { PageMeta } from "@/components/page-meta";
import { type BlogPost, getPost } from "@/lib/blog";

export default function BlogPostPage() {
  const { slug } = useParams();
  const [post, setPost] = useState<BlogPost | null | undefined>(undefined);

  useEffect(() => {
    if (!slug) {
      setPost(null);
      return;
    }
    void getPost(slug).then(setPost);
  }, [slug]);

  if (post === undefined) return null;
  if (post === null) return <Navigate to="/404" replace />;

  // Author-controlled markdown, sanitized once so the render site below is safe.
  const safeHtml = DOMPurify.sanitize(post.contentHtml);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.description,
    datePublished: post.datePublished,
    dateModified: post.dateModified,
    author: { "@type": "Person", name: post.author },
  };

  const formattedDate = new Date(post.datePublished).toLocaleDateString(
    "en-US",
    {
      year: "numeric",
      month: "short",
      day: "numeric",
    },
  );

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <BackLink to="/blog" label="Blog" />
      <PageMeta
        title={post.title}
        description={post.description}
        jsonLd={jsonLd}
      />
      <article className="prose dark:prose-invert max-w-none">
        <header className="mb-8">
          <h1 className="text-4xl font-bold tracking-tight mb-2">
            {post.title}
          </h1>
          <div className="text-muted-foreground flex items-center gap-2">
            {formattedDate}
            <span>•</span>
            {post.author === "Shukant Pal" ? (
              <a
                href="https://shukant.com"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline hover:text-foreground transition-colors"
              >
                {post.author}
              </a>
            ) : (
              <span>{post.author}</span>
            )}
          </div>
        </header>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: `safeHtml` is DOMPurify-sanitized above; never raw user HTML. */}
        <div dangerouslySetInnerHTML={{ __html: safeHtml }} />
      </article>
    </div>
  );
}
