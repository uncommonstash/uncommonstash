import { Link } from "react-router-dom";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getPosts } from "@/lib/blog";
import { PageMeta } from "@/components/page-meta";
import { useEffect, useState } from "react";
import type { BlogPost } from "@/lib/blog";

export default function BlogIndex() {
  const [posts, setPosts] = useState<BlogPost[]>([]);

  useEffect(() => {
    void getPosts().then(setPosts);
  }, []);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "UncommonStash Blog",
    description: "Thoughts and insights from UncommonStash",
    url: "https://uncommonstash.com/blog",
    blogPost: posts.map((post) => ({
      "@type": "BlogPosting",
      headline: post.title,
      description: post.description,
      datePublished: post.datePublished,
      dateModified: post.dateModified,
      author: { "@type": "Person", name: "Shukant Pal" },
      url: `https://uncommonstash.com/blog/${post.slug}`,
    })),
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
      <PageMeta
        title="Blog"
        description="Thoughts and insights from UncommonStash"
        jsonLd={jsonLd}
      />
      <h1 className="text-4xl font-bold tracking-tight">Blog</h1>
      <div className="grid grid-cols-1 gap-6">
        {posts.map((post) => (
          <Link to={`/blog/${post.slug}`} key={post.slug}>
            <Card className="hover:bg-muted/50 transition-colors h-full">
              <CardHeader>
                <div className="flex justify-between items-start mb-2">
                  <CardTitle className="text-2xl">{post.title}</CardTitle>
                  <span className="text-sm text-muted-foreground whitespace-nowrap ml-4">
                    {post.datePublished}
                  </span>
                </div>
                <CardDescription className="text-lg mt-2">
                  {post.description}
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
