import { useEffect, useState } from "react";
import { useParams, Navigate } from "react-router-dom";
import { getPost, type BlogPost } from "@/lib/blog";
import { PageMeta } from "@/components/page-meta";
import { BackLink } from "@/components/back-link";

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
      <article className="max-w-none">
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
        <div
          className="prose dark:prose-invert max-w-none"
          dangerouslySetInnerHTML={{ __html: post.contentHtml }}
        />
      </article>
    </div>
  );
}
