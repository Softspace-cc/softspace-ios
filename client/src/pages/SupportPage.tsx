import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Heart, ArrowLeft, Send, CheckCircle2, AlertCircle } from 'lucide-react';
import { api } from '../lib/api';

export default function SupportPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !subject || !message) return;

    setStatus('loading');
    try {
      const res = await api('/api/support/ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, subject, message })
      });

      if (!res.ok) throw new Error('Failed to send ticket');

      setStatus('success');
      setName('');
      setEmail('');
      setSubject('');
      setMessage('');
    } catch (err) {
      console.error(err);
      setStatus('error');
    }
  };

  return (
    <div className="min-h-screen bg-softspace-950 text-softspace-50 flex flex-col selection:bg-softspace-500/30 selection:text-softspace-100">
      {/* Header */}
      <nav className="w-full border-b border-softspace-800 bg-[#111116]">
        <div className="flex items-center px-6 py-4 max-w-4xl mx-auto w-full">
          <button 
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 mr-4 text-softspace-400 hover:text-white hover:bg-softspace-800 rounded-lg transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <Link to="/" className="flex items-center gap-2">
            <Heart className="text-white" size={24} fill="currentColor" />
            <span className="text-xl font-bold tracking-tight text-white">{t('app_name')}</span>
          </Link>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-2xl mx-auto px-6 py-12">
        <h1 className="text-4xl font-extrabold text-white mb-4">Contact Support</h1>
        <p className="text-softspace-300 text-lg mb-8">
          Need help? Found a bug? Just want to say hi? Open a ticket below and we'll get back to you via email.
        </p>

        {status === 'success' && (
          <div className="bg-green-500/10 border border-green-500/50 text-green-400 p-4 rounded-xl flex items-start gap-3 mb-8">
            <CheckCircle2 className="shrink-0 mt-0.5" size={20} />
            <div>
              <h3 className="font-bold mb-1">Ticket created successfully!</h3>
              <p className="text-sm opacity-90">Please check your email for the link to view your ticket and our replies.</p>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-4 rounded-xl flex items-center gap-3 mb-8">
            <AlertCircle className="shrink-0" size={20} />
            <p className="font-medium text-sm">Failed to send ticket. Please try again later.</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5 bg-[#111116] border border-softspace-800 p-6 sm:p-8 rounded-2xl shadow-xl">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-bold text-softspace-300 mb-1.5">Your Name</label>
              <input 
                type="text" 
                required
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full bg-softspace-900 border border-softspace-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#3ae0ff] focus:ring-1 focus:ring-[#3ae0ff] transition-all"
                placeholder="How should we call you?"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-softspace-300 mb-1.5">Email Address</label>
              <input 
                type="email" 
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-softspace-900 border border-softspace-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#3ae0ff] focus:ring-1 focus:ring-[#3ae0ff] transition-all"
                placeholder="Where should we reply?"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-softspace-300 mb-1.5">Subject</label>
            <input 
              type="text" 
              required
              value={subject}
              onChange={e => setSubject(e.target.value)}
              className="w-full bg-softspace-900 border border-softspace-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#3ae0ff] focus:ring-1 focus:ring-[#3ae0ff] transition-all"
              placeholder="What's this about?"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-softspace-300 mb-1.5">Message</label>
            <textarea 
              required
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={6}
              className="w-full bg-softspace-900 border border-softspace-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#3ae0ff] focus:ring-1 focus:ring-[#3ae0ff] transition-all resize-y"
              placeholder="Describe your issue or question in detail..."
            />
          </div>

          <button
            type="submit"
            disabled={status === 'loading'}
            className="w-full bg-softspace-100 hover:bg-white text-softspace-950 font-bold py-3.5 px-4 rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === 'loading' ? (
              <span className="w-5 h-5 border-2 border-softspace-900 border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Send size={18} />
                <span>Submit Ticket</span>
              </>
            )}
          </button>
        </form>
      </main>

      {/* Footer */}
      <footer className="bg-[#111116] border-t border-softspace-800 mt-auto py-8 text-center text-softspace-400 text-sm">
        <p>© {new Date().getFullYear()} Softspace. Built for the community.</p>
      </footer>
    </div>
  );
}
