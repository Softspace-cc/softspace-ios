import { useState, useEffect } from 'react';
import { Shield, Mail, MessageSquare, AlertTriangle, CheckCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/useAuthStore';
import { api, assetUrl } from '../lib/api';

type ModUser = {
  id: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  systemRole: string;
};

export default function TrainModsPage() {
  const { t } = useTranslation();
  const me = useAuthStore(state => state.user);
  const token = useAuthStore(state => state.token);
  const [mods, setMods] = useState<ModUser[]>([]);
  const [showTraining, setShowTraining] = useState(false);

  useEffect(() => {
    if (me?.systemRole !== 'CEO') {
      // If a regular mod visits, just show them the training
      if (me?.systemRole === 'MODERATOR') {
        setShowTraining(true);
      }
      return;
    }

    // Fetch mods if CEO
    api('/api/users/badge-admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ adminPassword: 'J4m!e2025#Go' })
    })
    .then(res => res.json())
    .then(data => {
      const allUsers = data.users || [];
      const onlyMods = allUsers.filter((u: any) => u.systemRole === 'MODERATOR');
      setMods(onlyMods);
    })
    .catch(console.error);
  }, [me, token]);

  if (me?.systemRole !== 'CEO' && me?.systemRole !== 'MODERATOR') {
    return <div className="h-full flex items-center justify-center p-8 text-center text-red-400 font-bold">{t('train_mods_no_access')}</div>;
  }

  if (showTraining) {
    return <TrainingView onClose={() => {
      if (me?.systemRole === 'CEO') setShowTraining(false);
      else alert(t('train_mods_alert_done'));
    }} isTest={me?.systemRole === 'CEO'} />;
  }

  return (
    <div className="flex h-full min-h-0 bg-softspace-950 text-softspace-50 flex-col p-4 md:p-8 overflow-y-auto">
      <div className="max-w-4xl mx-auto w-full">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Shield className="text-orange-500" size={32} />
              {t('train_mods_title')}
            </h1>
            <p className="text-softspace-400 mt-2">{t('train_mods_desc')}</p>
          </div>
          <button
            onClick={() => setShowTraining(true)}
            className="bg-orange-600 hover:bg-orange-500 text-white px-6 py-3 rounded-xl font-bold transition-colors shrink-0"
          >
            {t('train_mods_test_btn')}
          </button>
        </div>

        <div className="bg-softspace-900 border border-softspace-800 rounded-3xl p-6">
          <h2 className="text-xl font-bold mb-4">{t('train_mods_team')}</h2>
          <div className="space-y-3">
            {mods.map(mod => (
              <div key={mod.id} className="flex items-center justify-between bg-softspace-950 border border-softspace-800 rounded-xl p-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-softspace-800 rounded-full flex items-center justify-center overflow-hidden border border-orange-500/50">
                    {mod.avatarUrl ? (
                      <img src={assetUrl(mod.avatarUrl)} alt={mod.username} className="w-full h-full object-cover" />
                    ) : (
                      <span className="font-bold text-softspace-400">{mod.username.charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <div>
                    <h3 className="font-bold">{mod.displayName || mod.username}</h3>
                    <p className="text-sm text-softspace-400">@{mod.username}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                   <div className="px-3 py-1 rounded-lg bg-orange-500/20 text-orange-400 text-xs font-bold border border-orange-500/30 uppercase">
                     {mod.systemRole}
                   </div>
                </div>
              </div>
            ))}
            {mods.length === 0 && (
              <p className="text-softspace-500 text-center py-8">{t('train_mods_loading')}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TrainingView({ onClose, isTest }: { onClose: () => void, isTest: boolean }) {
  const { t } = useTranslation();
  const [quizAnswered, setQuizAnswered] = useState(false);
  const [banDecision, setBanDecision] = useState<string>('');
  const [banDuration, setBanDuration] = useState<string>('');
  const [banReason, setBanReason] = useState<string>('');

  const submitQuiz = () => {
    if (!banDecision) return alert(t('train_mods_alert_decision'));
    if (banDecision === 'yes' && (!banDuration || !banReason)) return alert(t('train_mods_alert_reason'));
    setQuizAnswered(true);
  };

  return (
    <div className="flex h-full min-h-0 bg-softspace-950 text-softspace-50 flex-col overflow-y-auto">
      <div className="max-w-3xl mx-auto w-full p-4 md:p-8 space-y-8">
        {isTest && (
          <div className="bg-orange-500/20 border border-orange-500 text-orange-300 px-4 py-3 rounded-xl font-bold flex flex-col md:flex-row justify-between items-center gap-3 text-sm text-center md:text-left">
            <span>{t('train_mods_test_mode')}</span>
            <button onClick={onClose} className="bg-orange-500 text-white px-4 py-1.5 rounded-lg hover:bg-orange-600 transition-colors shrink-0">
              {t('train_mods_back')}
            </button>
          </div>
        )}

        <div className="text-center space-y-4 mb-12">
          <Shield className="w-20 h-20 text-orange-500 mx-auto" />
          <h1 className="text-3xl md:text-4xl font-black text-white">{t('train_mods_welcome_title')}</h1>
          <p className="text-lg md:text-xl text-softspace-400">{t('train_mods_welcome_desc')}</p>
        </div>

        {/* Section 1: Email */}
        <section className="bg-softspace-900 border border-softspace-800 rounded-3xl p-6 md:p-8">
          <div className="flex items-center gap-3 mb-4">
            <Mail className="text-blue-400" size={28} />
            <h2 className="text-xl md:text-2xl font-bold">{t('train_mods_sec1_title')}</h2>
          </div>
          <p className="text-softspace-300 leading-relaxed mb-6" dangerouslySetInnerHTML={{ __html: t('train_mods_sec1_desc') }} />
          <div className="bg-softspace-950 p-5 rounded-2xl border border-softspace-800 space-y-3 font-mono text-sm">
            <p className="flex flex-col md:flex-row md:gap-2"><span className="text-softspace-500 w-32">{t('train_mods_sec1_login')}</span> <a href="https://mail.zoho.eu/zm/" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline break-all">https://mail.zoho.eu/zm/</a></p>
            <p className="flex flex-col md:flex-row md:gap-2"><span className="text-softspace-500 w-32">{t('train_mods_sec1_username')}</span> <span className="text-softspace-100"><i>deinname</i>@softspace.cc</span></p>
            <p className="flex flex-col md:flex-row md:gap-2"><span className="text-softspace-500 w-32">{t('train_mods_sec1_password')}</span> <span className="text-softspace-100">{t('train_mods_sec1_pwd_hint')}</span></p>
          </div>
        </section>

        {/* Section 2: Teamchat */}
        <section className="bg-softspace-900 border border-softspace-800 rounded-3xl p-6 md:p-8">
          <div className="flex items-center gap-3 mb-4">
            <MessageSquare className="text-green-400" size={28} />
            <h2 className="text-xl md:text-2xl font-bold">{t('train_mods_sec2_title')}</h2>
          </div>
          <p className="text-softspace-300 leading-relaxed text-lg" dangerouslySetInnerHTML={{ __html: t('train_mods_sec2_desc') }} />
        </section>

        {/* Section 3: Rules */}
        <section className="bg-softspace-900 border border-softspace-800 rounded-3xl p-6 md:p-8">
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle className="text-red-400" size={28} />
            <h2 className="text-xl md:text-2xl font-bold">{t('train_mods_sec3_title')}</h2>
          </div>
          <p className="text-softspace-300 leading-relaxed text-lg" dangerouslySetInnerHTML={{ __html: t('train_mods_sec3_desc') }} />
        </section>

        {/* Section 4: Quiz */}
        <section className="bg-softspace-900 border-2 border-orange-500/30 rounded-3xl p-6 md:p-8 relative overflow-hidden">
          <div className="flex items-center gap-3 mb-6">
            <CheckCircle className="text-orange-400" size={28} />
            <h2 className="text-xl md:text-2xl font-bold">{t('train_mods_sec4_title')}</h2>
          </div>
          
          <div className="bg-softspace-950 p-6 rounded-2xl border border-softspace-800 mb-8">
            <h3 className="font-bold text-lg mb-2 text-orange-300">{t('train_mods_sec4_scenario')}</h3>
            <p className="text-softspace-300 italic text-lg leading-relaxed">
              {t('train_mods_sec4_scenario_text')}
            </p>
          </div>

          {!quizAnswered ? (
            <div className="space-y-8">
              <div>
                <label className="block font-bold text-lg mb-4">{t('train_mods_sec4_q1')}</label>
                <div className="flex flex-col gap-3">
                  <label className="flex items-center gap-3 cursor-pointer bg-softspace-950 p-4 rounded-xl border border-softspace-800 hover:border-orange-500/50 transition-colors">
                    <input type="radio" name="decision" value="yes" onChange={(e) => setBanDecision(e.target.value)} className="w-5 h-5 accent-orange-500" />
                    <span className="font-medium text-lg">{t('train_mods_sec4_a1_yes')}</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer bg-softspace-950 p-4 rounded-xl border border-softspace-800 hover:border-orange-500/50 transition-colors">
                    <input type="radio" name="decision" value="no" onChange={(e) => setBanDecision(e.target.value)} className="w-5 h-5 accent-orange-500" />
                    <span className="font-medium text-lg">{t('train_mods_sec4_a1_no')}</span>
                  </label>
                </div>
              </div>

              {banDecision === 'yes' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-top-4 bg-softspace-950 p-6 rounded-2xl border border-softspace-800">
                  <div>
                    <label className="block font-bold text-lg mb-3">{t('train_mods_sec4_q2')}</label>
                    <select value={banDuration} onChange={e => setBanDuration(e.target.value)} className="w-full bg-softspace-900 border border-softspace-700 rounded-xl px-4 py-4 outline-none focus:border-orange-500 text-lg">
                      <option value="">{t('train_mods_sec4_a2_select')}</option>
                      <option value="60">{t('train_mods_sec4_a2_1h')}</option>
                      <option value="1440">{t('train_mods_sec4_a2_24h')}</option>
                      <option value="permanent">{t('train_mods_sec4_a2_perm')}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold text-lg mb-3">{t('train_mods_sec4_q3')}</label>
                    <input 
                      type="text" 
                      value={banReason} 
                      onChange={e => setBanReason(e.target.value)} 
                      placeholder={t('train_mods_sec4_reason_placeholder')}
                      className="w-full bg-softspace-900 border border-softspace-700 rounded-xl px-4 py-4 outline-none focus:border-orange-500 text-lg"
                    />
                  </div>
                </div>
              )}

              <button 
                onClick={submitQuiz}
                className="w-full bg-orange-600 hover:bg-orange-500 text-white font-bold py-5 rounded-2xl transition-colors mt-6 text-lg shadow-lg shadow-orange-900/20"
              >
                {t('train_mods_sec4_submit')}
              </button>
            </div>
          ) : (
            <div className="bg-green-500/10 border border-green-500/50 text-green-300 p-8 rounded-2xl text-center animate-in zoom-in-95">
              <CheckCircle size={56} className="mx-auto mb-4 text-green-400" />
              <h3 className="text-3xl font-bold mb-4">{t('train_mods_sec4_success_title')}</h3>
              <p className="text-lg leading-relaxed text-green-100/80" dangerouslySetInnerHTML={{ __html: t('train_mods_sec4_success_desc') }} />
            </div>
          )}
        </section>

        {/* Footer actions */}
        <div className="flex justify-center pt-8 pb-20">
          {quizAnswered && !isTest ? (
            <button onClick={onClose} className="bg-softspace-100 text-softspace-900 font-black px-8 py-5 rounded-2xl hover:bg-white transition-all hover:scale-105 shadow-[0_0_30px_rgba(255,255,255,0.2)] text-lg">
              {t('train_mods_finish')}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
