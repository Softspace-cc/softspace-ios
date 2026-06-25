import { useMemo, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Hash,
  Mic,
  MicOff,
  ScreenShare,
  Video,
  PlusCircle,
  Settings,
  GripVertical,
  Folder,
  Plus,
} from 'lucide-react';
import { useChatStore, type VoiceMember } from '../store/useChatStore';
import { api, assetUrl } from '../lib/api';
import {
  buildChannelTree,
  flattenChannelTree,
  moveChannelLayout,
  type DropPlacement,
} from '../lib/channelLayout';

import { useLayoutStore } from '../store/useLayoutStore';

import { UserWidget } from './UserWidget';

export type ChannelInfo = {
  id: string;
  serverId: string;
  name: string;
  type: 'TEXT' | 'VOICE' | 'CATEGORY' | string;
  topic?: string | null;
  parentId?: string | null;
  position: number;
  permissionOverrides?: string | null;
};

export type ServerInfo = {
  id: string;
  name: string;
  ownerId?: string;
  bannerUrl?: string | null;
  channels?: ChannelInfo[] | null;
};

type DropTarget = { id: string; placement: DropPlacement };

export function ChannelSidebar({
  server,
  serverId,
  activeId,
  token,
  canManageChannels,
  onCreate,
  onCreateInCategory,
  onEditChannel,
  onChannelsChange,
}: {
  server: ServerInfo | null;
  serverId: string;
  activeId: string;
  token: string | null;
  canManageChannels: boolean;
  onCreate: () => void;
  onCreateInCategory?: (categoryId: string) => void;
  onEditChannel?: (c: ChannelInfo) => void;
  onChannelsChange: (channels: ChannelInfo[]) => void;
}) {
  const { t } = useTranslation();
  const setActiveChannel = useChatStore((state) => state.setActiveChannel);
  const voiceStates = useChatStore((state) => state.voiceStates);
  const setMobileChannelSidebarOpen = useLayoutStore((state) => state.setMobileChannelSidebarOpen);
  const unreads = useChatStore((state) => state.unreads);

  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const channels = server?.channels ?? [];
  const tree = useMemo(() => buildChannelTree(channels), [channels]);

  const persistReorder = useCallback(
    async (nextChannels: ChannelInfo[]) => {
      if (!token) return;
      const items = flattenChannelTree(buildChannelTree(nextChannels));
      setIsSaving(true);
      onChannelsChange(nextChannels);
      try {
        const res = await api(
          `/api/servers/${serverId}/channels/reorder`,
          { method: 'PUT', body: JSON.stringify({ items }) },
          token
        );
        if (!res.ok) {
          onChannelsChange(channels);
        }
      } catch {
        onChannelsChange(channels);
      } finally {
        setIsSaving(false);
      }
    },
    [token, serverId, channels, onChannelsChange]
  );

  const handleDrop = useCallback(
    (targetId: string, placement: DropPlacement) => {
      if (!dragId || dragId === targetId) {
        setDragId(null);
        setDropTarget(null);
        return;
      }
      const next = moveChannelLayout(channels, dragId, targetId, placement) as ChannelInfo[];
      setDragId(null);
      setDropTarget(null);
      void persistReorder(next);
    },
    [dragId, channels, persistReorder]
  );

  const setDrop = (target: DropTarget | null) => {
    if (!dragId) return;
    setDropTarget(target);
  };

  const dropLine = (targetId: string, placement: DropPlacement, indent = 0) => {
    const active =
      dropTarget?.id === targetId && dropTarget.placement === placement;
    if (!dragId || !active) return null;
    return (
      <div
        className="h-0.5 bg-softspace-400 rounded-full my-0.5 pointer-events-none"
        style={{ marginLeft: indent * 12 }}
      />
    );
  };

  const renderChannelRow = (c: ChannelInfo, indent = 0) => {
    const voiceMembers = c.type === 'VOICE' ? voiceStates[c.id] ?? [] : [];
    const draggable = canManageChannels && c.type !== 'CATEGORY';
    const unreadCount = unreads[c.id] ?? 0;
    const hasUnread = unreadCount > 0;

    return (
      <div key={c.id}>
        {dropLine(c.id, 'before', indent)}
        <div
          draggable={draggable}
          onDragStart={(e) => {
            if (!draggable) return;
            setDragId(c.id);
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', c.id);
          }}
          onDragEnd={() => {
            setDragId(null);
            setDropTarget(null);
          }}
          onDragOver={(e) => {
            if (!dragId || dragId === c.id) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const placement: DropPlacement =
              e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
            setDrop({ id: c.id, placement });
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (!dropTarget || dropTarget.id !== c.id) {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              handleDrop(c.id, e.clientY < rect.top + rect.height / 2 ? 'before' : 'after');
              return;
            }
            handleDrop(dropTarget.id, dropTarget.placement);
          }}
          className={`group/btn w-full flex items-center gap-1 p-2 rounded-xl transition-all text-sm relative ${
            c.id === activeId
              ? 'bg-softspace-800 text-softspace-100 font-semibold'
              : hasUnread
                ? 'bg-softspace-800/40 text-softspace-100 font-bold'
                : 'hover:bg-softspace-800/40 text-softspace-300 hover:text-softspace-100'
          } ${dragId === c.id ? 'opacity-40' : ''}`}
          style={{ paddingLeft: 8 + indent * 12 }}
        >
          {canManageChannels && (
            <span
              className="opacity-0 group-hover/btn:opacity-60 cursor-grab active:cursor-grabbing shrink-0 text-softspace-500"
              title={t('drag_to_reorder')}
            >
              <GripVertical size={14} />
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              setActiveChannel(serverId, c.id);
              setMobileChannelSidebarOpen(false);
            }}
            className="flex-1 flex items-center gap-2 min-w-0 text-left cursor-pointer"
          >
            {c.type === 'VOICE' ? (
              <Mic size={16} className="text-softspace-400 shrink-0" />
            ) : (
              <Hash size={16} className="text-softspace-400 shrink-0" />
            )}
            <span className={`truncate flex-1 ${hasUnread ? 'font-bold text-white' : ''}`}>{c.name}</span>
            {voiceMembers.length > 0 && (
              <span className="text-xs bg-softspace-950 text-softspace-400 px-1.5 py-0.5 rounded font-bold shrink-0">
                {voiceMembers.length}
              </span>
            )}
            {hasUnread && (
              <span className="bg-red-500 text-white text-[10px] font-bold rounded-full h-5 min-w-[20px] px-1.5 flex items-center justify-center shrink-0">
                {unreadCount}
              </span>
            )}
          </button>
          {canManageChannels && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEditChannel?.(c);
              }}
              className="opacity-0 group-hover/btn:opacity-100 p-1 hover:bg-softspace-700 hover:text-softspace-100 text-softspace-400 rounded-md transition-all cursor-pointer shrink-0"
              title={t('channel_settings')}
            >
              <Settings size={13} />
            </button>
          )}
        </div>
        {dropLine(c.id, 'after', indent)}
        {voiceMembers.length > 0 && (
          <div className="ml-4 mt-0.5 mb-1 space-y-0.5">
            {voiceMembers.map((m) => (
              <VoiceRosterRow key={m.userId} member={m} />
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderCategory = (cat: ChannelInfo, children: ChannelInfo[]) => {
    const draggable = canManageChannels;
    const isDropInside =
      dropTarget?.id === cat.id && dropTarget.placement === 'inside';

    return (
      <div key={cat.id} className="space-y-0.5">
        {dropLine(cat.id, 'before')}
        <div
          draggable={draggable}
          onDragStart={(e) => {
            if (!draggable) return;
            setDragId(cat.id);
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', cat.id);
          }}
          onDragEnd={() => {
            setDragId(null);
            setDropTarget(null);
          }}
          onDragOver={(e) => {
            if (!dragId || dragId === cat.id) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            const dragged = channels.find((c) => c.id === dragId);
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const y = e.clientY - rect.top;
            if (dragged?.type !== 'CATEGORY' && y > rect.height * 0.35) {
              setDrop({ id: cat.id, placement: 'inside' });
            } else {
              setDrop({
                id: cat.id,
                placement: y < rect.height / 2 ? 'before' : 'after',
              });
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (dropTarget?.id === cat.id) {
              handleDrop(dropTarget.id, dropTarget.placement);
            }
          }}
          className={`group/cat px-2 py-1 text-[11px] font-bold text-softspace-400 hover:text-softspace-200 uppercase tracking-wider flex items-center gap-1 transition-colors rounded-lg ${
            dragId === cat.id ? 'opacity-40' : ''
          } ${isDropInside ? 'bg-softspace-800/60 ring-1 ring-softspace-500/40' : ''}`}
        >
          {canManageChannels && (
            <span className="opacity-0 group-hover/cat:opacity-60 cursor-grab active:cursor-grabbing shrink-0">
              <GripVertical size={12} />
            </span>
          )}
          <Folder size={12} className="shrink-0" />
          <span className="truncate flex-1">{cat.name}</span>
          {canManageChannels && (
            <>
              <button
                type="button"
                onClick={() => onCreateInCategory?.(cat.id)}
                className="opacity-0 group-hover/cat:opacity-100 hover:text-softspace-100 transition-opacity cursor-pointer p-0.5"
                title={t('add_channel_to_category')}
              >
                <Plus size={12} />
              </button>
              <button
                type="button"
                onClick={() => onEditChannel?.(cat)}
                className="opacity-0 group-hover/cat:opacity-100 hover:text-softspace-100 transition-opacity cursor-pointer p-0.5"
                title={t('category_settings')}
              >
                <Settings size={11} />
              </button>
            </>
          )}
        </div>
        {dropLine(cat.id, 'after')}
        <div
          className={`space-y-0.5 pl-1 min-h-[4px] rounded-lg transition-colors ${
            isDropInside ? 'bg-softspace-800/30' : ''
          }`}
          onDragOver={(e) => {
            if (!dragId) return;
            const dragged = channels.find((c) => c.id === dragId);
            if (dragged?.type === 'CATEGORY') return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            setDrop({ id: cat.id, placement: 'inside' });
          }}
          onDrop={(e) => {
            e.preventDefault();
            handleDrop(cat.id, 'inside');
          }}
        >
          {children.length === 0 && dragId && (
            <div className="px-3 py-2 text-[10px] text-softspace-500 border border-dashed border-softspace-700 rounded-lg text-center">
              {t('drop_channel_here')}
            </div>
          )}
          {children.map((child) => renderChannelRow(child, 1))}
        </div>
      </div>
    );
  };

  return (
    <div className="w-60 bg-softspace-900 border-r border-softspace-800 flex flex-col h-full">
      {server?.bannerUrl ? (
        <div className="h-32 relative shrink-0">
          <img 
            src={assetUrl(server.bannerUrl)} 
            alt="Server Banner" 
            className="w-full h-full object-cover pointer-events-none select-none" 
            draggable="false"
            onContextMenu={(e) => e.preventDefault()}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-softspace-900/90 to-transparent flex items-end px-4 pb-2">
            <div className="font-bold text-white truncate drop-shadow-md flex-1 flex items-center justify-between">
              <span className="truncate">{server.name}</span>
              {isSaving && <span className="ml-2 text-[10px] text-softspace-300 font-normal shrink-0">{t('saving')}…</span>}
            </div>
          </div>
        </div>
      ) : (
        <div className="h-14 border-b border-softspace-800 flex items-center px-4 font-semibold text-softspace-100 truncate shrink-0">
          {server?.name || '...'}
          {isSaving && (
            <span className="ml-auto text-[10px] text-softspace-500 font-normal">{t('saving')}…</span>
          )}
        </div>
      )}
      <div
        className="flex-1 overflow-y-auto p-2 space-y-1"
        onDragOver={(e) => {
          if (!dragId) return;
          e.preventDefault();
        }}
      >
        {tree.map((node) =>
          node.kind === 'category'
            ? renderCategory(node.channel as ChannelInfo, node.children as ChannelInfo[])
            : renderChannelRow(node.channel as ChannelInfo)
        )}
        {tree.length === 0 && (
          <p className="text-xs text-softspace-500 text-center py-4">{t('no_channels')}</p>
        )}
      </div>
      {canManageChannels && (
        <button
          type="button"
          onClick={onCreate}
          className="m-2 mt-0 px-3 py-2 bg-softspace-800 hover:bg-softspace-700 text-softspace-200 rounded-xl text-sm font-medium flex items-center justify-center gap-2 border border-softspace-700/50 cursor-pointer"
        >
          <PlusCircle size={16} />
          {t('create_channel')}
        </button>
      )}
      <UserWidget />
    </div>
  );
}

function VoiceRosterRow({ member }: { member: VoiceMember }) {
  const name = member.user?.displayName || member.user?.username || member.userId;
  const initials = (member.user?.username ?? member.userId).charAt(0).toUpperCase();
  return (
    <div className="flex items-center gap-2 px-2 py-1 rounded-lg text-softspace-300">
      <div className="w-6 h-6 rounded-full bg-softspace-800 flex items-center justify-center overflow-hidden shrink-0">
        {member.user?.avatarUrl ? (
          <img
            src={assetUrl(member.user.avatarUrl)}
            alt={name}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-[10px] font-bold text-softspace-300">{initials}</span>
        )}
      </div>
      <span className="truncate text-xs flex-1">{name}</span>
      {member.user?.systemRole === 'CEO' && (
        <span className="text-[9px] bg-orange-500 text-white px-1 py-0.5 rounded font-bold uppercase shrink-0">
          CEO
        </span>
      )}
      <div className="ml-auto flex items-center gap-1 shrink-0 pl-1">
        {member.muted && <MicOff size={12} className="text-red-300" />}
        {member.screen && <ScreenShare size={12} className="text-indigo-300" />}
        {member.video && <Video size={12} className="text-emerald-300" />}
      </div>
    </div>
  );
}
