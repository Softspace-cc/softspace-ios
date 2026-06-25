import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import {
  Heart,
  ArrowDownUp
} from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';

export default function LandingPage() {
  const { t, i18n } = useTranslation();
  const token = useAuthStore(state => state.token);
  const navigate = useNavigate();

  useEffect(() => {
    // @ts-ignore
    if (window.electron) {
      if (token) {
        navigate('/app');
      } else {
        navigate('/auth');
      }
    }
  }, [navigate, token]);

  return (
    <div className="min-h-screen bg-softspace-950 text-softspace-50 flex flex-col selection:bg-softspace-500/30 selection:text-softspace-100">
      {/* Navigation */}
      <nav className="w-full">
        <div className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto w-full">
          <div className="flex items-center gap-2">
            <Heart className="text-white" size={24} fill="currentColor" />
            <span className="text-xl font-bold tracking-tight text-white">{t('app_name')}</span>
          </div>

          <div className="flex items-center bg-softspace-900/60 rounded-full px-1 border border-softspace-800">
            <button className="px-4 py-2 text-sm font-medium text-softspace-400 hover:text-white transition-colors cursor-not-allowed">
              {t('nav_download_coming_soon')}
            </button>
            <Link to="/status" className="px-4 py-2 text-sm font-medium text-softspace-200 hover:text-white transition-colors">
              {t('nav_api_status')}
            </Link>
            <Link to="/support" className="px-4 py-2 text-sm font-medium text-softspace-200 hover:text-white transition-colors">
              {t('nav_support')}
            </Link>
            <Link to="/blog" className="px-4 py-2 text-sm font-medium text-softspace-200 hover:text-white transition-colors">
              {t('nav_blog')}
            </Link>
            <button
              type="button"
              onClick={() => i18n.changeLanguage(i18n.language.startsWith('de') ? 'en' : 'de')}
              className="px-4 py-2 text-sm font-medium text-softspace-400 hover:text-softspace-100 transition-colors border-l border-softspace-800 ml-1"
            >
              {i18n.language.startsWith('de') ? 'EN' : 'DE'}
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-6 flex flex-col items-center">
        <section className="flex flex-col items-center text-center pt-24 pb-16 max-w-3xl mx-auto">
          <h1 className="text-5xl sm:text-6xl font-extrabold leading-tight tracking-tight text-white mb-6">
            Find your community.
          </h1>
          <p className="text-softspace-300 text-lg leading-relaxed max-w-2xl mb-10">
            {t('app_name')} is the open-source group chat app for friends and communities that works the way you always wished it would.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
            <button disabled className="w-full sm:w-[200px] px-8 py-4 bg-[#3ae0ff]/50 text-softspace-950/50 font-bold rounded-full text-lg cursor-not-allowed">
              Coming Soon
            </button>
            <Link
              to={token ? "/app" : "/auth"}
              className="w-full sm:w-[200px] px-8 py-4 bg-softspace-800 hover:bg-softspace-700 text-white font-bold rounded-full transition-colors text-lg text-center"
            >
              {token ? t('open_app') : 'Open Web App'}
            </Link>
          </div>
        </section>

          {/* App Preview Image / Window */}
          <div className="w-full max-w-5xl mx-auto mt-8 mb-24 rounded-2xl overflow-hidden shadow-[0_0_100px_rgba(0,0,0,0.5)] border border-softspace-800 relative pointer-events-none select-none">
            <img 
              src="/app-preview.png" 
              alt="Softspace Preview" 
              className="w-full h-auto object-cover" 
              draggable="false"
              onContextMenu={(e) => e.preventDefault()}
            />
          </div>

        {/* Feature Grid */}
        <div className="w-full text-center mb-16">
          <h2 className="text-3xl font-bold text-white mb-12">The better chat app.</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 text-left">
            <div className="bg-[#111116] border border-softspace-800 p-6 rounded-2xl">
              <h3 className="text-lg font-bold text-white mb-3">Everything you need...</h3>
              <p className="text-softspace-300 text-sm leading-relaxed">All the features you've come to expect in the 21st century are here. Servers, channels, voice chat, file sharing, markdown support, and all the rest.</p>
            </div>
            <div className="bg-[#111116] border border-softspace-800 p-6 rounded-2xl">
              <h3 className="text-lg font-bold text-white mb-3">...and nothing you don't.</h3>
              <p className="text-softspace-300 text-sm leading-relaxed">No ads, no data mining, no shady partnerships. We know you don't want that, your community doesn't want that, and we don't want that either.</p>
            </div>
            <div className="bg-[#111116] border border-softspace-800 p-6 rounded-2xl">
              <h3 className="text-lg font-bold text-white mb-3">Handles tens, handles thousands.</h3>
              <p className="text-softspace-300 text-sm leading-relaxed">Whether you're chatting with a handful of friends or running a bustling community, {t('app_name')} scales with you. The tools work the same, no matter how big you get.</p>
            </div>
            <div className="bg-[#111116] border border-softspace-800 p-6 rounded-2xl">
              <h3 className="text-lg font-bold text-white mb-3">The rules are simple.</h3>
              <p className="text-softspace-300 text-sm leading-relaxed">Manage your community with an intuitive role-based permissions system, powerful moderation tools, and the best moderation bots in class.</p>
            </div>
            <div className="bg-[#111116] border border-softspace-800 p-6 rounded-2xl">
              <h3 className="text-lg font-bold text-white mb-3">Not sketchy, not creepy.</h3>
              <p className="text-softspace-300 text-sm leading-relaxed">Built in Europe under some of the strictest data protection laws in the world. The code is public and the privacy policy is short enough to actually read.</p>
            </div>
            <div className="bg-[#111116] border border-softspace-800 p-6 rounded-2xl">
              <h3 className="text-lg font-bold text-white mb-3">Take it with you. Everywhere.</h3>
              <p className="text-softspace-300 text-sm leading-relaxed">Your account, your conversations, your settings. All in sync across every device you own. We've got you covered on the web.</p>
            </div>
            <div className="bg-[#111116] border border-softspace-800 p-6 rounded-2xl">
              <h3 className="text-lg font-bold text-white mb-3">Answers to you, not investors.</h3>
              <p className="text-softspace-300 text-sm leading-relaxed">We've got no board to please and no ad revenue to protect. Every decision we make starts and ends with the people using the software. Free and open source, now and forever.</p>
            </div>
            <div className="bg-[#111116] border border-softspace-800 p-6 rounded-2xl">
              <h3 className="text-lg font-bold text-white mb-3">You're in control. Really in control.</h3>
              <p className="text-softspace-300 text-sm leading-relaxed">You don't have to worry about hosting your own server if you don't want to, but if you do, we've got you covered. It's free, it's open, and it's yours to do with as you please.</p>
            </div>
          </div>
        </div>

        {/* Still not convinced */}
        <div className="w-full max-w-5xl mx-auto py-24 border-t border-softspace-800">
          <h2 className="text-4xl font-bold text-white mb-16 text-center">Still not convinced?</h2>
          
          <div className="grid md:grid-cols-2 gap-16 items-center mb-24">
            <div>
              <div className="w-12 h-12 bg-softspace-800 rounded-xl flex items-center justify-center mb-6">
                <ArrowDownUp size={24} className="text-white" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-4">Don't pay for basic stuff.</h3>
              <p className="text-softspace-300 leading-relaxed text-lg">Custom emojis, a 20MB file upload limit and a server-specific profile picture with no subscription required. Animated avatars for everyone. We've even solved the age-old problem of letting you set a banner on your profile without making you pay for it. It's the little things.</p>
            </div>
            <div className="bg-softspace-950 border border-softspace-800 rounded-2xl overflow-hidden shadow-2xl relative min-h-[300px] flex items-center justify-center p-4 pointer-events-none select-none">
              <img 
                src="/upload-preview.png"
                alt="Upload Preview"
                className="w-[300%] h-[300%] max-w-none object-contain opacity-90 rounded-xl translate-x-[30%]"
                draggable="false"
                onContextMenu={(e) => e.preventDefault()}
              />
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center py-24 border-t border-softspace-800 w-full">
          <h2 className="text-4xl font-bold text-white mb-10">Ready to make the switch?</h2>
          <div className="flex flex-col sm:flex-row justify-center items-center gap-4 w-full sm:w-auto">
            <button disabled className="w-full sm:w-[200px] px-8 py-4 bg-[#3ae0ff]/50 text-softspace-950/50 font-bold rounded-full text-lg cursor-not-allowed">
              Coming Soon
            </button>
            <Link
              to={token ? "/app" : "/auth"}
              className="w-full sm:w-[200px] px-8 py-4 bg-softspace-800 hover:bg-softspace-700 text-white font-bold rounded-full transition-colors text-lg text-center"
            >
              {token ? t('open_app') : 'Open Web App'}
            </Link>
          </div>
        </div>

      </main>

      {/* Footer */}
      <footer className="bg-[#111116] border border-softspace-800 rounded-t-[2rem] max-w-6xl mx-auto w-full px-12 py-12 flex flex-col md:flex-row justify-between gap-12 mt-12 mb-4">
        <div className="max-w-xs">
          <div className="flex items-center gap-2 mb-4">
            <Heart className="text-white" size={24} fill="currentColor" />
            <span className="text-2xl font-bold tracking-tight text-white">{t('app_name')}</span>
          </div>
          <p className="text-softspace-400 text-sm mb-6">© {t('app_name')}, {new Date().getFullYear()}</p>
        </div>
        
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 flex-1 max-w-3xl">
          <div>
            <h4 className="font-bold text-white text-sm mb-4">{t('app_name')}</h4>
            <ul className="space-y-3 text-sm text-softspace-400">
              <li><span className="text-softspace-500 cursor-not-allowed">Download for Desktop</span></li>
              <li><span className="text-softspace-500 cursor-not-allowed">Download for Android</span></li>
              <li><span className="text-softspace-500 cursor-not-allowed">Download for iOS</span></li>
              <li><Link to="/support" className="hover:text-white transition-colors">Support</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold text-white text-sm mb-4">Developers</h4>
            <ul className="space-y-3 text-sm text-softspace-400">
              <li><a href="#" className="hover:text-white transition-colors">Source Code</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Documentation</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold text-white text-sm mb-4">Team</h4>
            <ul className="space-y-3 text-sm text-softspace-400">
              <li><Link to="/about" className="hover:text-white transition-colors">About</Link></li>
              <li><a href="/blog" className="hover:text-white transition-colors">Blog and Changelogs</a></li>
              <li><Link to="/support" className="hover:text-white transition-colors">Contact</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold text-white text-sm mb-4">Legal</h4>
            <ul className="space-y-3 text-sm text-softspace-400">
              <li><Link to="/guidelines" className="hover:text-white transition-colors">Community Guidelines</Link></li>
              <li><Link to="/terms" className="hover:text-white transition-colors">Terms of Service</Link></li>
              <li><Link to="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link></li>
            </ul>
          </div>
        </div>
      </footer>
    </div>
  );
}
