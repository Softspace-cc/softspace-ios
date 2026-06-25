import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.strato.de',
  port: Number(process.env.SMTP_PORT) || 465,
  secure: process.env.SMTP_SECURE === 'false' ? false : true, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER || 'no-reply@softspace.cc',
    pass: process.env.SMTP_PASS || '',
  },
});

export async function sendEmail({ to, subject, text, html, replyTo }) {
  if (!process.env.SMTP_PASS) {
    console.warn('[Mailer] SMTP_PASS not set in .env. Falling back to console log.');
    console.log(`\n=== EMAIL TO: ${to} ===\nSubject: ${subject}\nReply-To: ${replyTo}\n\n${text}\n========================\n`);
    return;
  }

  try {
    const info = await transporter.sendMail({
      from: `"Softspace" <${process.env.SMTP_USER || 'no-reply@softspace.cc'}>`,
      to,
      replyTo,
      subject,
      text,
      html,
    });
    console.log(`[Mailer] Message sent: ${info.messageId}`);
  } catch (error) {
    console.error('[Mailer] Failed to send email:', error);
    throw error;
  }
}
