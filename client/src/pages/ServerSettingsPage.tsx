import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/useAuthStore';
import { useLayoutStore } from '../store/useLayoutStore';
import { useParams, useNavigate } from 'react-router-dom';
import { Copy, Check, Trash2, Plus, Users, Settings as SettingsIcon, Link as LinkIcon, Shield, PlusCircle, Image as ImageIcon, Globe, Menu } from 'lucide-react';
import { api, assetUrl } from '../lib/api';
import ImageCropperModal from '../components/ImageCropperModal';

type RoleSummary = {
  id: string;
  serverId: string;
  name: string;
  color: string;
  position: number;
  permissions: string;
  isDefault: boolean;
};

  type ServerSummary = {
  id: string;
  name: string;
  description?: string | null;
  iconUrl?: string | null;
  bannerUrl?: string | null;
  isPublic?: boolean;
  ownerId?: string;
  roles?: RoleSummary[];
};

type MemberSummary = {
  userId: string;
  nickname: string | null;
  joinedAt: string;
  timeoutUntil?: string | null;
  isMuted?: boolean;
  isDeafened?: boolean;
  user: {
    id: string;
    username: string;
    displayName?: string | null;
    avatarUrl?: string | null;
    pronouns?: string | null;
  } | null;
  roleIds: string[];
};

type Invite = {
  code: string;
  serverId: string;
  creatorId: string;
  expiresAt: string | null;
  maxUses: number | null;
  uses: number;
  createdAt: string;
};

type Tab = 'profile' | 'members' | 'roles' | 'invites';

const PERMISSION_FLAGS = [
  { name: 'View Channels', key: 'view_channel', flag: 1n << 0n },
  { name: 'Send Messages', key: 'send_messages', flag: 1n << 1n },
  { name: 'Manage Messages', key: 'manage_messages', flag: 1n << 2n },
  { name: 'Manage Channels', key: 'manage_channels', flag: 1n << 3n },
  { name: 'Manage Roles', key: 'manage_roles', flag: 1n << 4n },
  { name: 'Manage Server', key: 'manage_server', flag: 1n << 5n },
  { name: 'Kick Members', key: 'kick_members', flag: 1n << 6n },
  { name: 'Ban Members', key: 'ban_members', flag: 1n << 7n },
  { name: 'Attach Files', key: 'attach_files', flag: 1n << 8n },
  { name: 'Administrator', key: 'administrator', flag: 1n << 9n },
  { name: 'Mention Roles', key: 'mention_roles', flag: 1n << 10n },
];

const hasPermissionFlag = (permsStr: string, flag: bigint) => {
  try {
    const perms = BigInt(permsStr || '0');
    return (perms & flag) === flag;
  } catch {
    return false;
  }
};

export default function ServerSettingsPage() {
  const { t } = useTranslation();
  const token = useAuthStore(state => state.token);
  const me = useAuthStore(state => state.user);
  const { serverId } = useParams();
  const navigate = useNavigate();
  const setMobileSidebarOpen = useLayoutStore(state => state.setMobileSidebarOpen);

  const [server, setServer] = useState<ServerSummary | null>(null);
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('profile');

  // Role management states
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [roleName, setRoleName] = useState('');
  const [roleColor, setRoleColor] = useState('#c9a8ff');
  const [rolePerms, setRolePermissions] = useState('0');
  const [rolesSaving, setRolesSaving] = useState(false);

  // Member roles edit state
  const [editingRolesUserId, setEditingMemberRoles] = useState<string | null>(null);
  const [memberRoleIdsDraft, setMemberRoleIdsDraft] = useState<string[]>([]);
  const [memberRolesSaving, setMemberRolesSaving] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [iconUrl, setIconUrl] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [isPublic, setIsPublic] = useState(false);
  const [loading, setLoading] = useState(false);
  const [membersLoading, setMembersLoading] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string>('');
  const [cropAspect, setCropAspect] = useState<number>(1);
  const [cropType, setCropType] = useState<'icon' | 'banner'>('icon');

  const isOwner = useMemo(
    () => Boolean(server && me && (server.ownerId === me.id || me.systemRole === 'CEO' || me.systemRole === 'MODERATOR')),
    [server, me]
  );

  const selectedRole = useMemo(() => {
    return server?.roles?.find(r => r.id === selectedRoleId) || null;
  }, [server, selectedRoleId]);

  useEffect(() => {
    if (selectedRole) {
      if (roleName !== selectedRole.name) setRoleName(selectedRole.name);
      if (roleColor !== selectedRole.color) setRoleColor(selectedRole.color);
      if (rolePerms !== selectedRole.permissions) setRolePermissions(selectedRole.permissions);
    } else {
      if (roleName !== '') setRoleName('');
      if (roleColor !== '#c9a8ff') setRoleColor('#c9a8ff');
      if (rolePerms !== '0') setRolePermissions('0');
    }
  }, [selectedRole]);

  async function refresh() {
    if (!token || !serverId) return;

    const serverRes = await api(`/api/servers/${serverId}`, {}, token);
    if (serverRes.ok) {
      let data: any = {};
      try {
        const text = await serverRes.text();
        if (text) data = JSON.parse(text);
      } catch(e) {}
      const s = data?.server as ServerSummary | undefined;
      if (s) {
        setServer(s);
        setName(s.name ?? '');
        setDescription(s.description ?? '');
        setIconUrl(s.iconUrl ?? null);
        setBannerUrl(s.bannerUrl ?? null);
        setIsPublic(s.isPublic ?? false);
      }
    }

    setMembersLoading(true);
    try {
      const membersRes = await api(`/api/servers/${serverId}/members`, {}, token);
      if (membersRes.ok) {
        let data: any = {};
        try {
          const text = await membersRes.text();
          if (text) data = JSON.parse(text);
        } catch(e) {}
        const ms = Array.isArray(data?.members) ? (data.members as MemberSummary[]) : [];
        setMembers(ms);
      }
    } finally {
      setMembersLoading(false);
    }
  }

  async function refreshInvites() {
    if (!token || !serverId) return;
    const res = await api(`/api/invites/servers/${serverId}/invites`, {}, token);
    if (res.ok) {
      const data = await res.json();
      setInvites(Array.isArray(data?.invites) ? data.invites : []);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId, token]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (activeTab === 'invites') refreshInvites().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, serverId, token]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !serverId) return;
    setLoading(true);
    try {
      const body: { name?: string; description?: string | null; iconUrl?: string | null; bannerUrl?: string | null; isPublic?: boolean } = {};
      if (name.trim()) body.name = name.trim();
      body.description = description.trim() || null;
      body.iconUrl = iconUrl;
      body.bannerUrl = bannerUrl;
      body.isPublic = isPublic;

      const res = await api(
        `/api/servers/${serverId}`,
        { method: 'PATCH', body: JSON.stringify(body) },
        token
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.message || t('error_saving') || 'Error saving server settings');
        return;
      }

      await refresh();
    } catch (err) {
      console.error(err);
      alert('Failed to save.');
    } finally {
      setLoading(false);
    }
  };

  const handleKick = async (memberUserId: string) => {
    if (!token || !serverId) return;
    if (!confirm(t('kick_confirm') ?? 'Kick this member?')) return;

    const res = await api(
      `/api/servers/${serverId}/members/${memberUserId}`,
      { method: 'DELETE' },
      token
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.message || 'Error kicking member');
      return;
    }
    await refresh();
  };

  const handleBan = async (memberUserId: string) => {
    if (!token || !serverId) return;
    const reason = prompt('Reason for ban? / Grund für den Bann?');
    if (reason === null) return;

    const res = await api(
      `/api/servers/${serverId}/bans/${memberUserId}`,
      { method: 'POST', body: JSON.stringify({ reason }) },
      token
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.message || 'Error banning member');
      return;
    }
    await refresh();
  };

  const handleModeration = async (memberUserId: string, updates: Record<string, any>) => {
    if (!token || !serverId) return;
    const res = await api(
      `/api/servers/${serverId}/members/${memberUserId}/moderation`,
      { method: 'PUT', body: JSON.stringify(updates) },
      token
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.message || 'Error updating member');
      return;
    }
    await refresh();
  };

  const handleLeave = async () => {
    if (!token || !serverId) return;
    if (!confirm(t('leave_confirm') ?? 'Leave server?')) return;

    const res = await api(
      `/api/servers/${serverId}/leave`,
      { method: 'POST' },
      token
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.message || 'Error leaving server');
      return;
    }
    navigate('/app');
  };

  const handleDelete = async () => {
    if (!token || !serverId) return;
    if (!confirm(t('delete_server_confirm') ?? 'Delete this server permanently?')) return;
    const res = await api(`/api/servers/${serverId}`, { method: 'DELETE' }, token);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.message || 'Error deleting server');
      return;
    }
    navigate('/app');
  };

  const handleCreateRole = async () => {
    if (!token || !serverId) return;
    try {
      const res = await api(
        `/api/servers/${serverId}/roles`,
        {
          method: 'POST',
          body: JSON.stringify({ name: 'New Role', color: '#c9a8ff' }),
        },
        token
      );
      if (res.ok) {
        const data = await res.json();
        await refresh();
        setSelectedRoleId(data.role?.id ?? null);
      } else {
        alert('Could not create role');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !serverId || !selectedRoleId) return;
    setRolesSaving(true);
    try {
      const res = await api(
        `/api/servers/${serverId}/roles/${selectedRoleId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            name: roleName,
            color: roleColor,
            permissions: rolePerms,
          }),
        },
        token
      );
      if (res.ok) {
        alert('Role saved successfully!');
        await refresh();
      } else {
        alert('Could not save role');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setRolesSaving(false);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>, type: 'icon' | 'banner') => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setCropImageSrc(url);
    setCropAspect(type === 'icon' ? 1 : 16 / 9);
    setCropType(type);
    setCropModalOpen(true);
    e.target.value = '';
  };

  const handleCropComplete = async (croppedFile: File) => {
    if (!token) return;
    const formData = new FormData();
    formData.append('files', croppedFile);

    try {
      const res = await api('/api/uploads', {
        method: 'POST',
        body: formData,
      }, token);
      
      if (res.ok) {
        const data = await res.json();
        const url = data.attachments?.[0]?.url;
        if (url) {
          if (cropType === 'icon') setIconUrl(url);
          else setBannerUrl(url);
        }
      } else {
        alert('Failed to upload image');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to upload image');
    }
  };

  const handleDeleteRole = async (roleId: string) => {
    if (!token || !serverId) return;
    if (!confirm('Delete this role permanently?')) return;
    try {
      const res = await api(
        `/api/servers/${serverId}/roles/${roleId}`,
        { method: 'DELETE' },
        token
      );
      if (res.ok) {
        setSelectedRoleId(null);
        await refresh();
      } else {
        alert('Could not delete role');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const startEditMemberRoles = (m: MemberSummary) => {
    setEditingMemberRoles(m.userId);
    setMemberRoleIdsDraft(m.roleIds ?? []);
  };

  const handleSaveMemberRoles = async (userId: string) => {
    if (!token || !serverId) return;
    setMemberRolesSaving(true);
    try {
      const res = await api(
        `/api/servers/${serverId}/members/${userId}/roles`,
        {
          method: 'PUT',
          body: JSON.stringify({ roleIds: memberRoleIdsDraft }),
        },
        token
      );
      if (res.ok) {
        setEditingMemberRoles(null);
        await refresh();
      } else {
        alert('Could not update roles');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setMemberRolesSaving(false);
    }
  };

  const togglePermissionInDraft = (flag: bigint, checked: boolean) => {
    const current = BigInt(rolePerms);
    let next;
    if (checked) {
      next = current | flag;
    } else {
      next = current & ~flag;
    }
    setRolePermissions(next.toString());
  };

  const handleCreateInvite = async () => {
    if (!token || !serverId) return;
    const res = await api(
      `/api/invites/servers/${serverId}/invites`,
      {
        method: 'POST',
        body: JSON.stringify({ expiresInHours: 24 * 7 }),
      },
      token
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.message || 'Could not create invite');
      return;
    }
    await refreshInvites();
  };

  const handleDeleteInvite = async (code: string) => {
    if (!token) return;
    const res = await api(`/api/invites/invites/${code}`, { method: 'DELETE' }, token);
    if (!res.ok) {
      alert('Could not delete invite');
      return;
    }
    await refreshInvites();
  };

  const handleCopy = async (code: string) => {
    const url = `${window.location.origin}/invite/${code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch {
      // fallback
      window.prompt('Copy invite link:', url);
    }
  };

  return (
    <div className="flex-1 bg-softspace-950 flex flex-col min-w-0 h-full min-h-0">
      <div className="h-14 border-b border-softspace-800 flex items-center px-4 md:px-6 gap-3 shrink-0">
        <div className="md:hidden flex items-center mr-2">
          <button onClick={() => setMobileSidebarOpen(true)} className="p-1.5 text-softspace-400 hover:text-softspace-100 rounded-lg">
            <Menu size={20} />
          </button>
        </div>
        <h2 className="font-semibold text-softspace-100">{t('server_settings')}</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <ImageCropperModal
          isOpen={cropModalOpen}
          imageSrc={cropImageSrc}
          aspect={cropAspect}
          onClose={() => setCropModalOpen(false)}
          onCropComplete={handleCropComplete}
        />
        <div className="max-w-5xl mx-auto w-full">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-softspace-100">
                {t('server_settings')}
              </h1>
              <p className="text-softspace-400 mt-1">
                {server?.name ?? '...'}
              </p>
            </div>
            {server?.iconUrl && (
              <img
                src={assetUrl(server.iconUrl)}
                alt={server.name}
                className="w-12 h-12 md:w-16 md:h-16 rounded-2xl object-cover border border-softspace-800"
              />
            )}
          </div>

          <div className="flex gap-2 mb-6 border-b border-softspace-800 overflow-x-auto no-scrollbar">
          <TabButton active={activeTab === 'profile'} onClick={() => setActiveTab('profile')}>
            <SettingsIcon size={16} /> {t('profile')}
          </TabButton>
          <TabButton active={activeTab === 'roles'} onClick={() => setActiveTab('roles')}>
            <Shield size={16} /> {t('roles') ?? 'Roles'}
          </TabButton>
          <TabButton active={activeTab === 'members'} onClick={() => setActiveTab('members')}>
            <Users size={16} /> {t('members')} · {members.length}
          </TabButton>
          <TabButton active={activeTab === 'invites'} onClick={() => setActiveTab('invites')}>
            <LinkIcon size={16} /> {t('invites')}
          </TabButton>
        </div>

        {activeTab === 'profile' && server && (
          <div className="bg-softspace-900 border border-softspace-800 rounded-2xl p-6">
            <form onSubmit={handleSave} className="space-y-6">
              
              <div className="flex flex-col md:flex-row gap-6">
                <div className="flex-1 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-softspace-300 mb-2">
                      {t('server_name')}
                    </label>
                    <input
                      value={name}
                      onChange={e => setName(e.target.value)}
                      disabled={!isOwner}
                      className="w-full bg-softspace-950 border border-softspace-800 rounded-xl px-4 py-3 text-softspace-100 focus:outline-none focus:border-softspace-500 transition-colors disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-softspace-300 mb-2">
                      {t('description')}
                    </label>
                    <textarea
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      rows={4}
                      disabled={!isOwner}
                      className="w-full bg-softspace-950 border border-softspace-800 rounded-xl px-4 py-3 text-softspace-100 focus:outline-none focus:border-softspace-500 transition-colors disabled:opacity-50"
                    />
                  </div>

                  {isOwner && (
                    <div>
                      <label className="flex items-center gap-3 p-4 bg-softspace-950 border border-softspace-800 rounded-xl cursor-pointer hover:bg-softspace-800/50 transition-colors">
                        <div className="flex-1">
                          <div className="font-medium text-softspace-100 flex items-center gap-2">
                            <Globe size={16} /> List on Discover
                          </div>
                          <div className="text-sm text-softspace-400 mt-1">
                            Allow anyone to find and join this server from the Discover page.
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={isPublic}
                          onChange={e => setIsPublic(e.target.checked)}
                          className="w-5 h-5 accent-softspace-500 rounded"
                        />
                      </label>
                    </div>
                  )}
                </div>

                <div className="w-full md:w-64 shrink-0 space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-softspace-300 mb-2">
                      Server Icon
                    </label>
                    <div className="relative group rounded-2xl overflow-hidden border border-softspace-800 bg-softspace-950 aspect-square flex items-center justify-center">
                      {iconUrl ? (
                        <img 
                          src={assetUrl(iconUrl)} 
                          alt="Icon" 
                          className="w-full h-full object-cover pointer-events-none select-none" 
                          draggable="false"
                          onContextMenu={(e) => e.preventDefault()}
                        />
                      ) : (
                        <ImageIcon size={32} className="text-softspace-600" />
                      )}
                      {isOwner && (
                        <label className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-sm font-medium text-white">
                          Change
                          <input type="file" accept="image/*" className="hidden" onChange={e => handleImageSelect(e, 'icon')} />
                        </label>
                      )}
                    </div>
                    {isOwner && iconUrl && (
                      <button type="button" onClick={() => setIconUrl(null)} className="mt-2 text-xs text-red-400 hover:text-red-300">
                        Remove Icon
                      </button>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-softspace-300 mb-2">
                      Server Banner
                    </label>
                    <div className="relative group rounded-xl overflow-hidden border border-softspace-800 bg-softspace-950 aspect-video flex items-center justify-center">
                      {bannerUrl ? (
                        <img 
                          src={assetUrl(bannerUrl)} 
                          alt="Banner" 
                          className="w-full h-full object-cover pointer-events-none select-none" 
                          draggable="false"
                          onContextMenu={(e) => e.preventDefault()}
                        />
                      ) : (
                        <ImageIcon size={32} className="text-softspace-600" />
                      )}
                      {isOwner && (
                        <label className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-sm font-medium text-white">
                          Change
                          <input type="file" accept="image/*" className="hidden" onChange={e => handleImageSelect(e, 'banner')} />
                        </label>
                      )}
                    </div>
                    {isOwner && bannerUrl && (
                      <button type="button" onClick={() => setBannerUrl(null)} className="mt-2 text-xs text-red-400 hover:text-red-300">
                        Remove Banner
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {isPublic && (
                <div className="bg-softspace-950 border border-softspace-800 rounded-2xl p-4 overflow-hidden relative mt-6">
                  <h3 className="text-xs font-bold text-softspace-500 uppercase mb-3">Discover Preview</h3>
                  <div className="relative rounded-xl overflow-hidden border border-softspace-800 bg-softspace-900 group">
                    <div className="h-32 bg-softspace-800 relative">
                      {bannerUrl ? (
                        <img src={assetUrl(bannerUrl)} className="w-full h-full object-cover" alt="Banner" />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-r from-softspace-800 to-softspace-700" />
                      )}
                    </div>
                    <div className="p-4 pt-10 relative">
                      <div className="absolute -top-8 left-4 w-16 h-16 rounded-2xl border-4 border-softspace-900 bg-softspace-800 overflow-hidden flex items-center justify-center">
                        {iconUrl ? (
                          <img src={assetUrl(iconUrl)} className="w-full h-full object-cover" alt="Icon" />
                        ) : (
                          <span className="text-xl font-bold text-softspace-400">{name.charAt(0).toUpperCase()}</span>
                        )}
                      </div>
                      <h4 className="font-bold text-softspace-100 truncate text-lg">{name || 'Unnamed Server'}</h4>
                      <p className="text-sm text-softspace-400 mt-1 line-clamp-2">{description || 'No description provided.'}</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-3 pt-4 border-t border-softspace-800">
                {isOwner && (
                  <button
                    type="submit"
                    disabled={loading}
                    className="bg-softspace-500 hover:bg-softspace-400 text-white px-6 py-3 rounded-xl font-medium transition-colors disabled:opacity-50"
                  >
                    {loading ? t('saving') : t('save')}
                  </button>
                )}
                {!isOwner && (
                  <button
                    type="button"
                    onClick={handleLeave}
                    className="bg-red-600/10 hover:bg-red-600/20 text-red-300 px-6 py-3 rounded-xl font-medium transition-colors"
                  >
                    {t('leave_server')}
                  </button>
                )}
                {isOwner && (
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="ml-auto bg-red-600/10 hover:bg-red-600/20 text-red-300 px-6 py-3 rounded-xl font-medium transition-colors"
                  >
                    {t('delete_server')}
                  </button>
                )}
              </div>
            </form>
          </div>
        )}

        {activeTab === 'roles' && server && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Roles List */}
            <div className="bg-softspace-900 border border-softspace-800 rounded-2xl p-4 flex flex-col h-[600px]">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-softspace-100">{t('roles') ?? 'Roles'}</h3>
                {isOwner && (
                  <button
                    type="button"
                    onClick={handleCreateRole}
                    className="text-softspace-400 hover:text-softspace-100 flex items-center gap-1 text-sm font-medium"
                  >
                    <PlusCircle size={16} /> {t('create_role')}
                  </button>
                )}
              </div>
              <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
                {(server.roles ?? []).map(r => (
                  <button
                    type="button"
                    key={r.id}
                    onClick={() => setSelectedRoleId(r.id)}
                    className={`w-full text-left p-3 rounded-xl flex items-center gap-2.5 transition-colors border ${
                      selectedRoleId === r.id
                        ? 'bg-softspace-800 border-softspace-600 text-softspace-100'
                        : 'bg-softspace-950/40 border-transparent text-softspace-300 hover:bg-softspace-850'
                    }`}
                  >
                    <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
                    <span className="truncate font-semibold">{r.name}</span>
                    {r.isDefault && <span className="ml-auto text-[10px] bg-softspace-800 text-softspace-400 px-1.5 py-0.5 rounded font-bold">Default</span>}
                  </button>
                ))}
              </div>
            </div>

            {/* Role Editor */}
            <div className="md:col-span-2 bg-softspace-900 border border-softspace-800 rounded-2xl p-6 h-[600px] flex flex-col">
              {selectedRole ? (
                <form onSubmit={handleSaveRole} className="space-y-4 flex flex-col h-full overflow-hidden">
                  <div className="flex items-center justify-between shrink-0">
                    <h3 className="text-lg font-bold text-softspace-100">
                      Edit Role: <span style={{ color: selectedRole.color }}>{selectedRole.name}</span>
                    </h3>
                    {isOwner && !selectedRole.isDefault && (
                      <button
                        type="button"
                        onClick={() => handleDeleteRole(selectedRole.id)}
                        className="text-red-400 hover:text-red-300 flex items-center gap-1 text-sm font-medium"
                      >
                        <Trash2 size={16} /> Delete Role
                      </button>
                    )}
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                    <div>
                      <label className="block text-sm font-medium text-softspace-300 mb-2">
                        {t('role_name') ?? 'Role Name'}
                      </label>
                      <input
                        value={roleName}
                        onChange={e => setRoleName(e.target.value)}
                        disabled={!isOwner || selectedRole.isDefault}
                        className="w-full bg-softspace-950 border border-softspace-800 rounded-xl px-4 py-2.5 text-softspace-100 focus:outline-none focus:border-softspace-500 transition-colors disabled:opacity-50"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-softspace-300 mb-2">
                        {t('role_color') ?? 'Role Color'}
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={roleColor}
                          onChange={e => setRoleColor(e.target.value)}
                          disabled={!isOwner}
                          className="w-10 h-10 p-0 rounded-lg border-0 bg-transparent cursor-pointer"
                        />
                        <input
                          type="text"
                          value={roleColor}
                          onChange={e => setRoleColor(e.target.value)}
                          disabled={!isOwner}
                          className="w-full bg-softspace-950 border border-softspace-800 rounded-xl px-4 py-2 text-softspace-100 focus:outline-none focus:border-softspace-500 transition-colors disabled:opacity-50 font-mono text-sm"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-softspace-300 mb-2">
                        {t('permissions') ?? 'Permissions'}
                      </label>
                      <div className="space-y-2 bg-softspace-950 p-4 rounded-xl border border-softspace-800">
                          {PERMISSION_FLAGS.map(({ name, key, flag }) => {
                            const isChecked = hasPermissionFlag(rolePerms, flag);
                            return (
                              <label key={flag.toString()} className="flex items-center gap-3 cursor-pointer py-1 select-none">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  disabled={!isOwner}
                                  onChange={e => togglePermissionInDraft(flag, e.target.checked)}
                                  className="w-4 h-4 rounded border-softspace-800 bg-softspace-900 text-softspace-500 focus:ring-0 cursor-pointer"
                                />
                                <span className="text-sm text-softspace-300 font-medium hover:text-softspace-100 transition-colors">
                                  {t(key) ?? name}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t border-softspace-800 shrink-0 mt-4">
                    {isOwner && !selectedRole.isDefault && (
                      <button
                        type="button"
                        onClick={() => handleDeleteRole(selectedRole.id)}
                        className="px-5 py-2.5 rounded-xl text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors font-medium text-sm"
                      >
                        {t('delete_role') ?? 'Delete Role'}
                      </button>
                    )}
                    <button
                      type="submit"
                      disabled={rolesSaving || !isOwner}
                      className="px-5 py-2.5 bg-softspace-500 hover:bg-softspace-400 text-white font-medium rounded-xl transition-colors disabled:opacity-50 text-sm"
                    >
                      {rolesSaving ? t('saving') : (t('save_role') ?? 'Save Role')}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-softspace-500 text-center">
                  <Shield size={48} className="mb-2 opacity-20" />
                  <p>Select a role to configure or create a new one.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'members' && (
          <div className="bg-softspace-900 border border-softspace-800 rounded-2xl p-6">
            {membersLoading ? (
              <div className="text-softspace-500">{t('loading')}...</div>
            ) : (
              <div className="space-y-2">
                {members.map(m => (
                  <div
                    key={m.userId}
                    className="flex items-center justify-between gap-4 bg-softspace-950 border border-softspace-800 rounded-xl p-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-softspace-800 flex items-center justify-center flex-shrink-0 overflow-hidden">
                        {m.user?.avatarUrl ? (
                          <img
                            src={assetUrl(m.user.avatarUrl)}
                            alt={m.user.username}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="font-bold text-softspace-300">
                            {(m.user?.username ?? '?').charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-softspace-100 truncate flex items-center gap-2">
                          {m.user?.displayName || m.user?.username || m.userId}
                          {server?.ownerId === m.userId && (
                            <span className="text-xs bg-amber-500/10 text-amber-300 px-2 py-0.5 rounded-md">
                              {t('owner')}
                            </span>
                          )}
                          {m.user?.pronouns && (
                            <span className="text-xs bg-softspace-800 text-softspace-300 px-2 py-0.5 rounded-md font-normal">
                              {m.user.pronouns}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-softspace-500 truncate">
                          @{m.user?.username || m.userId}
                        </div>

                        {/* Member Roles display */}
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {(m.roleIds ?? []).map(rid => {
                            const role = server?.roles?.find(r => r.id === rid);
                            if (!role || role.isDefault) return null;
                            return (
                              <span
                                key={rid}
                                className="text-[10px] px-2 py-0.5 rounded-full font-bold border"
                                style={{
                                  backgroundColor: `${role.color}15`,
                                  color: role.color,
                                  borderColor: `${role.color}30`
                                }}
                              >
                                {role.name}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {editingRolesUserId === m.userId ? (
                      <div className="bg-softspace-900 border border-softspace-800 rounded-xl p-4 w-full md:w-auto md:max-w-xs shrink-0 space-y-3">
                        <div className="text-xs font-bold text-softspace-300 uppercase">Manage Roles</div>
                        <div className="flex flex-col gap-1.5">
                          {(server?.roles ?? [])
                            .filter(r => !r.isDefault)
                            .map(r => {
                              const isChecked = memberRoleIdsDraft.includes(r.id);
                              return (
                                <button
                                  type="button"
                                  key={r.id}
                                  onClick={() => {
                                    if (isChecked) {
                                      setMemberRoleIdsDraft(prev => prev.filter(id => id !== r.id));
                                    } else {
                                      setMemberRoleIdsDraft(prev => [...prev, r.id]);
                                    }
                                  }}
                                  className="text-left px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer"
                                  style={{
                                    backgroundColor: isChecked ? `${r.color}20` : 'transparent',
                                    color: isChecked ? r.color : '#94a3b8',
                                    borderColor: isChecked ? r.color : '#334155'
                                  }}
                                >
                                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: r.color }} />
                                  <span className="truncate">{r.name}</span>
                                </button>
                              );
                            })}
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleSaveMemberRoles(m.userId)}
                            disabled={memberRolesSaving}
                            className="bg-green-600 hover:bg-green-500 text-white px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingMemberRoles(null)}
                            className="bg-softspace-800 hover:bg-softspace-700 text-softspace-300 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      isOwner && server?.ownerId !== m.userId && (
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => startEditMemberRoles(m)}
                            className="bg-softspace-800 hover:bg-softspace-700 text-softspace-300 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
                          >
                            Roles
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const min = prompt('Timeout duration in minutes? (0 to clear) / Timeout in Minuten? (0 zum Löschen)');
                              if (min === null) return;
                              const minutes = parseInt(min, 10);
                              if (isNaN(minutes)) return;
                              const timeoutUntil = minutes > 0 ? new Date(Date.now() + minutes * 60 * 1000).toISOString() : null;
                              handleModeration(m.userId, { timeoutUntil });
                            }}
                            className={`${m.timeoutUntil && new Date(m.timeoutUntil) > new Date() ? 'bg-amber-600/20 text-amber-300 hover:bg-amber-600/30' : 'bg-softspace-800 hover:bg-softspace-700 text-softspace-300'} px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer`}
                          >
                            Timeout
                          </button>
                          <button
                            type="button"
                            onClick={() => handleModeration(m.userId, { isMuted: !m.isMuted })}
                            className={`${m.isMuted ? 'bg-red-600/20 text-red-300 hover:bg-red-600/30' : 'bg-softspace-800 hover:bg-softspace-700 text-softspace-300'} px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer`}
                          >
                            Mute
                          </button>
                          <button
                            type="button"
                            onClick={() => handleModeration(m.userId, { isDeafened: !m.isDeafened })}
                            className={`${m.isDeafened ? 'bg-red-600/20 text-red-300 hover:bg-red-600/30' : 'bg-softspace-800 hover:bg-softspace-700 text-softspace-300'} px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer`}
                          >
                            Deafen
                          </button>
                          <button
                            type="button"
                            onClick={() => handleKick(m.userId)}
                            className="bg-red-600/10 hover:bg-red-600/20 text-red-300 px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
                          >
                            {t('kick')}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleBan(m.userId)}
                            className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
                          >
                            Ban
                          </button>
                        </div>
                      )
                    )}
                  </div>
                ))}
                {members.length === 0 && (
                  <div className="text-softspace-500">{t('no_members')}</div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'invites' && (
          <div className="bg-softspace-900 border border-softspace-800 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-softspace-400">{t('invites_subtitle')}</p>
              <button
                type="button"
                onClick={handleCreateInvite}
                className="flex items-center gap-2 bg-softspace-500 hover:bg-softspace-400 text-white px-4 py-2 rounded-xl font-medium transition-colors"
              >
                <Plus size={16} /> {t('create_invite')}
              </button>
            </div>

            {invites.length === 0 ? (
              <div className="text-softspace-500 text-center py-12">{t('no_invites')}</div>
            ) : (
              <div className="space-y-2">
                {invites.map(inv => {
                  const url = `${window.location.origin}/invite/${inv.code}`;
                  const isCopied = copiedCode === inv.code;
                  return (
                    <div
                      key={inv.code}
                      className="bg-softspace-950 border border-softspace-800 rounded-xl p-3 flex items-center gap-3"
                    >
                      <code className="flex-1 text-softspace-100 truncate font-mono text-sm">
                        {url}
                      </code>
                      <span className="text-xs text-softspace-500 shrink-0">
                        {inv.uses}{inv.maxUses ? ` / ${inv.maxUses}` : ''} {t('uses')}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy(inv.code)}
                        className="px-3 py-2 bg-softspace-800 hover:bg-softspace-700 text-softspace-100 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
                      >
                        {isCopied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                        {isCopied ? t('copied') : t('copy')}
                      </button>
                      {isOwner && (
                        <button
                          type="button"
                          onClick={() => handleDeleteInvite(inv.code)}
                          className="px-3 py-2 bg-red-600/10 hover:bg-red-600/20 text-red-300 rounded-lg text-sm font-medium transition-colors"
                          aria-label={t('delete') ?? 'Delete'}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}


function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-3 -mb-px border-b-2 font-medium text-sm transition-colors whitespace-nowrap shrink-0 ${active
          ? 'border-softspace-500 text-softspace-100'
          : 'border-transparent text-softspace-400 hover:text-softspace-200 hover:border-softspace-700'
        }`}
    >
      {children}
    </button>
  );
}
