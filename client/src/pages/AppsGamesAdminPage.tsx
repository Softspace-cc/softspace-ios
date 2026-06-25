import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { useAuthStore } from '../store/useAuthStore';
import { Save, Plus, Trash2, Gamepad2, AppWindow } from 'lucide-react';
import type { PresenceRule } from '../lib/presenceApps';

const STORAGE_KEY = 'softspace_badge_admin_password';

export default function AppsGamesAdminPage() {
  const { t } = useTranslation();
  const token = useAuthStore(state => state.token);
  const [password, setPassword] = useState(localStorage.getItem(STORAGE_KEY) || '');
  const [inputPassword, setInputPassword] = useState(localStorage.getItem(STORAGE_KEY) || '');
  const [rules, setRules] = useState<PresenceRule[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const loadRules = async (adminPassword: string) => {
    if (!token || !adminPassword) return;
    setIsLoading(true);
    try {
      const res = await api('/api/users/badge-admin/presence-apps', {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-badge-admin-password': adminPassword,
        },
      });
      if (!res.ok) throw new Error('bad_password');
      const data = await res.json();
      setRules(data.rules || []);
      setError('');
      localStorage.setItem(STORAGE_KEY, adminPassword);
    } catch (_err) {
      setRules([]);
      setPassword('');
      localStorage.removeItem(STORAGE_KEY);
      setError(t('presence_admin_wrong_password'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (password) loadRules(password);
  }, [password, token]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassword(inputPassword);
  };

  const handleSave = async () => {
    if (!token || !password) return;
    setIsSaving(true);
    try {
      const res = await api('/api/users/badge-admin/presence-apps', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'x-badge-admin-password': password,
        },
        body: JSON.stringify({ rules })
      });
      if (!res.ok) throw new Error('save_failed');
      setError('');
      alert(t('presence_admin_saved'));
    } catch (_err) {
      setError(t('presence_admin_save_failed'));
    } finally {
      setIsSaving(false);
    }
  };

  const addRule = () => {
    setRules([...rules, { processName: 'NewApp.exe', displayName: 'New App', type: 'APP', showTitle: false }]);
  };

  const updateRule = (index: number, updates: Partial<PresenceRule>) => {
    const newRules = [...rules];
    newRules[index] = { ...newRules[index], ...updates };
    setRules(newRules);
  };

  const removeRule = (index: number) => {
    const newRules = [...rules];
    newRules.splice(index, 1);
    setRules(newRules);
  };

  if (!password) {
    return (
      <div className="h-full min-h-screen flex items-center justify-center bg-softspace-950 p-6 text-softspace-50">
        <form onSubmit={handleLogin} className="w-full max-w-md rounded-3xl border border-softspace-800 bg-softspace-900 p-8">
          <h1 className="text-2xl font-bold text-softspace-50">{t('presence_admin_title')}</h1>
          <p className="mt-2 text-sm text-softspace-400">{t('presence_admin_login_hint')}</p>
          {error && <p className="mt-4 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>}
          <input
            type="password"
            value={inputPassword}
            onChange={(e) => setInputPassword(e.target.value)}
            placeholder={t('password')}
            className="mt-6 w-full rounded-2xl border border-softspace-700 bg-softspace-950 px-4 py-3 text-softspace-50 outline-none transition-colors focus:border-softspace-500"
          />
          <button
            type="submit"
            className="mt-4 w-full rounded-2xl bg-softspace-500 px-4 py-3 font-bold text-white transition-colors hover:bg-softspace-400"
          >
            {t('login')}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="h-full min-h-screen bg-softspace-950 text-softspace-50 p-8 overflow-y-auto">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">{t('presence_admin_dashboard_title')}</h1>
            <p className="text-softspace-400 mt-2">{t('presence_admin_dashboard_subtitle')}</p>
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => { localStorage.removeItem(STORAGE_KEY); setPassword(''); }}
              className="px-4 py-2 border border-softspace-700 rounded-xl hover:bg-softspace-800 transition-colors"
            >
              {t('logout')}
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 bg-softspace-500 hover:bg-softspace-400 text-white px-6 py-2 rounded-xl font-bold transition-colors disabled:opacity-50"
            >
              <Save size={18} />
              {isSaving ? t('saving') : t('save')}
            </button>
          </div>
        </div>

        {error && <div className="mb-6 rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

        <div className="bg-softspace-900 border border-softspace-800 rounded-3xl p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold">{t('presence_admin_detected_processes')}</h2>
            <button onClick={addRule} className="flex items-center gap-2 bg-softspace-800 hover:bg-softspace-700 px-4 py-2 rounded-xl transition-colors text-sm font-bold">
              <Plus size={16} /> {t('presence_admin_add_rule')}
            </button>
          </div>

          {isLoading ? (
            <div className="text-center py-12 text-softspace-500">{t('presence_admin_loading_rules')}</div>
          ) : (
            <div className="space-y-4">
              {rules.map((rule, idx) => (
                <div key={idx} className="flex flex-wrap md:flex-nowrap gap-4 items-start bg-softspace-950 border border-softspace-800 p-4 rounded-2xl">
                  <div className="flex-1 min-w-[200px]">
                    <label className="block text-xs font-bold text-softspace-400 uppercase tracking-wider mb-1">
                      {t('presence_admin_process_name')} ({t('presence_admin_process_name_hint')})
                    </label>
                    <input
                      type="text"
                      value={rule.processName}
                      onChange={e => updateRule(idx, { processName: e.target.value })}
                      className="w-full bg-softspace-900 border border-softspace-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-softspace-500"
                    />
                  </div>

                  <div className="flex-1 min-w-[200px]">
                    <label className="block text-xs font-bold text-softspace-400 uppercase tracking-wider mb-1">
                      {t('presence_admin_display_name')} ({t('presence_admin_display_name_hint')})
                    </label>
                    <input
                      type="text"
                      value={rule.displayName}
                      onChange={e => updateRule(idx, { displayName: e.target.value })}
                      className="w-full bg-softspace-900 border border-softspace-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-softspace-500"
                    />
                  </div>

                  <div className="flex-1 min-w-[200px]">
                    <label className="block text-xs font-bold text-softspace-400 uppercase tracking-wider mb-1">
                      {t('presence_admin_icon_url')}
                    </label>
                    <input
                      type="text"
                      value={rule.iconUrl ?? ''}
                      onChange={e => updateRule(idx, { iconUrl: e.target.value || undefined })}
                      placeholder="https://cdn.simpleicons.org/..."
                      className="w-full bg-softspace-900 border border-softspace-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-softspace-500"
                    />
                  </div>

                  <div className="w-28">
                    <label className="block text-xs font-bold text-softspace-400 uppercase tracking-wider mb-1">
                      {t('presence_admin_accent_color')}
                    </label>
                    <input
                      type="text"
                      value={rule.accentColor ?? ''}
                      onChange={e => updateRule(idx, { accentColor: e.target.value || undefined })}
                      placeholder="#5865F2"
                      className="w-full bg-softspace-900 border border-softspace-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-softspace-500"
                    />
                  </div>

                  <div className="w-12 flex items-end pb-2">
                    {rule.iconUrl ? (
                      <img src={rule.iconUrl} alt="" className="w-10 h-10 rounded-lg object-cover bg-softspace-800" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-softspace-800 flex items-center justify-center text-softspace-500">
                        {rule.type === 'GAME' ? <Gamepad2 size={18} /> : <AppWindow size={18} />}
                      </div>
                    )}
                  </div>

                  <div className="w-32">
                    <label className="block text-xs font-bold text-softspace-400 uppercase tracking-wider mb-1">
                      {t('presence_admin_type')}
                    </label>
                    <select
                      value={rule.type}
                      onChange={e => updateRule(idx, { type: e.target.value as 'APP' | 'GAME' })}
                      className="w-full bg-softspace-900 border border-softspace-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-softspace-500 appearance-none"
                    >
                      <option value="APP">{t('presence_admin_type_app')}</option>
                      <option value="GAME">{t('presence_admin_type_game')}</option>
                    </select>
                  </div>

                  <div className="w-32 flex flex-col justify-end pb-2">
                    <label className="flex items-center gap-2 cursor-pointer text-sm">
                      <input
                        type="checkbox"
                        checked={rule.showTitle}
                        onChange={e => updateRule(idx, { showTitle: e.target.checked })}
                        className="rounded border-softspace-700 bg-softspace-900 text-softspace-500 focus:ring-softspace-500"
                      />
                      {t('presence_admin_show_title')}
                    </label>
                  </div>

                  <div className="flex flex-col justify-end pb-1">
                    <button
                      onClick={() => removeRule(idx)}
                      className="p-2 text-red-400 hover:bg-red-500/20 rounded-xl transition-colors"
                      title={t('presence_admin_delete_rule')}
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))}

              {rules.length === 0 && (
                <div className="text-center py-8 text-softspace-500 border border-dashed border-softspace-700 rounded-2xl">
                  {t('presence_admin_no_rules')}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
