'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { marked } from 'marked';
import { useAuth } from './AuthProvider';
import { useTheme } from './ThemeProvider';
import BlogEditor from './BlogEditor';

interface BlogData {
  _id: string;
  title: string;
  slug: string;
  date: string;
  category: string;
  tags: string[];
  summary: string;
  content: string;
  published: boolean;
}

export default function BlogPostClient({ slug }: { slug: string }) {
  const { isDevMode } = useAuth();
  const { theme } = useTheme();
  const router = useRouter();
  const [blog, setBlog] = useState<BlogData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const fetchBlog = async () => {
      const res = await fetch(`/api/blogs/${slug}`);
      if (res.ok) {
        setBlog(await res.json());
      } else {
        setNotFound(true);
      }
      setLoading(false);
    };
    fetchBlog();
  }, [slug]);

  const handleUpdate = async (data: Record<string, unknown>) => {
    await fetch(`/api/blogs/${slug}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    setEditing(false);
    // Re-fetch
    const res = await fetch(`/api/blogs/${slug}`);
    if (res.ok) setBlog(await res.json());
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this post?')) return;
    await fetch(`/api/blogs/${slug}`, { method: 'DELETE' });
    router.push('/blog');
  };

  if (loading) return <p>Loading...</p>;
  if (notFound || !blog) return <p>Blog post not found.</p>;

  const isStaticPost = blog._id.startsWith('static:');

  if (editing && isDevMode && !isStaticPost) {
    return (
      <div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 'bold', marginBottom: '1.5rem' }}>Edit Post</h1>
        <BlogEditor
          initial={blog}
          onSave={handleUpdate}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  const html = marked.parse(blog.content) as string;
  const formattedDate = new Date(blog.date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className={theme === 'studio' ? 'studio-detail studio-article' : undefined}>
      {isDevMode && !isStaticPost && (
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <button onClick={() => setEditing(true)} className="btn-primary" style={{ fontSize: '0.75rem' }}>
            Edit
          </button>
          <button onClick={handleDelete} className="btn-danger" style={{ fontSize: '0.75rem' }}>
            Delete
          </button>
          {!blog.published && (
            <span className="badge" style={{ backgroundColor: '#fbbf24', color: '#000' }}>Draft</span>
          )}
        </div>
      )}

      <div style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
          <span className="badge">{blog.category}</span>
          <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>{formattedDate}</span>
        </div>
        <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
          {blog.tags.map(tag => (
            <span key={tag} className="badge" style={{ fontSize: '0.625rem' }}>{tag}</span>
          ))}
        </div>
      </div>

      <article className="studio-prose" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
