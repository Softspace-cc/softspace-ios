import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Heart, ArrowLeft, Code, Crown, Terminal } from 'lucide-react';

export default function AboutPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-softspace-950 text-softspace-50 flex flex-col selection:bg-softspace-500/30 selection:text-softspace-100">
      {/* Simple Header */}
      <nav className="w-full border-b border-softspace-800 bg-[#111116]">
        <div className="flex items-center px-6 py-4 max-w-4xl mx-auto w-full">
          <button 
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 mr-4 text-softspace-400 hover:text-white hover:bg-softspace-800 rounded-lg transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <Link to="/" className="flex items-center gap-2">
            <Heart className="text-white" size={24} fill="currentColor" />
            <span className="text-xl font-bold tracking-tight text-white">{t('app_name')}</span>
          </Link>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-4xl mx-auto px-6 py-12">
        <article className="prose prose-invert prose-softspace max-w-none">
          <h1 className="text-4xl font-extrabold text-white mb-2">About Softspace</h1>
          <p className="text-softspace-400 text-lg mb-12">The story behind the platform.</p>

          <div className="bg-[#111116] border border-softspace-800 rounded-2xl p-8 mb-12 text-center">
            <Heart className="text-[#3ae0ff] mx-auto mb-4" size={48} />
            <h2 className="text-2xl font-bold text-white mt-0 mb-4">Not a Corporation.</h2>
            <p className="text-softspace-300 leading-relaxed max-w-2xl mx-auto mb-0">
              Softspace isn't backed by a massive tech conglomerate with hundreds of engineers, 
              investors, or a board of directors demanding endless profit growth. 
              It was born out of frustration with modern chat apps that sell your data, 
              force ads down your throat, and lock basic features behind paywalls.
            </p>
          </div>

          <h2 className="text-3xl font-bold text-white mb-8 border-b border-softspace-800 pb-4">Meet the Team</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Jamie's Card */}
            <div className="bg-softspace-900 border border-softspace-800 rounded-2xl p-6 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <Crown size={64} className="text-[#3ae0ff]" />
              </div>
              
              <div className="flex items-center gap-4 mb-6 relative z-10">
                <div className="w-16 h-16 bg-[#111116] rounded-full border-2 border-[#3ae0ff] flex items-center justify-center overflow-hidden">
                  <img src="/image.png" alt="Jamie" className="w-full h-full object-cover" draggable="false" onContextMenu={(e) => e.preventDefault()} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white m-0">Jamie</h3>
                  <p className="text-[#3ae0ff] font-medium m-0 flex items-center gap-1.5 mt-1">
                    <Crown size={14} /> CEO & Founder
                  </p>
                </div>
              </div>
              
              <div className="space-y-3 relative z-10">
                <div className="flex items-start gap-3">
                  <Code size={18} className="text-softspace-400 shrink-0 mt-1" />
                  <p className="text-softspace-300 text-sm m-0">
                    Sole developer building the entire frontend, backend, and infrastructure from the ground up.
                  </p>
                </div>
              </div>
            </div>

            {/* Empty Desk Card */}
            <div className="bg-[#111116] border border-softspace-800 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center text-center min-h-[200px]">
              <div className="w-12 h-12 rounded-full bg-softspace-900 flex items-center justify-center mb-4">
                <span className="text-softspace-500 font-bold">?</span>
              </div>
              <h3 className="text-lg font-bold text-softspace-400 m-0">That's it!</h3>
              <p className="text-softspace-500 text-sm m-0 mt-2">
                No bloated management structure.
              </p>
            </div>
          </div>
        </article>
      </main>

      {/* Simple Footer */}
      <footer className="bg-[#111116] border-t border-softspace-800 mt-12 py-8 text-center text-softspace-400 text-sm">
        <p>© {new Date().getFullYear()} Softspace. Built for the community.</p>
      </footer>
    </div>
  );
}
