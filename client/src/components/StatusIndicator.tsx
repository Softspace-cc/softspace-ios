import { Globe, Monitor, Smartphone } from 'lucide-react';

export type UserPlatform = 'web' | 'desktop' | 'mobile' | null | undefined;

type Props = {
  status?: string | null;
  platform?: UserPlatform;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  borderClassName?: string;
};

function normalizeStatus(status?: string | null) {
  if (!status || status === 'offline' || status === 'invisible') {
    return 'offline';
  }

  if (status === 'online' || status === 'idle' || status === 'dnd') {
    return status;
  }

  return 'offline';
}

function normalizePlatform(platform?: UserPlatform) {
  if (platform === 'desktop') return 'desktop';
  if (platform === 'mobile') return 'mobile';
  return 'web';
}

function getStatusClasses(status?: string | null) {
  switch (normalizeStatus(status)) {
    case 'online':
      return 'text-green-400';
    case 'idle':
      return 'text-amber-400';
    case 'dnd':
      return 'text-red-400';
    default:
      return 'text-softspace-500';
  }
}

function getContainerClasses(size: Props['size']) {
  switch (size) {
    case 'sm':
      return 'w-3.5 h-3.5';
    case 'lg':
      return 'w-5 h-5';
    default:
      return 'w-4 h-4';
  }
}

function getIconSize(size: Props['size']) {
  switch (size) {
    case 'sm':
      return 8;
    case 'lg':
      return 11;
    default:
      return 9;
  }
}

export function getDisplayStatus(status?: string | null) {
  return normalizeStatus(status);
}

export default function StatusIndicator({
  status,
  platform,
  size = 'md',
  className = '',
  borderClassName = 'border-softspace-900',
}: Props) {
  const displayStatus = normalizeStatus(status);

  if (displayStatus === 'offline') {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-full border-2 bg-softspace-900 ${getContainerClasses(size)} ${borderClassName} ${className}`.trim()}
      >
        <span className="w-full h-full rounded-full bg-softspace-500" />
      </span>
    );
  }

  const platformName = normalizePlatform(platform);
  const Icon = platformName === 'desktop' ? Monitor : platformName === 'mobile' ? Smartphone : Globe;

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full border-2 bg-softspace-900 ${getContainerClasses(size)} ${borderClassName} ${className}`.trim()}
    >
      <Icon size={getIconSize(size)} strokeWidth={2.5} className={getStatusClasses(displayStatus)} />
    </span>
  );
}
