import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/useAuthStore';
import { LogOut, User as UserIcon, Globe, Save, Mic, Volume2, Menu, ArrowUp, ArrowDown, Trash2 } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { api, assetUrl } from '../lib/api';
import { useSettingsStore } from '../store/useSettingsStore';
import { useLayoutStore } from '../store/useLayoutStore';
import { isDesktopApp } from '../lib/platform';
import type { ScreenResolution } from '../lib/screenCapture';
import ImageCropperModal from '../components/ImageCropperModal';

type UserProfile = {
  id?: string;
  username?: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  bio?: string | null;
  pronouns?: string | null;
  allowDownloads?: boolean;
};

type CustomEmojiItem = {
  id: string;
  name: string;
  url: string;
  type: 'EMOJI' | 'GIF';
  position: number;
};

export default function SettingsPage() {
  const { t, i18n } = useTranslation();

  const logout = useAuthStore(state => state.logout);
  const user = useAuthStore(state => state.user) as UserProfile | null;
  const token = useAuthStore(state => state.token);
  const setAuth = useAuthStore(state => state.setAuth);
  const setMobileSidebarOpen = useLayoutStore(state => state.setMobileSidebarOpen);

  const [activeTab, setActiveTab] = useState('account');

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
  };

  const userKey = user?.id ?? 'no-user';

  return (
    <div className="flex flex-col md:flex-row h-full bg-softspace-950 pt-safe">
      <div className="w-full md:w-1/3 md:max-w-xs bg-softspace-900 border-b md:border-b-0 md:border-r border-softspace-800 p-2 md:p-4 flex flex-row md:flex-col items-center md:items-end overflow-x-auto no-scrollbar shrink-0">
        <div className="flex md:block w-full md:max-w-[200px] gap-2 md:gap-0 md:space-y-2">
          <div className="flex items-center gap-2 mb-2">
            <button 
              onClick={() => setMobileSidebarOpen(true)} 
              className="md:hidden p-1.5 text-softspace-400 hover:text-softspace-100 rounded-lg shrink-0"
            >
              <Menu size={20} />
            </button>
            <div className="hidden md:block text-xs font-bold text-softspace-400 uppercase px-2">{t('user_settings')}</div>
          </div>
          <button
            onClick={() => setActiveTab('account')}
            className={`whitespace-nowrap md:w-full text-center md:text-left px-4 py-2 rounded-xl font-medium transition-colors ${activeTab === 'account' ? 'bg-softspace-800 text-softspace-100' : 'hover:bg-softspace-800 text-softspace-300'}`}
          >
            {t('my_account')}
          </button>
          <button
            onClick={() => setActiveTab('profile')}
            className={`whitespace-nowrap md:w-full text-center md:text-left px-4 py-2 rounded-xl font-medium transition-colors ${activeTab === 'profile' ? 'bg-softspace-800 text-softspace-100' : 'hover:bg-softspace-800 text-softspace-300'}`}
          >
            {t('edit_profile')}
          </button>
          <button
            onClick={() => setActiveTab('audiovideo')}
            className={`whitespace-nowrap md:w-full text-center md:text-left px-4 py-2 rounded-xl font-medium transition-colors ${activeTab === 'audiovideo' ? 'bg-softspace-800 text-softspace-100' : 'hover:bg-softspace-800 text-softspace-300'}`}
          >
            {t('audio_video')}
          </button>
          

          <div className="hidden md:block my-4 border-t border-softspace-800" />

          <button
            onClick={logout}
            className="whitespace-nowrap md:w-full text-center md:text-left px-4 py-2 hover:bg-red-500/10 text-red-400 rounded-xl font-medium transition-colors flex items-center justify-center md:justify-start gap-2 ml-auto md:ml-0"
          >
            <LogOut size={18} />
            <span className="hidden md:inline">{t('logout')}</span>
          </button>
        </div>
      </div>

      <div className="flex-1 p-4 md:p-10 overflow-y-auto pb-safe">
        <div className="max-w-2xl mx-auto md:mx-0">
          <SettingsContent
            key={userKey}
            activeTab={activeTab}
            user={user}
            token={token}
            setAuth={setAuth}
            changeLanguage={changeLanguage}
            i18n={i18n}
          />
        </div>
      </div>
    </div>
  );
}

function SettingsContent(props: {
  activeTab: string;
  user: UserProfile | null;
  token: string | null;
  setAuth: (
    user: {
      id: string;
      username: string;
      displayName?: string;
      avatarUrl?: string;
      bannerUrl?: string;
      bio?: string;
      pronouns?: string;
      status: string;
      allowDownloads?: boolean;
    },
    token: string
  ) => void;
  changeLanguage: (lng: string) => void;
  i18n: { language: string; changeLanguage: (lng: string) => void };
}) {
  const { activeTab, user, token, setAuth, changeLanguage, i18n } = props;
  const { t } = useTranslation();
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [pronouns, setPronouns] = useState(user?.pronouns || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [allowDownloads, setAllowDownloads] = useState(user?.allowDownloads ?? true);
  const [isSaving, setIsSaving] = useState(false);
  
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string>('');
  const [cropAspect, setCropAspect] = useState<number>(1);
  const [cropType, setCropType] = useState<'avatar' | 'banner'>('avatar');

  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);

  // Email Change State
  const [newEmail, setNewEmail] = useState('');
  const [emailStep, setEmailStep] = useState(1); // 1 = request, 2 = verify old, 3 = verify new
  const [oldEmailCode, setOldEmailCode] = useState('');
  const [newEmailCode, setNewEmailCode] = useState('');

  // Password Change State
  const [passwordStep, setPasswordStep] = useState(1); // 1 = request, 2 = verify
  const [passwordCode, setPasswordCode] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [customEmojis, setCustomEmojis] = useState<CustomEmojiItem[]>([]);
  const [customEmojiName, setCustomEmojiName] = useState('');
  const [customEmojiFile, setCustomEmojiFile] = useState<File | null>(null);
  const [customEmojiLoading, setCustomEmojiLoading] = useState(false);
  const [customEmojiSaving, setCustomEmojiSaving] = useState(false);

  const loadCustomEmojis = useCallback(async () => {
    if (!token) return;
    setCustomEmojiLoading(true);
    try {
      const res = await api('/api/users/me/custom-emojis', {}, token);
      if (!res.ok) return;
      const data = await res.json();
      setCustomEmojis(data.customEmojis ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setCustomEmojiLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (activeTab === 'account' && token) {
      void loadCustomEmojis();
    }
  }, [activeTab, token, loadCustomEmojis]);

  const maskEmail = (email?: string) => {
    if (!email) return t('no_email_linked');
    const [name, domain] = email.split('@');
    if (!domain) return email;
    return `${name.charAt(0)}***@${domain}`;
  };

  const handleRequestEmailChange = async () => {
    if (!newEmail || !newEmail.includes('@')) return alert(t('invalid_email'));
    try {
      const res = await api('/api/users/me/email/request-change', {
        method: 'POST',
        body: JSON.stringify({ newEmail })
      }, token);
      if (res.ok) {
        setEmailStep(2);
      } else {
        alert(t('email_change_request_failed'));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleVerifyEmailChange = async () => {
    try {
      const res = await api('/api/users/me/email/verify', {
        method: 'POST',
        body: JSON.stringify({ oldCode: oldEmailCode, newCode: newEmailCode })
      }, token);
      if (res.ok) {
        let data: any = {};
        try {
          const text = await res.text();
          if (text) data = JSON.parse(text);
        } catch(e) {}
        setAuth(data.user, token!);
        setEmailModalOpen(false);
        alert(t('email_updated_successfully'));
      } else {
        alert(t('invalid_codes'));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRequestPasswordChange = async () => {
    try {
      const res = await api('/api/users/me/password/request-change', {
        method: 'POST'
      }, token);
      if (res.ok) {
        setPasswordStep(2);
      } else {
        alert(t('password_change_request_failed'));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleVerifyPasswordChange = async () => {
    try {
      const res = await api('/api/users/me/password/verify', {
        method: 'POST',
        body: JSON.stringify({ code: passwordCode, newPassword })
      }, token);
      if (res.ok) {
        setPasswordModalOpen(false);
        alert(t('password_updated_successfully'));
      } else {
        alert(t('invalid_code_or_short_password'));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCropImageUpload = async (file: File, type: 'avatar' | 'banner') => {
    const url = URL.createObjectURL(file);
    setCropImageSrc(url);
    setCropAspect(type === 'avatar' ? 1 : 16 / 9);
    setCropType(type);
    setCropModalOpen(true);
  };

  const handleCropComplete = async (croppedFile: File) => {
    if (!token) return;
    const formData = new FormData();
    formData.append('files', croppedFile);

    try {
      const res = await api('/api/uploads', {
        method: 'POST',
        body: formData
      }, token);
      
      if (res.ok) {
        const data = await res.json();
        const url = data.attachments?.[0]?.url;
        if (url) {
          const update = cropType === 'avatar' ? { avatarUrl: url } : { bannerUrl: url };
          const patchRes = await api('/api/users/me', {
            method: 'PATCH',
            body: JSON.stringify(update)
          }, token);
          if (patchRes.ok) {
            const patchData = await patchRes.json();
            setAuth(patchData.user, token);
            setCropModalOpen(false);
          }
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setIsSaving(true);

    try {
      const trimmedDisplayName = displayName.trim();
      const trimmedPronouns = pronouns.trim();
      const trimmedBio = bio.trim();

      const body: {
        displayName?: string;
        pronouns?: string | undefined;
        bio?: string | undefined;
        allowDownloads?: boolean;
      } = {
        pronouns: trimmedPronouns ? trimmedPronouns : undefined,
        bio: trimmedBio ? trimmedBio : undefined,
        allowDownloads,
      };
      if (trimmedDisplayName) body.displayName = trimmedDisplayName;

      const res = await api(
        '/api/users/me',
        {
          method: 'PATCH',
          body: JSON.stringify(body),
        },
        token
      );

      if (res.ok) {
        const data = await res.json();
        const rawUser = data.user as {
          id: string;
          username: string;
          status: string;
          displayName?: string | null;
          avatarUrl?: string | null;
          bannerUrl?: string | null;
          bio?: string | null;
          pronouns?: string | null;
          allowDownloads?: boolean;
        };

        setAuth(
          {
            id: rawUser.id,
            username: rawUser.username,
            status: rawUser.status,
            displayName: rawUser.displayName ?? undefined,
            avatarUrl: rawUser.avatarUrl ?? undefined,
            bannerUrl: rawUser.bannerUrl ?? undefined,
            bio: rawUser.bio ?? undefined,
            pronouns: rawUser.pronouns ?? undefined,
            allowDownloads: rawUser.allowDownloads ?? true,
          },
          token
        );
        alert(t('profile_updated_successfully'));
      } else {
        alert(t('profile_update_failed'));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateCustomEmoji = async () => {
    if (!token || !customEmojiFile) return;
    const name = customEmojiName.trim().toLowerCase();
    if (!name) return alert(t('enter_emoji_name'));
    if (!/^[a-z0-9_-]{2,24}$/i.test(name)) {
      return alert(t('invalid_emoji_name'));
    }

    setCustomEmojiSaving(true);
    try {
      const formData = new FormData();
      formData.append('files', customEmojiFile);
      const uploadRes = await api('/api/uploads', { method: 'POST', body: formData }, token);
      if (!uploadRes.ok) {
        alert(t('upload_failed'));
        return;
      }

      const uploadData = await uploadRes.json();
      const url = uploadData.attachments?.[0]?.url;
      if (!url) {
        alert(t('file_process_failed'));
        return;
      }

      const type = customEmojiFile.type === 'image/gif' ? 'GIF' : 'EMOJI';
      const createRes = await api(
        '/api/users/me/custom-emojis',
        {
          method: 'POST',
          body: JSON.stringify({ name, url, type }),
        },
        token
      );
      if (!createRes.ok) {
        alert(t('custom_emoji_save_failed'));
        return;
      }

      const data = await createRes.json();
      setCustomEmojis((prev) =>
        [...prev, data.customEmoji].sort((a, b) => a.position - b.position)
      );
      setCustomEmojiName('');
      setCustomEmojiFile(null);
    } catch (err) {
      console.error(err);
      alert(t('custom_emoji_save_error'));
    } finally {
      setCustomEmojiSaving(false);
    }
  };

  const handleDeleteCustomEmoji = async (id: string) => {
    if (!token) return;
    try {
      const res = await api(`/api/users/me/custom-emojis/${id}`, { method: 'DELETE' }, token);
      if (!res.ok) {
        alert(t('delete_failed'));
        return;
      }
      setCustomEmojis((prev) => prev.filter((emoji) => emoji.id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  const handleMoveCustomEmoji = async (index: number, direction: -1 | 1) => {
    if (!token) return;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= customEmojis.length) return;

    const next = [...customEmojis];
    const [item] = next.splice(index, 1);
    next.splice(targetIndex, 0, item);
    setCustomEmojis(next);

    try {
      const res = await api(
        '/api/users/me/custom-emojis/reorder',
        {
          method: 'PATCH',
          body: JSON.stringify({ ids: next.map((emoji) => emoji.id) }),
        },
        token
      );
      if (!res.ok) {
        alert(t('save_failed_sorting'));
        await loadCustomEmojis();
      }
    } catch (err) {
      console.error(err);
      await loadCustomEmojis();
    }
  };

  return (
    <>
      <ImageCropperModal
        isOpen={cropModalOpen}
        imageSrc={cropImageSrc}
        aspect={cropAspect}
        onClose={() => setCropModalOpen(false)}
        onCropComplete={handleCropComplete}
      />
      {activeTab === 'account' && (
        <>
          <h2 className="text-2xl font-bold text-softspace-100 mb-6">{t('my_account')}</h2>

          <div className="bg-softspace-900 rounded-2xl p-6 mb-8">
            <h3 className="text-sm font-bold text-softspace-400 uppercase tracking-wider mb-4">{t('profile_preview')}</h3>
            {/* Banner Section */}
            <div className="relative w-full h-24 bg-softspace-800 rounded-xl mb-10 overflow-hidden">
              {user?.bannerUrl ? (
                <img src={assetUrl(user.bannerUrl)} alt="Banner" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-softspace-700 to-softspace-900" />
              )}
            </div>

            <div className="flex items-center gap-6 relative -mt-16 ml-4">
              <div className="w-20 h-20 bg-softspace-900 p-1.5 rounded-full relative">
                <div className="w-full h-full bg-softspace-800 rounded-full flex items-center justify-center overflow-hidden">
                  {user?.avatarUrl ? (
                    <img src={assetUrl(user.avatarUrl)} alt="Avatar" className="w-full h-full rounded-full object-cover" />
                  ) : (
                    <UserIcon size={32} className="text-softspace-400" />
                  )}
                </div>
              </div>
              <div className="mt-6">
                <h3 className="text-lg font-bold text-softspace-100">{user?.displayName || user?.username}</h3>
                <p className="text-softspace-400 text-sm">@{user?.username}</p>
              </div>
            </div>
          </div>

          <div className="bg-softspace-900 rounded-2xl p-6 mb-8">
            <h3 className="text-sm font-bold text-softspace-400 uppercase tracking-wider mb-4">{t('security')}</h3>
            
            <div className="flex items-center justify-between py-3 border-b border-softspace-800">
              <div>
                <div className="text-softspace-100 font-medium">{t('email')}</div>
                <div className="text-sm text-softspace-400">{maskEmail((user as any)?.email)}</div>
              </div>
              <button 
                onClick={() => {
                  setEmailStep(1);
                  setNewEmail('');
                  setOldEmailCode('');
                  setNewEmailCode('');
                  setEmailModalOpen(true);
                }}
                className="px-4 py-2 bg-softspace-800 hover:bg-softspace-700 text-softspace-200 rounded-xl text-sm font-medium transition-colors"
              >
                {t('change_email')}
              </button>
            </div>

            <div className="flex items-center justify-between py-3">
              <div>
                <div className="text-softspace-100 font-medium">{t('password')}</div>
                <div className="text-sm text-softspace-400">********</div>
              </div>
              <button 
                onClick={() => {
                  setPasswordStep(1);
                  setPasswordCode('');
                  setNewPassword('');
                  setPasswordModalOpen(true);
                }}
                className="px-4 py-2 bg-softspace-800 hover:bg-softspace-700 text-softspace-200 rounded-xl text-sm font-medium transition-colors"
              >
                {t('change_password')}
              </button>
            </div>
          </div>

          <div className="bg-softspace-900 rounded-2xl p-6 mb-8">
            <h3 className="text-sm font-bold text-softspace-400 uppercase tracking-wider mb-4">{t('custom_emojis')}</h3>
            <p className="text-sm text-softspace-300 mb-6">
              {t('custom_emojis_description')}
            </p>

            <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] mb-5">
              <input
                type="text"
                value={customEmojiName}
                onChange={(e) => setCustomEmojiName(e.target.value)}
                placeholder={t('emoji_name_placeholder')}
                className="w-full bg-softspace-950 border border-softspace-800 rounded-xl px-4 py-3 text-softspace-100 focus:outline-none focus:border-softspace-500 transition-colors"
              />
              <label className="px-4 py-3 bg-softspace-800 hover:bg-softspace-700 text-softspace-200 rounded-xl text-sm font-medium transition-colors cursor-pointer text-center flex items-center justify-center">
                {customEmojiFile ? customEmojiFile.name : t('choose_file')}
                <input
                  type="file"
                  hidden
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={(e) => setCustomEmojiFile(e.target.files?.[0] ?? null)}
                />
              </label>
              <button
                type="button"
                onClick={handleCreateCustomEmoji}
                disabled={!customEmojiFile || !customEmojiName.trim() || customEmojiSaving}
                className="px-4 py-3 rounded-xl bg-softspace-500 hover:bg-softspace-400 disabled:bg-softspace-800 disabled:text-softspace-500 text-white font-medium transition-colors flex items-center justify-center"
              >
                {customEmojiSaving ? t('uploading_now') : t('upload_now')}
              </button>
            </div>

            <div className="rounded-2xl border border-softspace-800 bg-softspace-950/60 overflow-hidden">
              <div className="px-4 py-3 border-b border-softspace-800 text-xs font-bold text-softspace-400 uppercase tracking-wider">
                {t('your_custom_emojis')}
              </div>
              {customEmojiLoading ? (
                <div className="px-4 py-5 text-softspace-400 text-sm">{t('loading')}</div>
              ) : customEmojis.length === 0 ? (
                <div className="px-4 py-5 text-softspace-400 text-sm">{t('nothing_uploaded_yet')}</div>
              ) : (
                <div className="divide-y divide-softspace-800">
                  {customEmojis.map((emoji, index) => (
                    <div key={emoji.id} className="px-4 py-3 flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl bg-softspace-900 border border-softspace-800 overflow-hidden shrink-0 flex items-center justify-center">
                        <img
                          src={assetUrl(emoji.url)}
                          alt={emoji.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-softspace-100 font-medium truncate">:{emoji.name}:</div>
                        <div className="text-xs text-softspace-500">{emoji.type === 'GIF' ? 'GIF' : t('emoji_label')}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => void handleMoveCustomEmoji(index, -1)}
                          disabled={index === 0}
                          className="p-2 rounded-xl bg-softspace-800 hover:bg-softspace-700 disabled:opacity-40 text-softspace-200 transition-colors cursor-pointer"
                          aria-label={t('move_up')}
                        >
                          <ArrowUp size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleMoveCustomEmoji(index, 1)}
                          disabled={index === customEmojis.length - 1}
                          className="p-2 rounded-xl bg-softspace-800 hover:bg-softspace-700 disabled:opacity-40 text-softspace-200 transition-colors cursor-pointer"
                          aria-label={t('move_down')}
                        >
                          <ArrowDown size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteCustomEmoji(emoji.id)}
                          className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-300 transition-colors cursor-pointer"
                          aria-label={t('delete')}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <h2 className="text-2xl font-bold text-softspace-100 mb-6 flex items-center gap-2">
            <Globe size={24} />
            {t('language')}
          </h2>
          <div className="bg-softspace-900 rounded-2xl p-6 flex gap-4">
            <button
              onClick={() => changeLanguage('en')}
              className={`px-4 py-2 rounded-xl transition-colors ${i18n.language === 'en' ? 'bg-softspace-600 text-white' : 'bg-softspace-800 text-softspace-300 hover:bg-softspace-700'}`}
            >
              English
            </button>
            <button
              onClick={() => changeLanguage('de')}
              className={`px-4 py-2 rounded-xl transition-colors ${i18n.language === 'de' ? 'bg-softspace-600 text-white' : 'bg-softspace-800 text-softspace-300 hover:bg-softspace-700'}`}
            >
              Deutsch
            </button>
          </div>

          {/* Email Modal */}
          {emailModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
              <div className="bg-softspace-900 border border-softspace-800 rounded-2xl p-6 w-full max-w-sm">
                <h3 className="text-xl font-bold text-softspace-100 mb-4">{t('change_email')}</h3>
                {emailStep === 1 && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-softspace-300 mb-2">{t('new_email')}</label>
                      <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} className="w-full bg-softspace-950 border border-softspace-800 rounded-xl px-4 py-3 text-softspace-100" />
                    </div>
                    <div className="flex justify-end gap-3">
                      <button onClick={() => setEmailModalOpen(false)} className="text-softspace-300 hover:text-white px-4 py-2">{t('cancel')}</button>
                      <button onClick={handleRequestEmailChange} className="bg-softspace-500 hover:bg-softspace-400 text-white px-4 py-2 rounded-xl">{t('next')}</button>
                    </div>
                  </div>
                )}
                {emailStep === 2 && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-softspace-300 mb-2">{t('code_sent_to_old_email')}</label>
                      <input type="text" value={oldEmailCode} onChange={e => setOldEmailCode(e.target.value)} className="w-full bg-softspace-950 border border-softspace-800 rounded-xl px-4 py-3 text-softspace-100" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-softspace-300 mb-2">{t('code_sent_to_new_email')}</label>
                      <input type="text" value={newEmailCode} onChange={e => setNewEmailCode(e.target.value)} className="w-full bg-softspace-950 border border-softspace-800 rounded-xl px-4 py-3 text-softspace-100" />
                    </div>
                    <div className="flex justify-end gap-3">
                      <button onClick={() => setEmailModalOpen(false)} className="text-softspace-300 hover:text-white px-4 py-2">{t('cancel')}</button>
                      <button onClick={handleVerifyEmailChange} className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-xl">{t('verify_and_save')}</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Password Modal */}
          {passwordModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
              <div className="bg-softspace-900 border border-softspace-800 rounded-2xl p-6 w-full max-w-sm">
                <h3 className="text-xl font-bold text-softspace-100 mb-4">{t('change_password')}</h3>
                {passwordStep === 1 && (
                  <div className="space-y-4">
                    <p className="text-sm text-softspace-300">{t('password_change_info')}</p>
                    <div className="flex justify-end gap-3">
                      <button onClick={() => setPasswordModalOpen(false)} className="text-softspace-300 hover:text-white px-4 py-2">{t('cancel')}</button>
                      <button onClick={handleRequestPasswordChange} className="bg-softspace-500 hover:bg-softspace-400 text-white px-4 py-2 rounded-xl">{t('send_code')}</button>
                    </div>
                  </div>
                )}
                {passwordStep === 2 && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-softspace-300 mb-2">{t('verification_code')}</label>
                      <input type="text" value={passwordCode} onChange={e => setPasswordCode(e.target.value)} className="w-full bg-softspace-950 border border-softspace-800 rounded-xl px-4 py-3 text-softspace-100" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-softspace-300 mb-2">{t('new_password')}</label>
                      <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full bg-softspace-950 border border-softspace-800 rounded-xl px-4 py-3 text-softspace-100" />
                    </div>
                    <div className="flex justify-end gap-3">
                      <button onClick={() => setPasswordModalOpen(false)} className="text-softspace-300 hover:text-white px-4 py-2">{t('cancel')}</button>
                      <button onClick={handleVerifyPasswordChange} className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-xl">{t('update_password')}</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === 'profile' && (
        <>
          <h2 className="text-2xl font-bold text-softspace-100 mb-6">{t('edit_profile')}</h2>
          <div className="bg-softspace-900 rounded-2xl p-6">
            
            <div className="mb-8 border-b border-softspace-800 pb-8">
              <h3 className="text-sm font-bold text-softspace-400 uppercase tracking-wider mb-4">{t('images')}</h3>
              
              <div className="flex flex-col sm:flex-row gap-6">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-softspace-300 mb-2">{t('avatar')}</label>
                  <div className="flex items-center gap-4">
                    <div className="w-20 h-20 bg-softspace-800 rounded-full flex items-center justify-center overflow-hidden shrink-0">
                      {user?.avatarUrl ? (
                        <img 
                          src={assetUrl(user.avatarUrl)} 
                          alt="Avatar" 
                          className="w-full h-full object-cover pointer-events-none select-none" 
                          draggable="false"
                          onContextMenu={(e) => e.preventDefault()}
                        />
                      ) : (
                        <UserIcon size={32} className="text-softspace-400" />
                      )}
                    </div>
                    <label className="px-4 py-2 bg-softspace-800 hover:bg-softspace-700 text-softspace-200 rounded-xl text-sm font-medium transition-colors cursor-pointer">
                        {t('upload_avatar')}
                        <input 
                          type="file" 
                          hidden 
                          accept="image/*,video/mp4,image/gif"
                          onChange={(e) => {
                            if (e.target.files?.[0]) void handleCropImageUpload(e.target.files[0], 'avatar');
                          }}
                        />
                      </label>
                  </div>
                </div>

                <div className="flex-1">
                  <label className="block text-sm font-medium text-softspace-300 mb-2">{t('banner')}</label>
                  <div className="flex flex-col gap-3">
                    <div className="w-full h-20 bg-softspace-800 rounded-xl overflow-hidden shrink-0">
                      {user?.bannerUrl ? (
                        <img 
                          src={assetUrl(user.bannerUrl)} 
                          alt="Banner" 
                          className="w-full h-full object-cover pointer-events-none select-none" 
                          draggable="false"
                          onContextMenu={(e) => e.preventDefault()}
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-softspace-700 to-softspace-900" />
                      )}
                    </div>
                    <label className="px-4 py-2 bg-softspace-800 hover:bg-softspace-700 text-softspace-200 rounded-xl text-sm font-medium transition-colors cursor-pointer w-fit">
                        {t('upload_banner')}
                        <input 
                          type="file" 
                          hidden 
                          accept="image/*,video/mp4,image/gif"
                          onChange={(e) => {
                            if (e.target.files?.[0]) void handleCropImageUpload(e.target.files[0], 'banner');
                          }}
                        />
                      </label>
                  </div>
                </div>
              </div>
            </div>

            <form onSubmit={handleUpdateProfile} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-softspace-300 mb-2">{t('display_name').toUpperCase()}</label>
                <input
                  type="text"
                  className="w-full bg-softspace-950 border border-softspace-800 rounded-xl px-4 py-3 text-softspace-100 focus:outline-none focus:border-softspace-500 transition-colors"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-softspace-300 mb-2">{t('pronouns').toUpperCase()}</label>
                <input
                  type="text"
                  placeholder="they/them"
                  className="w-full bg-softspace-950 border border-softspace-800 rounded-xl px-4 py-3 text-softspace-100 focus:outline-none focus:border-softspace-500 transition-colors"
                  value={pronouns}
                  onChange={(e) => setPronouns(e.target.value)}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-softspace-300 mb-2">{t('bio').toUpperCase()}</label>
                <textarea
                  placeholder="..."
                  rows={4}
                  className="w-full bg-softspace-950 border border-softspace-800 rounded-xl px-4 py-3 text-softspace-100 focus:outline-none focus:border-softspace-500 transition-colors resize-none"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-3 bg-softspace-950 p-4 rounded-xl border border-softspace-800">
                <input
                  type="checkbox"
                  id="allowDownloads"
                  className="w-5 h-5 rounded border-softspace-800 bg-softspace-950 text-softspace-500 focus:ring-0 focus:ring-offset-0 focus:outline-none cursor-pointer"
                  checked={allowDownloads}
                  onChange={(e) => setAllowDownloads(e.target.checked)}
                />
                <label htmlFor="allowDownloads" className="text-sm font-medium text-softspace-200 cursor-pointer select-none">
                  {t('allow_downloads_desc')}
                </label>
              </div>
              <button
                type="submit"
                disabled={isSaving}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white px-6 py-3 rounded-xl font-medium transition-colors disabled:opacity-50"
              >
                <Save size={18} />
                {isSaving ? t('saving') : t('save')}
              </button>
            </form>
          </div>
        </>
      )}

      {activeTab === 'audiovideo' && <AudioVideoTab />}

      
    </>
  );
}

function AudioVideoTab() {
  const { t } = useTranslation();
  const { audioVideo, setAudioVideoSettings } = useSettingsStore();
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [hasPermission, setHasPermission] = useState(false);

  useEffect(() => {
    const getDevices = async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        setHasPermission(true);
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        setDevices(allDevices);
      } catch (err) {
        console.error('Error accessing media devices.', err);
      }
    };
    getDevices();

    navigator.mediaDevices.addEventListener('devicechange', getDevices);
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', getDevices);
    };
  }, []);

  const audioInputs = devices.filter(d => d.kind === 'audioinput');
  const audioOutputs = devices.filter(d => d.kind === 'audiooutput');

  return (
    <>
      <h2 className="text-2xl font-bold text-softspace-100 mb-6 flex items-center gap-2">
        <Mic size={24} />
        {t('audio_video_settings')}
      </h2>

      {!hasPermission && (
        <div className="bg-red-500/10 text-red-400 p-4 rounded-xl mb-6">
          {t('microphone_access_prompt')}
        </div>
      )}

      <div className="bg-softspace-900 rounded-2xl p-6 space-y-8">
        <div>
          <h3 className="text-sm font-bold text-softspace-400 uppercase tracking-wider mb-4">{t('input_device')}</h3>
          <select
            className="w-full bg-softspace-950 border border-softspace-800 rounded-xl px-4 py-3 text-softspace-100 focus:outline-none focus:border-softspace-500 transition-colors"
            value={audioVideo.audioInputDeviceId || ''}
            onChange={(e) => setAudioVideoSettings({ audioInputDeviceId: e.target.value })}
          >
            <option value="">{t('default_option')}</option>
            {audioInputs.map(device => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Microphone ${device.deviceId.slice(0, 5)}...`}
              </option>
            ))}
          </select>
        </div>

        <div>
          <h3 className="text-sm font-bold text-softspace-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Volume2 size={16} />
            {t('output_device')}
          </h3>
          <select
            className="w-full bg-softspace-950 border border-softspace-800 rounded-xl px-4 py-3 text-softspace-100 focus:outline-none focus:border-softspace-500 transition-colors"
            value={audioVideo.audioOutputDeviceId || ''}
            onChange={(e) => setAudioVideoSettings({ audioOutputDeviceId: e.target.value })}
          >
            <option value="">{t('default_option')}</option>
            {audioOutputs.map(device => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Speaker ${device.deviceId.slice(0, 5)}...`}
              </option>
            ))}
          </select>
        </div>

        <div className="border-t border-softspace-800 pt-8 space-y-4">
          <h3 className="text-sm font-bold text-softspace-400 uppercase tracking-wider mb-4">{t('screen_share_quality')}</h3>
          {isDesktopApp() && (
            <p className="text-xs text-softspace-500 -mt-2">{t('screen_share_desktop_hint')}</p>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-softspace-400 mb-2">{t('resolution')}</label>
              <select
                className="w-full bg-softspace-950 border border-softspace-800 rounded-xl px-4 py-3 text-softspace-100 focus:outline-none focus:border-softspace-500 transition-colors"
                value={audioVideo.screenShare?.resolution || '1080p'}
                onChange={(e) => setAudioVideoSettings({ screenShare: { ...audioVideo.screenShare, resolution: e.target.value as ScreenResolution } })}
              >
                {isDesktopApp() && <option value="native">{t('resolution_native')}</option>}
                {isDesktopApp() && <option value="1440p">{t('resolution_1440p')}</option>}
                <option value="1080p">{t('resolution_high')}</option>
                <option value="720p">{t('resolution_standard')}</option>
                <option value="480p">{t('resolution_low')}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-softspace-400 mb-2">{t('framerate')}</label>
              <select
                className="w-full bg-softspace-950 border border-softspace-800 rounded-xl px-4 py-3 text-softspace-100 focus:outline-none focus:border-softspace-500 transition-colors"
                value={audioVideo.screenShare?.fps || 30}
                onChange={(e) => setAudioVideoSettings({ screenShare: { ...audioVideo.screenShare, fps: parseInt(e.target.value, 10) } })}
              >
                <option value={60}>{t('fps_smooth')}</option>
                <option value={30}>{t('fps_standard')}</option>
                <option value={15}>{t('fps_low')}</option>
              </select>
            </div>
          </div>
        </div>

        <div className="border-t border-softspace-800 pt-8 space-y-4">
          <h3 className="text-sm font-bold text-softspace-400 uppercase tracking-wider mb-4">{t('audio_processing')}</h3>

          <label className="flex items-center gap-3 cursor-pointer group">
            <div className="relative flex items-center justify-center">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={audioVideo.noiseSuppression}
                onChange={(e) => setAudioVideoSettings({ noiseSuppression: e.target.checked })}
              />
              <div className="w-10 h-6 bg-softspace-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
            </div>
            <span className="text-softspace-200 font-medium group-hover:text-white transition-colors">{t('noise_suppression')}</span>
          </label>

          <label className="flex items-center gap-3 cursor-pointer group">
            <div className="relative flex items-center justify-center">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={audioVideo.echoCancellation}
                onChange={(e) => setAudioVideoSettings({ echoCancellation: e.target.checked })}
              />
              <div className="w-10 h-6 bg-softspace-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
            </div>
            <span className="text-softspace-200 font-medium group-hover:text-white transition-colors">{t('echo_cancellation')}</span>
          </label>

          <label className="flex items-center gap-3 cursor-pointer group">
            <div className="relative flex items-center justify-center">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={audioVideo.autoGainControl}
                onChange={(e) => setAudioVideoSettings({ autoGainControl: e.target.checked })}
              />
              <div className="w-10 h-6 bg-softspace-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
            </div>
            <span className="text-softspace-200 font-medium group-hover:text-white transition-colors">{t('auto_gain_control')}</span>
          </label>
        </div>
      </div>
    </>
  );
}

// Notifications tab removed (reverted to previous UI state)
