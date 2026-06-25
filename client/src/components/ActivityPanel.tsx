import { useTranslation } from 'react-i18next';
import { parseActivities, formatRecentActivityLabelForEntry } from '../lib/activities';
import { RichPresenceDisplay } from './RichPresenceDisplay';

type Props = {
  activitiesRaw?: string | null;
};

export function ActivityPanel({ activitiesRaw }: Props) {
  const { t } = useTranslation();
  const payload = parseActivities(activitiesRaw);

  if (!payload || (payload.active.length === 0 && payload.recent.length === 0)) {
    return (
      <div className="rounded-xl border border-dashed border-softspace-800 bg-softspace-950/40 px-4 py-8 text-center">
        <p className="text-sm text-softspace-400">{t('activity_none_title')}</p>
        <p className="text-xs text-softspace-500 mt-1">{t('activity_none_hint')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-h-[22rem] overflow-y-auto pr-1">
      {payload.active.length > 0 && (
        <section>
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-softspace-400 mb-2">
            {t('activity_section_active')}
          </h3>
          <div className="space-y-2">
            {payload.active.map((entry) => (
              <RichPresenceDisplay
                key={`active-${entry.id}`}
                data={entry.presence}
                compact={false}
                stacked
              />
            ))}
          </div>
        </section>
      )}

      {payload.recent.length > 0 && (
        <section>
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-softspace-400 mb-2">
            {t('activity_section_recent')}
          </h3>
          <div className="space-y-2">
            {payload.recent.map((entry) => (
              <div key={`recent-${entry.id}-${entry.endedAt}`} className="opacity-80">
                <RichPresenceDisplay data={entry.presence} compact={false} stacked dimmed />
                <div className="text-[10px] text-softspace-500 mt-1 px-1">
                  {formatRecentActivityLabelForEntry(entry)}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
