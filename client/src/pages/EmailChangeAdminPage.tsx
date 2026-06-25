import { useState, useEffect } from 'react';
import { apiJson } from '../lib/api';
import { useAuthStore } from '../store/useAuthStore';
import { Lock, Mail, Check, X, Search, User as UserIcon } from 'lucide-react';

interface User {
  id: string;
  username: string;
  displayName: string | null;
  email: string;
  avatarUrl: string | null;
}

interface UsersResponse {
  users: User[];
}

export default function EmailChangeAdminPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const token = useAuthStore(state => state.token);

  useEffect(() => {
    if (authenticated) {
      fetchUsers();
    }
  }, [authenticated]);

  useEffect(() => {
    if (searchQuery) {
      const filtered = users.filter(user =>
        user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.displayName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.email.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredUsers(filtered);
    } else {
      setFilteredUsers(users);
    }
  }, [searchQuery, users]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiJson('/api/users/admin/verify-password', {
        method: 'POST',
        body: { password }
      }, token);
      setAdminPassword(password);
      setAuthenticated(true);
      setPassword('');
      setPasswordError('');
    } catch (err: any) {
      setPasswordError('Falsches Passwort');
    }
  };

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await apiJson<UsersResponse>('/api/users/badge-admin/users', {
        method: 'POST',
        body: { adminPassword }
      }, token);
      setUsers(response.users);
      setFilteredUsers(response.users);
    } catch (err) {
      setError('Fehler beim Laden der User');
    } finally {
      setLoading(false);
    }
  };

  const sendCode = async (userId: string) => {
    try {
      setLoading(true);
      setError('');
      await apiJson(`/api/users/${userId}/email-code`, { method: 'POST' }, token);
      setCodeSent(true);
      setSuccess('Code wurde generiert');
      setTimeout(() => setSuccess(''), 5000);
    } catch (err: any) {
      setError(err.message || 'Fehler beim Senden des Codes');
    } finally {
      setLoading(false);
    }
  };

  const changeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    try {
      setLoading(true);
      setError('');
      await apiJson(`/api/users/${selectedUser.id}/email`, {
        method: 'PATCH',
        body: {
          email: newEmail,
          code: verificationCode,
          adminPassword
        }
      }, token);
      setSuccess('Email erfolgreich geändert');
      setNewEmail('');
      setVerificationCode('');
      setCodeSent(false);
      setSelectedUser(null);
      setTimeout(() => setSuccess(''), 5000);
      fetchUsers();
    } catch (err: any) {
      setError(err.message || 'Fehler beim Ändern der Email');
    } finally {
      setLoading(false);
    }
  };

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-softspace-950 flex items-center justify-center p-4">
        <div className="bg-softspace-900 border border-softspace-800 rounded-2xl p-8 w-full max-w-md">
          <div className="flex items-center justify-center mb-6">
            <Lock className="w-12 h-12 text-[#3ae0ff]" />
          </div>
          <h1 className="text-2xl font-bold text-white text-center mb-2">Admin Login</h1>
          <p className="text-softspace-400 text-center mb-6">Email Change Admin</p>
          <form onSubmit={handleLogin}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Passwort eingeben"
              className="w-full px-4 py-3 rounded-lg bg-softspace-950 border border-softspace-700 text-white placeholder-softspace-500 focus:outline-none focus:border-[#3ae0ff] mb-4"
            />
            {passwordError && (
              <p className="text-red-400 text-sm mb-4">{passwordError}</p>
            )}
            <button
              type="submit"
              className="w-full py-3 bg-[#3ae0ff] hover:bg-[#3ae0ff]/90 text-softspace-950 font-bold rounded-lg transition-colors"
            >
              Einloggen
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-softspace-950 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-white">Email Change Admin</h1>
          <button
            onClick={() => setAuthenticated(false)}
            className="px-4 py-2 bg-softspace-800 text-white rounded-lg hover:bg-softspace-700 transition-colors"
          >
            Logout
          </button>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400 flex items-center gap-2">
            <X className="w-5 h-5" />
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 p-4 bg-green-500/10 border border-green-500/50 rounded-lg text-green-400 flex items-center gap-2">
            <Check className="w-5 h-5" />
            {success}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-softspace-900 border border-softspace-800 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Search className="w-5 h-5 text-softspace-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="User suchen..."
                className="flex-1 px-4 py-2 rounded-lg bg-softspace-950 border border-softspace-700 text-white placeholder-softspace-500 focus:outline-none focus:border-[#3ae0ff]"
              />
            </div>

            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {loading && filteredUsers.length === 0 ? (
                <p className="text-softspace-400 text-center py-8">Laden...</p>
              ) : filteredUsers.length === 0 ? (
                <p className="text-softspace-400 text-center py-8">Keine User gefunden</p>
              ) : (
                filteredUsers.map((user) => (
                  <div
                    key={user.id}
                    onClick={() => setSelectedUser(user)}
                    className={`p-4 rounded-lg cursor-pointer transition-colors ${
                      selectedUser?.id === user.id
                        ? 'bg-[#3ae0ff]/20 border-2 border-[#3ae0ff]'
                        : 'bg-softspace-950 border border-softspace-700 hover:bg-softspace-800'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {user.avatarUrl ? (
                        <img
                          src={user.avatarUrl}
                          alt={user.username}
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-softspace-700 flex items-center justify-center text-white font-bold">
                          {user.username.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-semibold truncate">
                          {user.displayName || user.username}
                        </p>
                        <p className="text-softspace-400 text-sm truncate">@{user.username}</p>
                        <p className="text-softspace-500 text-xs truncate">{user.email}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {selectedUser ? (
            <div className="bg-softspace-900 border border-softspace-800 rounded-2xl p-6">
              <h2 className="text-xl font-bold text-white mb-4">Email ändern für {selectedUser.username}</h2>

              <div className="flex items-center gap-3 mb-6 p-4 bg-softspace-950 rounded-lg">
                {selectedUser.avatarUrl ? (
                  <img
                    src={selectedUser.avatarUrl}
                    alt={selectedUser.username}
                    className="w-12 h-12 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-softspace-700 flex items-center justify-center text-white font-bold">
                    {selectedUser.username.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="text-white font-semibold">{selectedUser.displayName || selectedUser.username}</p>
                  <p className="text-softspace-400 text-sm">{selectedUser.email}</p>
                </div>
              </div>

              {!codeSent ? (
                <button
                  onClick={() => sendCode(selectedUser.id)}
                  disabled={loading}
                  className="w-full py-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 mb-4"
                >
                  <Mail className="w-5 h-5" />
                  {loading ? 'Wird generiert...' : 'Code generieren'}
                </button>
              ) : (
                <div className="mb-4 p-4 bg-green-500/10 border border-green-500/50 rounded-lg text-green-400 text-sm">
                  Code wurde generiert. Der User muss dir den Code aus dem Ticket sagen.
                </div>
              )}

              <form onSubmit={changeEmail}>
                <div className="mb-4">
                  <label className="block text-softspace-300 text-sm mb-2">Neue Email</label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="neue@email.com"
                    required
                    className="w-full px-4 py-3 rounded-lg bg-softspace-950 border border-softspace-700 text-white placeholder-softspace-500 focus:outline-none focus:border-[#3ae0ff]"
                  />
                </div>

                <div className="mb-4">
                  <label className="block text-softspace-300 text-sm mb-2">Verification Code (vom User)</label>
                  <input
                    type="text"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value)}
                    placeholder="123456"
                    required
                    className="w-full px-4 py-3 rounded-lg bg-softspace-950 border border-softspace-700 text-white placeholder-softspace-500 focus:outline-none focus:border-[#3ae0ff]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || !codeSent}
                  className="w-full py-3 bg-[#3ae0ff] hover:bg-[#3ae0ff]/90 text-softspace-950 font-bold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Wird geändert...' : 'Email ändern'}
                </button>
              </form>
            </div>
          ) : (
            <div className="bg-softspace-900 border border-softspace-800 rounded-2xl p-6 flex flex-col items-center justify-center text-center">
              <UserIcon className="w-16 h-16 text-softspace-700 mb-4" />
              <p className="text-softspace-400">Wähle einen User aus der Liste um seine Email zu ändern</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
