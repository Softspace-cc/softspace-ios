type BadgeId = 'super-gay' | 'kissed-the-ceo' | 'certified-bird';

type BadgeDefinition = {
  id: BadgeId;
  label: string;
  icon: string;
  className: string;
};

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  {
    id: 'super-gay',
    label: 'Super Gay',
    icon: '🏳️‍🌈',
    className: 'bg-purple-600',
  },
  {
    id: 'kissed-the-ceo',
    label: 'Kissed The CEO',
    icon: '💗',
    className: 'bg-pink-600',
  },
  {
    id: 'certified-bird',
    label: 'Certified Bird',
    icon: '🐦',
    className: 'bg-blue-600',
  },
];

export function getBadgeDefinition(id: string) {
  return BADGE_DEFINITIONS.find((badge) => badge.id === id);
}

export function UserBadges({
  badges,
  variant = 'full',
}: {
  badges?: string[] | null;
  variant?: 'full' | 'compact';
}) {
  if (!badges?.length) return null;

  return (
    <>
      {badges.map((badgeId) => {
        const badge = getBadgeDefinition(badgeId);
        if (!badge) return null;

        return (
          <span
            key={badge.id}
            className={`flex items-center text-white rounded font-bold uppercase shrink-0 ${
              badge.className
            } ${
              variant === 'compact' ? 'px-1.5 py-0.5 text-[10px] gap-1' : 'px-2 py-0.5 text-xs gap-1.5'
            }`}
            title={badge.label}
          >
            <span aria-hidden="true" className={variant === 'compact' ? 'text-[9px]' : 'text-[10px]'}>
              {badge.icon}
            </span>
            <span className="leading-none">
              {badge.label}
            </span>
          </span>
        );
      })}
    </>
  );
}
