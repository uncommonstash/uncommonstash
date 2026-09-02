import { posts } from "./blog-data";

export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  datePublished: string;
  dateModified: string;
  author: string;
  contentHtml: string;
}

export async function getPost(slug: string): Promise<BlogPost | null> {
  const post = posts.find((p) => p.slug === slug);
  if (!post) {
    return null;
  }
  return post;
}

export async function getPosts(): Promise<BlogPost[]> {
  return posts;
}
