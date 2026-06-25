import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Heart, ArrowLeft } from 'lucide-react';

export default function TermsPage() {
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
          <h1 className="text-4xl font-extrabold text-white mb-2">Terms of Service</h1>
          <p className="text-softspace-400 text-sm mb-12">Last updated: June 2026</p>

          <div className="bg-[#111116] border border-softspace-800 rounded-2xl p-6 mb-12">
            <h3 className="text-xl font-bold text-white mt-0 mb-2">TL;DR Because we care about you.</h3>
            <ul className="text-softspace-300 space-y-2 mb-0 mt-2 list-none pl-0">
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-0.5">✓</span>
                <span><strong>We don't own your data.</strong> What you create, write, and upload belongs to you.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-0.5">✓</span>
                <span><strong>No AI training on your private chats.</strong> We don't feed your conversations to algorithms.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-0.5">✓</span>
                <span><strong>No forced arbitration.</strong> If we mess up, you have actual legal rights.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-0.5">✓</span>
                <span><strong>No data selling.</strong> Our business model isn't based on stalking you across the internet.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-500 mt-0.5">✕</span>
                <span><strong>No illegal stuff.</strong> No CSAM, no malware, no harassment.</span>
              </li>
            </ul>
          </div>

          <h2>1. Introduction</h2>
          <p>
            Welcome to Softspace. We built this platform because we were tired of corporate chat apps that treat users as products. 
            These Terms of Service ("Terms") govern your access to and use of the Softspace platform. By using Softspace, you agree to these Terms. 
            If you don't agree, please don't use the service.
          </p>

          <h2>2. Your Data and Content</h2>
          <p>
            <strong>You own your content.</strong> Unlike other platforms that demand a permanent, irrevocable license to use your content for whatever they want, we only ask for the permissions strictly necessary to operate the service.
          </p>
          <ul>
            <li>When you upload a message, image, or file, you grant us a license to store it, display it to the people you choose to share it with, and format it for our apps. That's it.</li>
            <li>We do <strong>not</strong> claim ownership of your intellectual property.</li>
            <li>We do <strong>not</strong> use your private messages, voice calls, or uploads to train artificial intelligence models.</li>
            <li>We do <strong>not</strong> sell your personal information to advertisers or data brokers.</li>
          </ul>

          <h2>3. Acceptable Use (Don't be evil)</h2>
          <p>
            Softspace is designed to be a safe place for communities. While we respect privacy and free speech, we do not tolerate illegal or harmful behavior. You agree <strong>not</strong> to use Softspace to:
          </p>
          <ul>
            <li>Distribute, promote, or share Child Sexual Abuse Material (CSAM). (We will report this to law enforcement immediately).</li>
            <li>Harass, threaten, or doxx other users.</li>
            <li>Distribute malware, viruses, or engage in phishing.</li>
            <li>Spam users or servers.</li>
            <li>Engage in illegal activities under applicable European or local laws.</li>
          </ul>
          <p>
            If you violate these rules, we reserve the right to suspend or terminate your account on our official instance.
          </p>

          <h2>4. Open Source and Self-Hosting</h2>
          <p>
            Softspace is open-source software. You are free to download the code and host your own Softspace server ("Instance"). 
            If you choose to self-host:
          </p>
          <ul>
            <li>You are fully responsible for the content and administration of your Instance.</li>
            <li>You must comply with all local laws and regulations applicable to operating a communication service in your jurisdiction.</li>
            <li>We are not responsible for what happens on third-party Instances.</li>
          </ul>

          <h2>5. Privacy</h2>
          <p>
            Our Privacy Policy explains how we collect, use, and protect your information. Because we don't serve ads, our data collection is minimal and limited to what is technically necessary to run the app (e.g., your email for login, your IP address for security).
          </p>

          <h2>6. Limitation of Liability</h2>
          <p>
            We provide Softspace "as is" and without any warranty. While we work hard to keep the service secure, fast, and bug-free, we cannot promise it will be perfect all the time. To the fullest extent permitted by law, Softspace and its creators are not liable for any lost data, lost profits, or incidental damages resulting from your use of the service.
          </p>

          <h2>7. Changes to these Terms</h2>
          <p>
            We might update these Terms occasionally. If we make major changes, we will let you know (for example, via an announcement in the app). We won't try to sneak in terrible clauses while you aren't looking.
          </p>

          <h2>8. Contact</h2>
          <p>
            If you have any questions about these Terms, feel free to reach out to our support team or create an issue on our public repository.
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
