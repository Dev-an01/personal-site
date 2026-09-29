import fs from 'fs';
import path from 'path';

export interface StaticBlog {
  _id: string;
  title: string;
  slug: string;
  date: string;
  category: 'AI' | 'System-Design';
  tags: string[];
  summary: string;
  content: string;
  published: true;
}

const MOVIE_RAG_PATH = path.join(
  process.cwd(),
  'content/blogs/building-a-movie-rag-search-engine.md',
);

const MINI_REDIS_PATH = path.join(
  process.cwd(),
  'content/blogs/building-a-redis-like-server.md',
);

export function getStaticBlogs(): StaticBlog[] {
  return [
    {
      _id: 'static:building-a-redis-like-server',
      title: 'Building a Redis-like Server from First Principles',
      slug: 'building-a-redis-like-server-from-first-principles',
      date: '2026-09-29T00:00:00.000Z',
      category: 'System-Design',
      tags: ['C++', 'event loop', 'data structures', 'Redis'],
      summary: 'How I built a Redis-like C++ server layer by layer: framed protocol, poll() event loop, incremental rehashing, AVL-backed sorted sets, heap-driven TTLs, and a thread pool.',
      content: fs.readFileSync(MINI_REDIS_PATH, 'utf-8'),
      published: true,
    },
    {
      _id: 'static:building-a-movie-rag-search-engine',
      title: 'Building a Movie RAG Search Engine from First Principles',
      slug: 'building-a-movie-rag-search-engine-from-first-principles',
      date: '2026-09-17T00:00:00.000Z',
      category: 'AI',
      tags: ['RAG', 'retrieval', 'BM25', 'embeddings'],
      summary: 'How I built lexical, semantic, hybrid, reranked, and grounded movie search over 5,000 records without hiding the retrieval path behind a framework.',
      content: fs.readFileSync(MOVIE_RAG_PATH, 'utf-8'),
      published: true,
    },
  ];
}

export function getStaticBlogBySlug(slug: string): StaticBlog | undefined {
  return getStaticBlogs().find(blog => blog.slug === slug);
}
