import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Heart, Send, Loader2, Mail } from 'lucide-react';
import { apiJson } from '../lib/api';
import { useAuthStore } from '../store/useAuthStore';

type TicketMsg = {
  id: string;
  sender: 'USER' | 'ADMIN';
  content: string;
  createdAt: string;
};

type Ticket = {
  id: string;
  name: string;
  subject: string;
  status: string;
  messages: TicketMsg[];
};

export default function SupportTicketPage() {
  const { id } = useParams<{ id: string }>();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [error, setError] = useState('');
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [codeSending, setCodeSending] = useState(false);
  const [emailCodeError, setEmailCodeError] = useState('');
  const [emailCode, setEmailCode] = useState('');

  const bottomRef = useRef<HTMLDivElement>(null);
  const user = useAuthStore(state => state.user);
  const token = useAuthStore(state => state.token);

  useEffect(() => {
    const fetchTicket = async () => {
      try {
        const data = await apiJson<{ id: string; name: string; subject: string; status: string; messages: TicketMsg[] }>(`/api/support/ticket/${id}`, {}, token);
        setTicket(data);
      } catch (err) {
        setError('Ticket not found or you do not have permission.');
      }
    };
    fetchTicket();
  }, [id, token]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [ticket?.messages]);

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reply.trim()) return;

    setSending(true);
    try {
      const msg = await apiJson<TicketMsg>(`/api/support/ticket/${id}/reply`, {
        method: 'POST',
        body: { content: reply }
      }, token);

      setTicket(prev => prev ? {
        ...prev,
        messages: [...prev.messages, msg]
      } : null);
      setReply('');
    } catch (err) {
      alert('Failed to send reply');
    } finally {
      setSending(false);
    }
  };

  const requestEmailCode = async () => {
    if (!user) return;

    setCodeSending(true);
    setEmailCodeError('');
    try {
      const response = await apiJson<{ ok: boolean; code: string; message: string }>(`/api/users/${user.id}/email-code`, { method: 'POST' }, token);
      setEmailCode(response.code);
      setCodeSent(true);
      setTimeout(() => setCodeSent(false), 30000);
    } catch (err: any) {
      setEmailCodeError(err.message || 'Fehler beim Senden des Codes');
    } finally {
      setCodeSending(false);
    }
  };

  if (error) {
    return (
      <div className="min-h-screen bg-softspace-950 flex flex-col items-center justify-center text-white">
        <h1 className="text-2xl font-bold text-red-500 mb-2">Error</h1>
        <p>{error}</p>
        <Link to="/" className="mt-6 text-[#3ae0ff] hover:underline">Go Home</Link>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="min-h-screen bg-softspace-950 flex items-center justify-center text-white">
        <Loader2 className="animate-spin text-softspace-500" size={32} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-softspace-950 text-softspace-50 flex flex-col">
      <nav className="w-full border-b border-softspace-800 bg-[#111116] sticky top-0 z-10">
        <div className="flex items-center justify-between px-6 py-4 max-w-4xl mx-auto w-full">
          <Link to="/" className="flex items-center gap-2">
            <Heart className="text-white" size={24} fill="currentColor" />
            <span className="text-xl font-bold tracking-tight text-white">Softspace Support</span>
          </Link>
          <div className="text-sm">
            Status: <span className={`font-bold ${ticket.status === 'OPEN' ? 'text-green-400' : 'text-softspace-400'}`}>{ticket.status}</span>
          </div>
        </div>
      </nav>

      <main className="flex-1 w-full max-w-4xl mx-auto px-6 py-8 flex flex-col">
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-white mb-2">{ticket.subject}</h1>
          <p className="text-softspace-400 text-sm">Ticket ID: {ticket.id}</p>
        </div>

        <div className="flex-1 space-y-6 mb-8 overflow-y-auto pr-2">
          {ticket.messages.map((msg) => {
            const isAdmin = msg.sender === 'ADMIN';
            return (
              <div key={msg.id} className={`flex flex-col ${isAdmin ? 'items-start' : 'items-end'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold text-softspace-300">
                    {isAdmin ? 'Softspace Support' : ticket.name}
                  </span>
                  <span className="text-xs text-softspace-500">
                    {new Date(msg.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className={`p-4 rounded-2xl max-w-[85%] whitespace-pre-wrap ${isAdmin ? 'bg-softspace-800 text-white rounded-tl-none' : 'bg-[#3ae0ff]/20 text-[#3ae0ff] rounded-tr-none'}`}>
                  {msg.content}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {ticket.status === 'OPEN' ? (
          <div className="mt-auto space-y-3">
            {user && (
              <div className="bg-[#111116] border border-softspace-800 p-4 rounded-2xl">
                <button
                  onClick={requestEmailCode}
                  disabled={codeSending || codeSent}
                  className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-semibold px-6 py-3 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {codeSending ? <Loader2 className="animate-spin" size={20} /> : <Mail size={20} />}
                  {codeSent ? 'Code generiert (30 Minuten gültig)' : 'Email-Change-Code generieren'}
                </button>
                {emailCodeError && (
                  <p className="text-red-400 text-sm mt-2">{emailCodeError}</p>
                )}
                {codeSent && emailCode && (
                  <div className="mt-3 bg-green-500/20 border border-green-500/50 rounded-xl p-4 text-center">
                    <p className="text-green-200 text-sm mb-2">Dein Verification Code:</p>
                    <p className="text-3xl font-mono font-bold text-white tracking-widest">{emailCode}</p>
                    <p className="text-green-200 text-xs mt-2">Gib diesen Code dem Admin, damit er deine Email ändern kann.</p>
                  </div>
                )}
              </div>
            )}
            <form onSubmit={handleReply} className="bg-[#111116] border border-softspace-800 p-4 rounded-2xl flex gap-3">
              <textarea
                value={reply}
                onChange={e => setReply(e.target.value)}
                placeholder="Type your reply..."
                className="flex-1 bg-softspace-900 border border-softspace-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#3ae0ff] resize-none"
                rows={2}
              />
              <button
                type="submit"
                disabled={sending || !reply.trim()}
                className="bg-softspace-100 hover:bg-white text-softspace-950 font-bold px-6 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center"
              >
                {sending ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
              </button>
            </form>
          </div>
        ) : (
          <div className="mt-auto bg-softspace-900 border border-softspace-800 p-4 rounded-2xl text-center text-softspace-400">
            This ticket has been marked as resolved.
          </div>
        )}
      </main>
    </div>
  );
}
