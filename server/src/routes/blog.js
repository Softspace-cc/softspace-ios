import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { httpError } from '../lib/errors.js';
import { z } from 'zod';

const router = Router();
const BLOG_ADMIN_PASSWORD = 'J4m!e2025#Go';

const blogPostSchema = z.object({
  title: z.string().min(1).max(255),
  content: z.string().min(1),
  imageUrl: z.string().optional().nullable(),
});

function requireBlogAdmin(req) {
  const password = req.headers['x-blog-admin-password'];
  if (password !== BLOG_ADMIN_PASSWORD) {
    throw httpError(401, 'invalid_blog_admin_password');
  }
}

router.get('/', async (req, res, next) => {
  try {
    const posts = await prisma.blogPost.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json({ posts });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const post = await prisma.blogPost.findUnique({
      where: { id: req.params.id },
    });
    if (!post) throw httpError(404, 'post_not_found');
    res.json({ post });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    requireBlogAdmin(req);
    const data = blogPostSchema.parse(req.body);
    const post = await prisma.blogPost.create({
      data: {
        title: data.title,
        content: data.content,
        imageUrl: data.imageUrl || null,
      },
    });
    res.status(201).json({ post });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    requireBlogAdmin(req);
    const data = blogPostSchema.parse(req.body);
    const post = await prisma.blogPost.update({
      where: { id: req.params.id },
      data: {
        title: data.title,
        content: data.content,
        imageUrl: data.imageUrl || null,
      },
    });
    res.json({ post });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    requireBlogAdmin(req);
    await prisma.blogPost.delete({
      where: { id: req.params.id },
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
