import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Heart, ArrowLeft, Calendar, User } from 'lucide-react';
import { apiJson, assetUrl } from '../lib/api';

interface BlogPost {
  id: string;
  title: string;
  content: string;
  imageUrl: string | null;
  createdAt: string;
}

export default function BlogPage() {
  const navigate = useNavigate();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchPosts() {
      try {
        const data = await apiJson<{ posts: BlogPost[] }>('/api/blog');
        setPosts(data.posts);
      } catch (err: any) {
        setError(err.message || 'Failed to load blog posts');
      } finally {
        setLoading(false);
      }
    }
    fetchPosts();
  }, []);

  const renderContent = (content: string) => {
    return content.split('\n').map((paragraph, i) => {
      // Regex to match ![alt](url) or ![alt](url | width)
      const imgRegex = /!\[([^\]]*)\]\(([^)|]+)(?:\s*\|\s*([^)]+))?\)/g;
      
      if (!imgRegex.test(paragraph)) {
        return <p key={i}>{paragraph}</p>;
      }

      // Reset regex state
      imgRegex.lastIndex = 0;
      
      const parts = [];
      let lastIndex = 0;
      let match;

      while ((match = imgRegex.exec(paragraph)) !== null) {
        if (match.index > lastIndex) {
          parts.push(<span key={`text-${lastIndex}`}>{paragraph.slice(lastIndex, match.index)}</span>);
        }
        
        const alt = match[1];
        const url = match[2].trim();
        const rawWidth = match[3] ? match[3].trim() : '';
        const width = rawWidth ? (/^\d+$/.test(rawWidth) ? `${rawWidth}px` : rawWidth) : '100%';

        parts.push(
          <img 
            key={`img-${match.index}`} 
            src={assetUrl(url)} 
            alt={alt}
            style={{ width, maxWidth: '100%' }}
            className="h-auto rounded-xl my-6 block object-cover bg-softspace-900 mx-auto" 
          />
        );
        
        lastIndex = match.index + match[0].length;
      }
      
      if (lastIndex < paragraph.length) {
        parts.push(<span key={`text-${lastIndex}`}>{paragraph.slice(lastIndex)}</span>);
      }

      return <p key={i} className="my-2">{parts}</p>;
    });
  };

  return (
    <div className="min-h-screen bg-softspace-950 text-softspace-50 flex flex-col selection:bg-softspace-500/30 selection:text-softspace-100">
      <nav className="w-full border-b border-softspace-800 bg-[#111116] sticky top-0 z-50">
        <div className="flex items-center justify-between px-6 py-4 max-w-5xl mx-auto w-full">
          <div className="flex items-center">
            <button 
              onClick={() => navigate(-1)}
              className="p-2 -ml-2 mr-4 text-softspace-400 hover:text-white hover:bg-softspace-800 rounded-lg transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            <Link to="/" className="flex items-center gap-2">
              <Heart className="text-white" size={24} fill="currentColor" />
              <span className="text-xl font-bold tracking-tight text-white">Softspace Blog</span>
            </Link>
          </div>
        </div>
      </nav>

      <main className="flex-1 w-full max-w-3xl mx-auto px-6 py-12">
        <div className="mb-12 text-center">
          <h1 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight mb-4">News & Updates</h1>
          <p className="text-softspace-400 text-lg">The latest features, updates, and thoughts from the Softspace team.</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-softspace-500"></div>
          </div>
        ) : error ? (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-6 rounded-2xl text-center">
            <p>{error}</p>
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-20 bg-[#111116] rounded-2xl border border-softspace-800">
            <p className="text-softspace-400 text-lg">No posts yet. Check back soon!</p>
          </div>
        ) : (
          <div className="space-y-12">
            {posts.map((post) => (
              <article key={post.id} className="bg-[#111116] border border-softspace-800 rounded-3xl overflow-hidden transition-all hover:border-softspace-700">
                {post.imageUrl && (
                  <div className="w-full h-64 sm:h-80 overflow-hidden bg-softspace-900">
                    <img 
                      src={assetUrl(post.imageUrl)} 
                      alt={post.title} 
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <div className="p-8">
                  <div className="flex items-center gap-4 text-xs text-softspace-400 mb-4">
                    <div className="flex items-center gap-1.5 bg-softspace-800/50 px-2.5 py-1 rounded-md">
                      <Calendar size={14} />
                      <time dateTime={post.createdAt}>
                        {new Date(post.createdAt).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </time>
                    </div>
                    <div className="flex items-center gap-1.5 bg-softspace-800/50 px-2.5 py-1 rounded-md">
                      <User size={14} />
                      <span>CEO</span>
                    </div>
                  </div>
                  
                  <h2 className="text-2xl sm:text-3xl font-bold text-white mb-6 tracking-tight">
                    {post.title}
                  </h2>
                  
                  <div className="prose prose-invert prose-softspace max-w-none prose-p:leading-relaxed prose-img:rounded-xl">
                    {renderContent(post.content)}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      <footer className="bg-[#111116] border-t border-softspace-800 mt-12 py-8 text-center text-softspace-400 text-sm">
        <p>© {new Date().getFullYear()} Softspace. Built for the community.</p>
      </footer>
    </div>
  );
}
