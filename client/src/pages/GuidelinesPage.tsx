import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Heart, ArrowLeft } from 'lucide-react';

export default function GuidelinesPage() {
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
          <h1 className="text-4xl font-extrabold text-white mb-2">Community Guidelines</h1>
          <p className="text-softspace-400 text-sm mb-12">Because common sense sometimes needs to be written down.</p>

          <div className="bg-[#111116] border border-softspace-800 rounded-2xl p-6 mb-12">
            <h3 className="text-xl font-bold text-white mt-0 mb-2">The Short Version</h3>
            <ul className="text-softspace-300 space-y-2 mb-0 mt-2 list-none pl-0">
              <li className="flex items-start gap-2">
                <span className="text-[#3ae0ff] mt-0.5">1.</span>
                <span><strong>Server autonomy.</strong> Server owners make the rules for their own spaces. We don't act as internet police for private groups unless platform rules are broken.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#3ae0ff] mt-0.5">2.</span>
                <span><strong>No illegal stuff.</strong> This is the absolute hard limit. No CSAM, no doxxing, no swatting.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#3ae0ff] mt-0.5">3.</span>
                <span><strong>Don't be a creep.</strong> No harassment, stalking, or non-consensual sharing of intimate media.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#3ae0ff] mt-0.5">4.</span>
                <span><strong>Keep bots in check.</strong> Bots are great, but spamming users or scraping data is an instant ban.</span>
              </li>
            </ul>
          </div>

          <h2>1. How Moderation Works Here</h2>
          <p>
            Unlike other platforms that scan every message you send to enforce arbitrary corporate standards, we believe in <strong>decentralized moderation</strong>. 
            The owner of a server is the primary moderator of that server. If someone is being annoying in a server, it's the server admins' job to kick them, not ours. 
            We only step in when platform-wide rules (the "Hard Limits") are violated.
          </p>

          <h2>2. The Hard Limits (Zero Tolerance)</h2>
          <p>
            Breaking these rules will result in an immediate, permanent ban from the Softspace platform, and we will report you to the relevant authorities if required by law.
          </p>
          <ul>
            <li><strong>Child Safety:</strong> Zero tolerance for CSAM or the sexualization of minors.</li>
            <li><strong>Doxxing & Swatting:</strong> Do not share other people's private, personally identifying information (like home addresses or phone numbers) without their consent.</li>
            <li><strong>Non-Consensual Intimate Imagery (NCII):</strong> Sharing intimate photos or videos of someone without their permission (often called "revenge porn") is strictly forbidden.</li>
            <li><strong>Real-World Harm:</strong> You may not use Softspace to plan, organize, or encourage real-world violence, terrorism, or physical harm.</li>
          </ul>

          <h2>3. Harassment and Hate Speech</h2>
          <p>
            We are building a space where people can actually enjoy hanging out. Therefore:
          </p>
          <ul>
            <li><strong>No targeted harassment:</strong> Don't organize dogpiling, mass-reporting, or continuous harassment of individuals.</li>
            <li><strong>Respect boundaries:</strong> If someone blocks you, do not use alternate accounts to circumvent the block.</li>
            <li><strong>No hate groups:</strong> Servers dedicated to promoting hatred or violence against protected groups (based on race, religion, sexual orientation, gender identity, etc.) will be removed.</li>
          </ul>

          <h2>4. NSFW Content</h2>
          <p>
            Not safe for work (NSFW) content is allowed on Softspace, provided it is legal and consensual. However, you must:
          </p>
          <ul>
            <li>Keep it out of public, discoverable spaces (like your profile avatar or banner).</li>
            <li>Ensure any server hosting NSFW content is clearly marked and restricted to adults (18+).</li>
          </ul>

          <h2>5. Spam and Automation</h2>
          <p>
            We love developers and bots, but we hate spam.
          </p>
          <ul>
            <li>Do not use bots or scripts to send unsolicited DMs.</li>
            <li>Do not scrape user data.</li>
            <li>Do not sell accounts or servers.</li>
          </ul>

          <h2>6. The Appeal Process</h2>
          <p>
            We're humans, and we make mistakes. If your account gets suspended and you believe it was an error, you will have a direct line to appeal the decision. You won't get an automated "Clyde" robot response that ignores your context. We actually read appeals.
          </p>

        </article>
      </main>

      {/* Simple Footer */}
      <footer className="bg-[#111116] border-t border-softspace-800 mt-12 py-8 text-center text-softspace-400 text-sm">
        <p>© {new Date().getFullYear()} Softspace. Built for the community.</p>
      </footer>
    </div>
  );
}
