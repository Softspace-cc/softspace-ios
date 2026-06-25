import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Heart, ArrowLeft } from 'lucide-react';

export default function PrivacyPage() {
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
          <h1 className="text-4xl font-extrabold text-white mb-2">Privacy Policy</h1>
          <p className="text-softspace-400 text-sm mb-12">Last updated: June 2026</p>

          <div className="bg-[#111116] border border-softspace-800 rounded-2xl p-6 mb-12">
            <h3 className="text-xl font-bold text-white mt-0 mb-2">We Actually Respect You!</h3>
            <ul className="text-softspace-300 space-y-2 mb-0 mt-2 list-none pl-0">
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-0.5">✓</span>
                <span><strong>No Ads.</strong> We do not serve advertisements, so we have no reason to build an advertising profile on you.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-0.5">✓</span>
                <span><strong>No Data Selling.</strong> Your data is never sold to data brokers or third parties. Ever.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-0.5">✓</span>
                <span><strong>No AI Training.</strong> We do not use your private conversations or voice calls to train machine learning models.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-0.5">✓</span>
                <span><strong>You delete it, it's gone.</strong> When you delete a message or your account, it is wiped from our database.</span>
              </li>
            </ul>
          </div>

          <h2>1. What Data We Collect</h2>
          <p>We only collect data that is strictly necessary for Softspace to function as a chat application.</p>
          <ul>
            <li><strong>Account Information:</strong> Your email address, username, and hashed password.</li>
            <li><strong>Profile Data:</strong> Your display name, pronouns, identity tags, bio, and avatar/banner images if you choose to provide them.</li>
            <li><strong>Content:</strong> The messages you send, the servers you create, and the files you upload.</li>
            <li><strong>Technical Data:</strong> Your IP address (for security and anti-spam) and basic device info to keep your sessions active.</li>
          </ul>

          <h2>2. How We Use Your Data</h2>
          <p>We use your data for exactly one purpose: <strong>to run Softspace.</strong></p>
          <ul>
            <li>To deliver your messages to other users.</li>
            <li>To notify you when you get mentioned or receive a DM.</li>
            <li>To prevent abuse, spam, and platform manipulation.</li>
          </ul>
          <p>That's it. No behavioral targeting, no cross-site tracking, no algorithm trying to maximize your screen time.</p>

          <h2>3. Voice and Video Calls</h2>
          <p>
            Softspace uses WebRTC for voice and video communication. This means that, whenever possible, your voice and video traffic travels <strong>peer-to-peer</strong> (directly between you and the other people in the call). 
            When peer-to-peer isn't possible due to network restrictions, traffic passes through a secure TURN/STUN server, but it is never recorded or stored by us.
          </p>

          <h2>4. Who We Share Your Data With</h2>
          <p>Almost nobody. We only share data when technically necessary or legally required:</p>
          <ul>
            <li><strong>Infrastructure Providers:</strong> The servers that host our database and files (e.g., our cloud provider).</li>
            <li><strong>Law Enforcement:</strong> Only if we receive a valid, legally binding subpoena or court order, or in emergencies involving immediate threat to life or child safety.</li>
          </ul>

          <h2>5. Your Rights (GDPR & Beyond)</h2>
          <p>
            We believe privacy is a universal human right, regardless of where you live. You have the right to:
          </p>
          <ul>
            <li><strong>Access:</strong> Request a copy of the data we hold about you.</li>
            <li><strong>Correction:</strong> Update your profile and account settings at any time.</li>
            <li><strong>Deletion:</strong> Delete your account, which will completely remove your personal information and anonymize or delete your messages.</li>
          </ul>

          <h2>6. Tracking and Cookies</h2>
          <p>
            We use a single authentication token (similar to a cookie) just to keep you logged in. We do not use tracking cookies, analytics pixels, or third-party surveillance scripts.
          </p>

          <h2>7. Contact Us</h2>
          <p>
            If you have questions about your privacy, want to request a data export, or wish to delete your account, please reach out to the server administrator or open an issue on our public repository.
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
