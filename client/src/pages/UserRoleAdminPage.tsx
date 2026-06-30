import { useEffect, useMemo, useState } from 'react';
import { LogOut, Save, Search } from 'lucide-react';
import { api, assetUrl } from '../lib/api';
import { useAuthStore } from '../store/useAuthStore';

type AdminUser = {
  id: string;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  systemRole?: string | null;
};

const STORAGE_KEY = 'softspace_role_admin_password';

export default function UserRoleAdminPage() {
  const token = useAuthStore((state) => state.token);
  const [password, setPassword] = useState(localStorage.getItem(STORAGE_KEY) || '');
  const [inputPassword, setInputPassword] = useState(localStorage.getItem(STORAGE_KEY) || '');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [draftRole, setDraftRole] = useState<string>('USER');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const loadUsers = async (adminPassword: string) => {
    if (!token || !adminPassword) return;
    setIsLoading(true);
    try {
      const res = await api('/api/users/badge-admin/users', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ adminPassword }),
      });
      if (!res.ok) {
        throw new Error('bad_password');
      }
      const data = await res.json();
      const nextUsers = Array.isArray(data?.users) ? data.users : [];
      setUsers(nextUsers);
      setSelectedUserId((current) => current ?? nextUsers[0]?.id ?? null);
      setError('');
      localStorage.setItem(STORAGE_KEY, adminPassword);
    } catch (_err) {
      setUsers([]);
      setSelectedUserId(null);
      setPassword('');
      localStorage.removeItem(STORAGE_KEY);
      setError('Falsches Passwort.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (password) {
      loadUsers(password);
    }
  }, [password, token]);

  const filteredUsers = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return users;
    return users.filter((user) => {
      const display = (user.displayName || '').toLowerCase();
      const username = user.username.toLowerCase();
      return display.includes(needle) || username.includes(needle);
    });
  }, [users, search]);

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) ?? null,
    [users, selectedUserId]
  );

  useEffect(() => {
    setDraftRole(selectedUser?.systemRole ?? 'USER');
  }, [selectedUserId, selectedUser?.systemRole]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassword(inputPassword);
  };

  const saveRole = async () => {
    if (!token || !password || !selectedUser) return;
    setIsSaving(true);
    try {
      const res = await api(`/api/users/role-admin/${selectedUser.id}/role`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ adminPassword: password, role: draftRole }),
      });
      if (!res.ok) {
        throw new Error('save_failed');
      }
      const data = await res.json();
      const updatedUser = data?.user;
      setUsers((current) =>
        current.map((user) => (user.id === selectedUser.id ? { ...user, systemRole: updatedUser.systemRole ?? 'USER' } : user))
      );
      setDraftRole(updatedUser.systemRole ?? 'USER');
      setError('');
    } catch (_err) {
      setError('Speichern fehlgeschlagen.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!password) {
    return (
      <div className="h-full min-h-0 flex items-center justify-center bg-softspace-950 p-6">
        <form onSubmit={handleLogin} className="w-full max-w-md rounded-3xl border border-softspace-800 bg-softspace-900 p-8">
          <h1 className="text-2xl font-bold text-softspace-50">User Role Admin</h1>
          <p className="mt-2 text-sm text-softspace-400">Passwort eingeben.</p>
          {error && <p className="mt-4 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>}
          <input
            type="password"
            value={inputPassword}
            onChange={(e) => setInputPassword(e.target.value)}
            placeholder="Passwort"
            className="mt-6 w-full rounded-2xl border border-softspace-700 bg-softspace-950 px-4 py-3 text-softspace-50 outline-none transition-colors focus:border-softspace-500"
          />
          <button
            type="submit"
            className="mt-4 w-full rounded-2xl bg-softspace-500 px-4 py-3 font-bold text-white transition-colors hover:bg-softspace-400"
          >
            Einloggen
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 flex bg-softspace-950 text-softspace-50">
      <aside className="w-[340px] border-r border-softspace-800 bg-softspace-900/70 flex flex-col min-h-0">
        <div className="border-b border-softspace-800 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-lg font-bold">User Role Admin</h1>
              <p className="text-xs text-softspace-400">Rollen verwalten</p>
            </div>
            <button
              type="button"
              onClick={() => {
                localStorage.removeItem(STORAGE_KEY);
                setPassword('');
                setInputPassword('');
                setUsers([]);
                setSelectedUserId(null);
              }}
              className="rounded-xl border border-softspace-700 p-2 text-softspace-300 transition-colors hover:bg-softspace-800 hover:text-softspace-50"
              title="Logout"
            >
              <LogOut size={16} />
            </button>
          </div>
          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-softspace-800 bg-softspace-950 px-3 py-2">
            <Search size={14} className="text-softspace-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="User suchen"
              className="w-full bg-transparent text-sm text-softspace-100 outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {filteredUsers.map((user) => {
            const isActive = user.id === selectedUserId;
            return (
              <button
                key={user.id}
                type="button"
                onClick={() => setSelectedUserId(user.id)}
                className={`mb-2 w-full rounded-2xl border p-3 text-left transition-colors ${
                  isActive
                    ? 'border-softspace-500 bg-softspace-800'
                    : 'border-softspace-800 bg-softspace-900/40 hover:bg-softspace-800/70'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 overflow-hidden rounded-full bg-softspace-800 flex items-center justify-center text-sm font-bold">
                    {user.avatarUrl ? (
                      <img src={assetUrl(user.avatarUrl)} alt={user.username} className="h-full w-full object-cover" />
                    ) : (
                      (user.displayName || user.username).slice(0, 1).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold">{user.displayName || user.username}</div>
                    <div className="truncate text-xs text-softspace-400">@{user.username}</div>
                  </div>
                </div>
                <div className="mt-2 text-xs font-semibold text-softspace-400">
                  Rolle: {user.systemRole || 'USER'}
                </div>
              </button>
            );
          })}
          {!filteredUsers.length && !isLoading && (
            <div className="p-4 text-sm text-softspace-500">Keine User gefunden.</div>
          )}
        </div>
      </aside>

      <main className="flex-1 min-h-0 overflow-y-auto">
        {selectedUser ? (
          <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
            <section className="rounded-3xl border border-softspace-800 bg-softspace-900/70 p-6">
              <div className="flex items-center gap-4">
                <div className="h-20 w-20 overflow-hidden rounded-full bg-softspace-800 flex items-center justify-center text-2xl font-bold">
                  {selectedUser.avatarUrl ? (
                    <img src={assetUrl(selectedUser.avatarUrl)} alt={selectedUser.username} className="h-full w-full object-cover" />
                  ) : (
                    (selectedUser.displayName || selectedUser.username).slice(0, 1).toUpperCase()
                  )}
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-2xl font-bold">{selectedUser.displayName || selectedUser.username}</h2>
                  <p className="text-sm text-softspace-400">@{selectedUser.username}</p>
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-softspace-800 bg-softspace-900/70 p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold">System Rolle</h3>
                  <p className="text-sm text-softspace-400">Passe die Rolle des Users an.</p>
                </div>
                <button
                  type="button"
                  onClick={saveRole}
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 rounded-2xl bg-softspace-500 px-4 py-2 font-bold text-white transition-colors hover:bg-softspace-400 disabled:opacity-60"
                >
                  <Save size={16} />
                  Speichern
                </button>
              </div>

              <div className="mt-5">
                <select
                  value={draftRole}
                  onChange={(e) => setDraftRole(e.target.value)}
                  className="w-full rounded-2xl border border-softspace-700 bg-softspace-950 px-4 py-3 text-softspace-50 outline-none transition-colors focus:border-softspace-500"
                >
                  <option value="USER">USER</option>
                  <option value="MODERATOR">MODERATOR</option>
                  <option value="CEO">CEO</option>
                </select>
              </div>
            </section>

            {error && <div className="rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-softspace-500">Waehle links einen User aus.</div>
        )}
      </main>
    </div>
  );
}
