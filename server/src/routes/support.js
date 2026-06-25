import express from 'express';
import { sendEmail } from '../lib/mailer.js';
import prisma from '../lib/prisma.js';
import jwt from 'jsonwebtoken';

const router = express.Router();

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'J4m!e2025#Go';
const ADMIN_JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-admin-tickets-8923749823';

// 1. User submits a ticket
router.post('/ticket', async (req, res, next) => {
  try {
    const { name, email, subject, message } = req.body;
    if (!name || !email || !subject || !message) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const ticket = await prisma.ticket.create({
      data: {
        name,
        email,
        subject,
        messages: {
          create: {
            sender: 'USER',
            content: message
          }
        }
      }
    });

    const ticketLink = `${process.env.CLIENT_ORIGIN || 'https://softspace.cc'}/support/ticket/${ticket.id}`;

    const htmlContent = `
      <h2>Support Ticket Created</h2>
      <p>Hi ${name},</p>
      <p>We have received your support ticket regarding "<strong>${subject}</strong>".</p>
      <p>You can view your ticket and our replies at any time by visiting this link:</p>
      <p><a href="${ticketLink}">${ticketLink}</a></p>
      <hr />
      <p><em>Please do not reply directly to this email. Use the link above to respond.</em></p>
    `;

    if (process.env.SMTP_PASS) {
      await sendEmail({
        to: email,
        subject: `[Softspace Support] ${subject}`,
        text: `Hi ${name},\n\nWe have received your support ticket: "${subject}".\n\nView and reply here: ${ticketLink}\n\nDo not reply directly to this email.`,
        html: htmlContent,
      });
    }

    res.json({ success: true, ticketId: ticket.id });
  } catch (error) {
    next(error);
  }
});

// 2. Get ticket by ID (User View)
router.get('/ticket/:id', async (req, res, next) => {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: req.params.id },
      include: {
        messages: { orderBy: { createdAt: 'asc' } }
      }
    });
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    res.json(ticket);
  } catch (error) {
    next(error);
  }
});

// 3. User replies to a ticket
router.post('/ticket/:id/reply', async (req, res, next) => {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'Content required' });

    const ticket = await prisma.ticket.findUnique({ where: { id: req.params.id } });
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    const msg = await prisma.ticketMessage.create({
      data: {
        ticketId: ticket.id,
        sender: 'USER',
        content
      }
    });

    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { updatedAt: new Date() }
    });

    res.json(msg);
  } catch (error) {
    next(error);
  }
});

// ADMIN ROUTES

router.post('/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    const token = jwt.sign({ role: 'ADMIN' }, ADMIN_JWT_SECRET, { expiresIn: '7d' });
    res.json({ token });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

const requireAdmin = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, ADMIN_JWT_SECRET);
    if (decoded.role !== 'ADMIN') throw new Error('Not admin');
    next();
  } catch (e) {
    res.status(401).json({ error: 'Unauthorized' });
  }
};

router.get('/admin/tickets', requireAdmin, async (req, res, next) => {
  try {
    const tickets = await prisma.ticket.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: { orderBy: { createdAt: 'asc' } }
      }
    });
    res.json(tickets);
  } catch (error) {
    next(error);
  }
});

router.post('/admin/tickets/:id/reply', requireAdmin, async (req, res, next) => {
  try {
    const { content } = req.body;
    const ticket = await prisma.ticket.findUnique({ where: { id: req.params.id } });
    if (!ticket) return res.status(404).json({ error: 'Not found' });

    const msg = await prisma.ticketMessage.create({
      data: {
        ticketId: ticket.id,
        sender: 'ADMIN',
        content
      }
    });

    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { updatedAt: new Date(), status: 'OPEN' } // Keep it open if admin replies
    });

    const ticketLink = `${process.env.CLIENT_ORIGIN || 'https://softspace.cc'}/support/ticket/${ticket.id}`;
    if (process.env.SMTP_PASS) {
      await sendEmail({
        to: ticket.email,
        subject: `Re: [Softspace Support] ${ticket.subject}`,
        text: `Hi ${ticket.name},\n\nAn admin has replied to your ticket.\n\nReply:\n${content}\n\nView the full ticket here: ${ticketLink}`,
        html: `
          <p>Hi ${ticket.name},</p>
          <p>An admin has replied to your ticket:</p>
          <blockquote style="border-left: 3px solid #ccc; padding-left: 10px; white-space: pre-wrap;">${content}</blockquote>
          <p>You can view the full conversation and reply here:</p>
          <p><a href="${ticketLink}">${ticketLink}</a></p>
        `
      });
    }

    res.json(msg);
  } catch (error) {
    next(error);
  }
});

router.patch('/admin/tickets/:id/status', requireAdmin, async (req, res, next) => {
  try {
    const { status } = req.body;
    const ticket = await prisma.ticket.update({
      where: { id: req.params.id },
      data: { status }
    });
    res.json(ticket);
  } catch (error) {
    next(error);
  }
});

router.delete('/admin/tickets/:id', requireAdmin, async (req, res, next) => {
  try {
    await prisma.ticket.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
