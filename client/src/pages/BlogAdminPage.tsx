import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, ArrowLeft, Plus, Trash2, Edit, Save, X, Image as ImageIcon, Eye, Code } from 'lucide-react';
import { apiJson, API_URL, assetUrl } from '../lib/api';

interface BlogPost {
  id: string;
  title: string;
  content: string;
  imageUrl: string | null;
  createdAt: string;
}

export default function BlogAdminPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Edit / Create State
  const [editingPost, setEditingPost] = useState<Partial<BlogPost> | null>(null);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Authentication check wrapper
  const adminApi = async <T = any>(path: string, options: RequestInit & { body?: any } = {}): Promise<T> => {
    const headers = new Headers(options.headers || {});
    headers.set('x-blog-admin-password', password);
    
    return apiJson<T>(path, {
      ...options,
      headers
    });
  };

  const fetchPosts = async () => {
    try {
      setLoading(true);
      const data = await apiJson<{ posts: BlogPost[] }>('/api/blog');
      setPosts(data.posts);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load posts');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    
    // We can verify by just trying to fetch or we just assume it's good until an API call fails
    // Let's do a quick validation by trying to create a dummy request or just accept it and fail later
    // For simplicity, we just set authenticated and let the API reject it if wrong
    setAuthenticated(true);
    fetchPosts();
  };

  const handleSave = async () => {
    if (!editingPost?.title || !editingPost?.content) {
      setError('Title and content are required');
      return;
    }

    try {
      setIsSaving(true);
      setError(null);
      
      if (editingPost.id) {
        // Update
        await adminApi(`/api/blog/${editingPost.id}`, {
          method: 'PUT',
          body: {
            title: editingPost.title,
            content: editingPost.content,
            imageUrl: editingPost.imageUrl || null
          }
        });
      } else {
        // Create
        await adminApi('/api/blog', {
          method: 'POST',
          body: {
            title: editingPost.title,
            content: editingPost.content,
            imageUrl: editingPost.imageUrl || null
          }
        });
      }
      
      setEditingPost(null);
      fetchPosts();
    } catch (err: any) {
      setError(err.message || 'Failed to save post. Check password?');
      if (err.status === 401) setAuthenticated(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this post?')) return;
    
    try {
      setError(null);
      await adminApi(`/api/blog/${id}`, {
        method: 'DELETE'
      });
      fetchPosts();
    } catch (err: any) {
      setError(err.message || 'Failed to delete post');
      if (err.status === 401) setAuthenticated(false);
    }
  };

  const renderContent = (content: string) => {
    return content.split('\n').map((paragraph, i) => {
      const imgRegex = /!\[([^\]]*)\]\(([^)|]+)(?:\s*\|\s*([^)]+))?\)/g;
      
      if (!imgRegex.test(paragraph)) {
        return <p key={i}>{paragraph}</p>;
      }

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

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsSaving(true);
      const formData = new FormData();
      formData.append('file', file);
      
      // We can use the existing upload endpoint if there is one, or we just rely on external URLs
      // Wait, is there an upload endpoint? Let's check api.ts or the server.
      // For now, let's just let the user input an image URL manually, or if they upload, we can upload to /api/users/@me/avatar? No, that's for avatars.
      // Let's prompt for URL instead to be safe, since we might not have a general file upload route.
    } catch (err: any) {
      setError(err.message || 'Failed to upload image');
    } finally {
      setIsSaving(false);
    }
  };

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-softspace-950 flex items-center justify-center p-6">
        <div className="bg-[#111116] border border-softspace-800 p-8 rounded-3xl max-w-md w-full shadow-2xl">
          <div className="flex justify-center mb-6">
            <Heart className="text-white" size={40} fill="currentColor" />
          </div>
          <h1 className="text-2xl font-bold text-white text-center mb-8">Blog Admin Login</h1>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-softspace-300 mb-2">Admin Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-softspace-900 border border-softspace-800 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-softspace-600 focus:ring-1 focus:ring-softspace-600"
                placeholder="Enter password..."
                autoFocus
              />
            </div>
            <button
              type="submit"
              className="w-full bg-white text-black font-bold py-3 px-4 rounded-xl hover:bg-softspace-200 transition-colors"
            >
              Access Admin Panel
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-softspace-950 text-softspace-50 flex flex-col">
      <nav className="w-full border-b border-softspace-800 bg-[#111116] sticky top-0 z-50">
        <div className="flex items-center justify-between px-6 py-4 max-w-5xl mx-auto w-full">
          <div className="flex items-center">
            <button 
              onClick={() => navigate('/blog')}
              className="p-2 -ml-2 mr-4 text-softspace-400 hover:text-white hover:bg-softspace-800 rounded-lg transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            <span className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              <Heart className="text-softspace-500" size={20} fill="currentColor" />
              Blog Admin
            </span>
          </div>
          <button
            onClick={() => setAuthenticated(false)}
            className="text-sm font-medium text-softspace-400 hover:text-white"
          >
            Logout
          </button>
        </div>
      </nav>

      <main className="flex-1 w-full max-w-5xl mx-auto px-6 py-8">
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl mb-8 flex justify-between items-center">
            <p>{error}</p>
            <button onClick={() => setError(null)}><X size={16} /></button>
          </div>
        )}

        {editingPost ? (
          <div className="bg-[#111116] border border-softspace-800 rounded-3xl p-6 md:p-8">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <h2 className="text-2xl font-bold text-white">
                  {editingPost.id ? 'Edit Post' : 'Create New Post'}
                </h2>
                <div className="flex bg-softspace-900 rounded-lg p-1 border border-softspace-800">
                  <button
                    onClick={() => setIsPreviewMode(false)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      !isPreviewMode ? 'bg-softspace-800 text-white' : 'text-softspace-400 hover:text-white hover:bg-softspace-800/50'
                    }`}
                  >
                    <Code size={16} />
                    Edit
                  </button>
                  <button
                    onClick={() => setIsPreviewMode(true)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      isPreviewMode ? 'bg-softspace-800 text-white' : 'text-softspace-400 hover:text-white hover:bg-softspace-800/50'
                    }`}
                  >
                    <Eye size={16} />
                    Preview
                  </button>
                </div>
              </div>
              <button 
                onClick={() => {
                  setEditingPost(null);
                  setIsPreviewMode(false);
                }}
                className="p-2 text-softspace-400 hover:text-white hover:bg-softspace-800 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {isPreviewMode ? (
              <div className="space-y-6">
                <div className="bg-softspace-900/50 border border-softspace-800 rounded-2xl p-6">
                  {editingPost.imageUrl && (
                    <div className="w-full h-64 sm:h-80 overflow-hidden bg-softspace-900 rounded-xl mb-8">
                      <img 
                        src={assetUrl(editingPost.imageUrl)} 
                        alt="Preview Hero" 
                        className="w-full h-full object-cover"
                        onError={(e) => (e.currentTarget.style.display = 'none')}
                      />
                    </div>
                  )}
                  <h1 className="text-3xl font-bold text-white mb-6 tracking-tight">
                    {editingPost.title || 'Untitled Post'}
                  </h1>
                  <div className="prose prose-invert prose-softspace max-w-none prose-p:leading-relaxed prose-img:rounded-xl">
                    {editingPost.content ? renderContent(editingPost.content) : <p className="text-softspace-500 italic">No content yet...</p>}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-softspace-300 mb-2">Title</label>
                <input
                  type="text"
                  value={editingPost.title || ''}
                  onChange={(e) => setEditingPost({...editingPost, title: e.target.value})}
                  className="w-full bg-softspace-900 border border-softspace-800 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-softspace-600"
                  placeholder="Post title..."
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-softspace-300 mb-2">Image URL (Optional)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={editingPost.imageUrl || ''}
                    onChange={(e) => setEditingPost({...editingPost, imageUrl: e.target.value})}
                    className="flex-1 bg-softspace-900 border border-softspace-800 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-softspace-600"
                    placeholder="https://example.com/image.png"
                  />
                </div>
                {editingPost.imageUrl && (
                  <div className="mt-4 rounded-xl overflow-hidden border border-softspace-800 max-w-sm h-40 bg-softspace-900">
                    <img src={editingPost.imageUrl} alt="Preview" className="w-full h-full object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-softspace-300">Content</label>
                  <button
                    type="button"
                    onClick={() => {
                      const url = prompt('Enter image URL:');
                      if (url) {
                        const width = prompt('Enter width (e.g. 500px, 100%, 300). Leave empty for default:');
                        const widthPart = width ? ` | ${width}` : '';
                        setEditingPost({
                          ...editingPost,
                          content: (editingPost.content || '') + `\n![Image](${url}${widthPart})\n`
                        });
                      }
                    }}
                    className="flex items-center gap-1.5 text-xs bg-softspace-800 hover:bg-softspace-700 text-softspace-200 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <ImageIcon size={14} />
                    Insert Image
                  </button>
                </div>
                <textarea
                  value={editingPost.content || ''}
                  onChange={(e) => setEditingPost({...editingPost, content: e.target.value})}
                  className="w-full bg-softspace-900 border border-softspace-800 text-white rounded-xl px-4 py-3 h-96 focus:outline-none focus:border-softspace-600 resize-y font-mono text-sm"
                  placeholder="Write your post content here... (Supports multiple paragraphs and ![alt](url | width) for images)"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-softspace-800 mt-6">
                <button
                  onClick={() => {
                    setEditingPost(null);
                    setIsPreviewMode(false);
                  }}
                  className="px-6 py-2.5 rounded-xl font-medium text-softspace-300 hover:text-white hover:bg-softspace-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex items-center gap-2 px-6 py-2.5 bg-white text-black font-bold rounded-xl hover:bg-softspace-200 transition-colors disabled:opacity-50"
                >
                  <Save size={18} />
                  {isSaving ? 'Saving...' : 'Save Post'}
                </button>
              </div>
            </div>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-8">
              <h1 className="text-3xl font-bold text-white">Manage Posts</h1>
              <button
                onClick={() => setEditingPost({ title: '', content: '', imageUrl: '' })}
                className="flex items-center gap-2 px-5 py-2.5 bg-white text-black font-bold rounded-xl hover:bg-softspace-200 transition-colors"
              >
                <Plus size={18} />
                New Post
              </button>
            </div>

            {loading ? (
              <div className="flex justify-center py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
              </div>
            ) : posts.length === 0 ? (
              <div className="text-center py-20 bg-[#111116] rounded-3xl border border-softspace-800">
                <p className="text-softspace-400">No posts yet. Click "New Post" to create one.</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {posts.map(post => (
                  <div key={post.id} className="bg-[#111116] border border-softspace-800 rounded-2xl p-6 flex items-center justify-between group hover:border-softspace-700 transition-colors">
                    <div className="flex-1 min-w-0 pr-6">
                      <h3 className="text-xl font-bold text-white mb-1 truncate">{post.title}</h3>
                      <p className="text-sm text-softspace-400">
                        {new Date(post.createdAt).toLocaleDateString()} • {post.content.substring(0, 100)}...
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setEditingPost(post)}
                        className="p-2 text-softspace-400 hover:text-white hover:bg-softspace-800 rounded-lg transition-colors"
                        title="Edit"
                      >
                        <Edit size={18} />
                      </button>
                      <button
                        onClick={() => handleDelete(post.id)}
                        className="p-2 text-softspace-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
