import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { marked } from 'marked';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const postsDirectory = path.join(__dirname, '../content/blog');
const outputFile = path.join(__dirname, '../src/lib/blog-data.ts');

function getPostSlugs() {
  if (!fs.existsSync(postsDirectory)) {
    console.error(`Error: Posts directory not found at ${postsDirectory}`);
    process.exit(1);
  }
  const files = fs.readdirSync(postsDirectory);
  console.log(`Found ${files.length} files in ${postsDirectory}`);
  return files;
}

function validateFrontmatter(fullPath, data) {
  for (const field of ["title", "description", "datePublished"]) {
    const value = data[field];
    if (typeof value !== "string" || value.trim().length === 0) {
      console.error(
        `Error: Post ${fullPath} is missing required frontmatter "${field}" (must be a non-empty string).`,
      );
      process.exit(1);
    }
  }
}

async function getPostBySlug(slug) {
  const realSlug = slug.replace(/\.md$/, "");
  const fullPath = path.join(postsDirectory, `${realSlug}.md`);

  if (!fs.existsSync(fullPath)) {
      console.error(`Error: Post file not found: ${fullPath}`);
      process.exit(1);
  }

  const fileContents = fs.readFileSync(fullPath, "utf8");
  const { data, content } = matter(fileContents);

  validateFrontmatter(fullPath, data);

  const contentHtml = await marked(content);

  // Map frontmatter to BlogPost interface
  return {
    slug: realSlug,
    title: data.title,
    description: data.description,
    datePublished: data.datePublished,
    dateModified: data.dateModified || "",
    author: data.author || "Shukant Pal",
    contentHtml,
  };
}

async function getAllPosts() {
  const slugs = getPostSlugs();
  const posts = await Promise.all(
    slugs
      .filter((slug) => slug.endsWith(".md"))
      .map((slug) => getPostBySlug(slug))
  );

  return posts
    .filter(post => post !== null)
    .sort((post1, post2) => (post1.datePublished > post2.datePublished ? -1 : 1));
}

async function run() {
    try {
        console.log(`Generating blog data from ${postsDirectory} to ${outputFile}...`);
        const posts = await getAllPosts();

        if (posts.length === 0) {
             console.error("Error: No posts were generated. Check if content/blog has .md files.");
             process.exit(1);
        }

        const fileContent = `export const posts = ${JSON.stringify(posts, null, 2)};`;

        fs.writeFileSync(outputFile, fileContent);
        console.log(`Generated ${outputFile} with ${posts.length} posts.`);
    } catch (error) {
        console.error('Error generating blog data:', error);
        process.exit(1);
    }
}

run();
