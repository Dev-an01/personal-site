import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Blog from '@/models/Blog';
import { verifyToken } from '@/lib/auth';
import { getStaticBlogs } from '@/lib/staticBlogs';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');
  const tag = searchParams.get('tag');
  const sort = searchParams.get('sort') || 'date';
  const order = searchParams.get('order') === 'asc' ? 1 : -1;
  const staticBlogs = getStaticBlogs()
    .filter(blog => !category || blog.category === category)
    .filter(blog => !tag || blog.tags.includes(tag))
    .map(({ content: _content, ...summary }) => summary);

  try {
    await connectDB();

    const token = request.cookies.get('dev_token')?.value;
    const isAuth = token ? verifyToken(token) : false;

    const filter: Record<string, unknown> = {};
    if (!isAuth) filter.published = true;
    if (category) filter.category = category;
    if (tag) filter.tags = tag;

    const databaseBlogs = await Blog.find(filter)
      .select('title slug date category tags summary published')
      .sort({ [sort]: order })
      .lean();
    const staticSlugs = new Set(staticBlogs.map(blog => blog.slug));
    const blogs = [
      ...staticBlogs,
      ...databaseBlogs.filter(blog => !staticSlugs.has(blog.slug)),
    ].sort((a, b) => {
      const comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
      return comparison * order;
    });
    return NextResponse.json(blogs);
  } catch (error) {
    console.error('Failed to fetch blogs:', error);
    return NextResponse.json(staticBlogs);
  }
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get('dev_token')?.value;
  if (!token || !verifyToken(token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await connectDB();
  const body = await request.json();

  // Generate slug from title if not provided
  if (!body.slug && body.title) {
    body.slug = body.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  const blog = await Blog.create(body);
  return NextResponse.json(blog, { status: 201 });
}
