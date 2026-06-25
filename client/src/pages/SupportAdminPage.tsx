import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

type Ticket = {
  id: string;
  name: string;
  email: string;
  subject: string;
  status: string;
  updatedAt: string;
};

export default function SupportAdminPage() {
  const [token, setToken] = useState(localStorage.getItem('admin_token') || '');
  const [password, setPassword] = useState('');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [error, setError] = useState('');

  // active ticket view
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [activeTicket, setActiveTicket] = useState<any>(null);
  const [reply, setReply] = useState('');

  const fetchTickets = async (authToken: string) => {
    try {
      const res = await api('/api/support/admin/tickets', {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      if (!res.ok) throw new Error('Invalid token');
      const data = await res.json();
      setTickets(data);
    } catch (err) {
      setToken('');
      localStorage.removeItem('admin_token');
    }
  };

  useEffect(() => {
    if (token) fetchTickets(token);
  }, [token]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api('/api/support/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      if (!res.ok) throw new Error('Invalid password');
      const data = await res.json();
      setToken(data.token);
      localStorage.setItem('admin_token', data.token);
      setError('');
    } catch (err) {
      setError('Invalid password');
    }
  };

  const loadTicket = async (id: string) => {
    const t = tickets.find(x => x.id === id);
    setActiveTicket(t);
    setActiveTicketId(id);
  };

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reply.trim() || !activeTicketId) return;

    try {
      await api(`/api/support/admin/tickets/${activeTicketId}/reply`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ content: reply })
      });
      setReply('');
      fetchTickets(token); // refresh
      // reload active
      const res = await api('/api/support/admin/tickets', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setTickets(data);
      setActiveTicket(data.find((x: any) => x.id === activeTicketId));
    } catch (err) {
      alert('Failed to reply');
    }
  };

  const setStatus = async (id: string, status: string) => {
    await api(`/api/support/admin/tickets/${id}/status`, {
      method: 'PATCH',
      headers: { 
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ status })
    });
    fetchTickets(token);
    if (activeTicketId === id) {
      setActiveTicket({ ...activeTicket, status });
    }
  };

  const deleteTicket = async (id: string) => {
    if (!confirm('Are you sure?')) return;
    await api(`/api/support/admin/tickets/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (activeTicketId === id) {
      setActiveTicket(null);
      setActiveTicketId(null);
    }
    fetchTickets(token);
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-softspace-950 flex items-center justify-center">
        <form onSubmit={handleLogin} className="bg-[#111116] p-8 rounded-2xl border border-softspace-800 w-full max-w-sm">
          <h2 className="text-2xl font-bold text-white mb-6 text-center">Admin Login</h2>
          {error && <p className="text-red-500 mb-4 text-center text-sm">{error}</p>}
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full bg-softspace-900 border border-softspace-700 rounded-xl px-4 py-3 text-white mb-4 focus:outline-none"
            placeholder="Admin Password"
          />
          <button type="submit" className="w-full bg-[#3ae0ff] text-black font-bold py-3 rounded-xl">Login</button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-softspace-950 text-white flex">
      {/* Sidebar */}
      <div className="w-80 bg-[#111116] border-r border-softspace-800 flex flex-col h-screen">
        <div className="p-4 border-b border-softspace-800 font-bold text-lg flex justify-between items-center">
          <span>Tickets</span>
          <button onClick={() => { setToken(''); localStorage.removeItem('admin_token'); }} className="text-xs text-softspace-400 hover:text-white">Logout</button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {tickets.map(t => (
            <button
              key={t.id}
              onClick={() => loadTicket(t.id)}
              className={`w-full text-left p-3 rounded-xl transition-colors ${activeTicketId === t.id ? 'bg-softspace-800' : 'hover:bg-softspace-900'}`}
            >
              <div className="flex justify-between items-center mb-1">
                <span className="font-bold truncate text-sm">{t.name}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${t.status === 'OPEN' ? 'bg-green-500/20 text-green-400' : 'bg-softspace-700 text-softspace-300'}`}>
                  {t.status}
                </span>
              </div>
              <div className="text-xs text-softspace-300 truncate">{t.subject}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Main Area */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {activeTicket ? (
          <>
            <div className="p-6 border-b border-softspace-800 bg-[#111116] flex justify-between items-start">
              <div>
                <h1 className="text-2xl font-bold mb-1">{activeTicket.subject}</h1>
                <p className="text-sm text-softspace-400">{activeTicket.name} &lt;{activeTicket.email}&gt; • ID: {activeTicket.id}</p>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => setStatus(activeTicket.id, activeTicket.status === 'OPEN' ? 'RESOLVED' : 'OPEN')}
                  className="px-4 py-2 bg-softspace-800 hover:bg-softspace-700 rounded-lg text-sm font-bold transition-colors"
                >
                  Mark {activeTicket.status === 'OPEN' ? 'Resolved' : 'Open'}
                </button>
                <button 
                  onClick={() => deleteTicket(activeTicket.id)}
                  className="px-4 py-2 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg text-sm font-bold transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {activeTicket.messages.map((msg: any) => (
                <div key={msg.id} className={`flex flex-col ${msg.sender === 'ADMIN' ? 'items-end' : 'items-start'}`}>
                  <div className="text-xs text-softspace-400 mb-1">{msg.sender === 'ADMIN' ? 'You' : activeTicket.name}</div>
                  <div className={`p-4 rounded-xl max-w-2xl whitespace-pre-wrap ${msg.sender === 'ADMIN' ? 'bg-[#3ae0ff]/20 text-[#3ae0ff]' : 'bg-softspace-800'}`}>
                    {msg.content}
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 bg-[#111116] border-t border-softspace-800">
              <form onSubmit={handleReply} className="flex gap-4 max-w-4xl mx-auto">
                <textarea
                  value={reply}
                  onChange={e => setReply(e.target.value)}
                  className="flex-1 bg-softspace-900 border border-softspace-700 rounded-xl p-3 text-white focus:outline-none focus:border-[#3ae0ff]"
                  rows={3}
                  placeholder="Reply to user..."
                />
                <button type="submit" className="bg-[#3ae0ff] text-black font-bold px-6 rounded-xl">Send</button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-softspace-500">
            Select a ticket to view
          </div>
        )}
      </div>
    </div>
  );
}
