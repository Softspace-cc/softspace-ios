import { useCallback, useEffect, useState } from 'react';
import { Heart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, apiJson } from '../lib/api';
import {
  STATUS_BANNER,
  STATUS_COMPONENT_IDS,
  STATUS_DOT,
  statusComponentKey,
  statusLevelKey,
  statusOverallKey,
  type StatusComponentId,
  type StatusLevel,
  type StatusPayload,
} from '../lib/status';

const ADMIN_STORAGE_KEY = 'softspace-status-admin';

export default function StatusPage() {
  const { t, i18n } = useTranslation();
  const [payload, setPayload] = useState<StatusPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminPassword, setAdminPassword] = useState(
    () => sessionStorage.getItem(ADMIN_STORAGE_KEY) ?? ''
  );
  const [adminComponent, setAdminComponent] = useState<StatusComponentId>('api');
  const [adminStatus, setAdminStatus] = useState<StatusLevel | ''>('operational');
  const [adminMessage, setAdminMessage] = useState('');
  const [adminFeedback, setAdminFeedback] = useState<string | null>(null);
  const [adminError, setAdminError] = useState(false);
  const [saving, setSaving] = useState(false);

  const formatTime = useCallback(
    (iso: string | null) => {
      if (!iso) return '–';
      return new Date(iso).toLocaleString(i18n.language.startsWith('de') ? 'de-DE' : 'en-US', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    },
    [i18n.language]
  );

  const loadStatus = useCallback(async () => {
    try {
      const res = await api('/api/status');
      if (!res.ok) throw new Error('status load failed');
      setPayload(await res.json());
      setError(null);
    } catch {
      setError(t('status_load_error'));
    }
  }, [t]);

  useEffect(() => {
    void loadStatus();
    const timer = window.setInterval(() => {
      void loadStatus();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [loadStatus]);

  const handleAdminSave = async () => {
    if (!adminPassword.trim()) {
      setAdminFeedback(t('status_admin_password_missing'));
      setAdminError(true);
      return;
    }

    setSaving(true);
    setAdminFeedback(null);
    setAdminError(false);

    try {
      const next = await apiJson<StatusPayload>(
        '/api/status/admin',
        {
          method: 'PATCH',
          headers: { 'x-status-admin-password': adminPassword.trim() },
          body: {
            componentId: adminComponent,
            status: adminStatus || null,
            message: adminMessage,
          },
        }
      );

      sessionStorage.setItem(ADMIN_STORAGE_KEY, adminPassword.trim());
      setPayload(next);
      setAdminFeedback(t('status_admin_saved'));
      setAdminError(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('status_admin_save_failed');
      setAdminFeedback(message.includes('invalid') ? t('status_admin_wrong_password') : message);
      setAdminError(true);
    } finally {
      setSaving(false);
    }
  };

  const components = payload ? Object.values(payload.components) : [];

  return (
    <div className="min-h-screen bg-softspace-950 flex items-center justify-center p-6 sm:p-10">
      <div className="w-full max-w-xl bg-softspace-900 border border-softspace-800 rounded-2xl shadow-xl">
        <div className="px-8 sm:px-10 pt-10 pb-7 border-b border-softspace-800">
          <div className="flex flex-col items-center text-center">
            <div className="w-14 h-14 bg-softspace-600 rounded-xl flex items-center justify-center mb-4">
              <Heart className="text-white" size={26} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-softspace-50">{t('status_title')}</h1>
            <p className="text-sm text-softspace-400 mt-1.5">{t('status_subtitle')}</p>
          </div>
        </div>

        <div className="px-8 sm:px-10 py-8 space-y-6">
          {error && !payload ? (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          {payload ? (
            <>
              <div
                className={`rounded-lg border px-4 py-3 text-sm font-semibold ${STATUS_BANNER[payload.overall]}`}
              >
                {t(statusOverallKey(payload.overall))}
              </div>

              <ul className="divide-y divide-softspace-800">
                {components.map((item) => (
                  <li key={item.id} className="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-softspace-50">
                        {t(statusComponentKey(item.id as StatusComponentId))}
                      </p>
                      {item.message ? (
                        <p className="text-xs text-softspace-400 mt-1">{item.message}</p>
                      ) : null}
                      <p className="text-[11px] uppercase tracking-wide text-softspace-500 mt-1">
                        {item.source === 'manual' ? t('status_source_manual') : t('status_source_auto')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 pt-0.5">
                      <span className={`w-2 h-2 rounded-full ${STATUS_DOT[item.status]}`} />
                      <span className="text-xs text-softspace-400 whitespace-nowrap">
                        {t(statusLevelKey(item.status))}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : !error ? (
            <p className="text-sm text-softspace-400 text-center">{t('status_loading')}</p>
          ) : null}

          {adminOpen ? (
            <div className="rounded-xl border border-softspace-800 bg-softspace-950 p-5 space-y-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-softspace-400">
                {t('status_admin_title')}
              </h2>

              <div>
                <label className="block text-xs text-softspace-400 mb-1.5">{t('status_admin_password')}</label>
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  className="w-full bg-softspace-900 border border-softspace-800 rounded-lg px-3 py-2.5 text-sm text-softspace-100 focus:outline-none focus:border-softspace-500"
                />
              </div>

              <div>
                <label className="block text-xs text-softspace-400 mb-1.5">{t('status_admin_component')}</label>
                <select
                  value={adminComponent}
                  onChange={(e) => setAdminComponent(e.target.value as StatusComponentId)}
                  className="w-full bg-softspace-900 border border-softspace-800 rounded-lg px-3 py-2.5 text-sm text-softspace-100 focus:outline-none focus:border-softspace-500"
                >
                  {STATUS_COMPONENT_IDS.map((id) => (
                    <option key={id} value={id}>
                      {t(statusComponentKey(id))}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-softspace-400 mb-1.5">{t('status_admin_status')}</label>
                <select
                  value={adminStatus}
                  onChange={(e) => setAdminStatus(e.target.value as StatusLevel | '')}
                  className="w-full bg-softspace-900 border border-softspace-800 rounded-lg px-3 py-2.5 text-sm text-softspace-100 focus:outline-none focus:border-softspace-500"
                >
                  <option value="operational">{t('status_level_operational')}</option>
                  <option value="degraded">{t('status_level_degraded')}</option>
                  <option value="partial_outage">{t('status_level_partial_outage')}</option>
                  <option value="major_outage">{t('status_level_major_outage')}</option>
                  <option value="maintenance">{t('status_level_maintenance')}</option>
                  <option value="">{t('status_admin_auto')}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-softspace-400 mb-1.5">{t('status_admin_message')}</label>
                <textarea
                  value={adminMessage}
                  onChange={(e) => setAdminMessage(e.target.value)}
                  placeholder={t('status_admin_message_placeholder')}
                  className="w-full min-h-20 bg-softspace-900 border border-softspace-800 rounded-lg px-3 py-2.5 text-sm text-softspace-100 focus:outline-none focus:border-softspace-500 resize-y"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleAdminSave()}
                  disabled={saving}
                  className="px-4 py-2.5 bg-softspace-600 hover:bg-softspace-700 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  {saving ? t('status_admin_saving') : t('status_admin_save')}
                </button>
                <button
                  type="button"
                  onClick={() => setAdminOpen(false)}
                  className="px-4 py-2.5 text-sm text-softspace-400 hover:text-softspace-100 rounded-lg transition-colors"
                >
                  {t('status_admin_close')}
                </button>
              </div>

              {adminFeedback ? (
                <p className={`text-xs ${adminError ? 'text-red-300' : 'text-softspace-400'}`}>
                  {adminFeedback}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="px-8 sm:px-10 py-5 border-t border-softspace-800 flex items-center justify-between gap-4 text-xs text-softspace-500">
          <span>
            {payload
              ? t('status_last_checked', { time: formatTime(payload.checkedAt) })
              : t('status_updating')}
          </span>
          <div className="flex items-center gap-2">
            <Link to="/" className="hover:text-softspace-300 transition-colors">
              softspace.cc
            </Link>
            <span>·</span>
            <button
              type="button"
              onClick={() => i18n.changeLanguage(i18n.language.startsWith('de') ? 'en' : 'de')}
              className="hover:text-softspace-300 transition-colors"
            >
              {i18n.language.startsWith('de') ? 'EN' : 'DE'}
            </button>
            <span>·</span>
            <button
              type="button"
              onClick={() => setAdminOpen((open) => !open)}
              className="hover:text-softspace-300 transition-colors"
            >
              {t('status_admin')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
