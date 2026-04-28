import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '@/context';
import { ApiError } from '@/api/client';

export function RegisterPage() {
  const { user, isLoading, signup } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Pre-fill invite code from the ?code= URL param (invite links look like /register?code=abc123)
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState(searchParams.get('code') ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isLoading && user) {
      navigate('/', { replace: true });
    }
  }, [isLoading, user, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (username.length < 3) {
      setError('Username must be at least 3 characters.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (!inviteCode.trim()) {
      setError('An invite code is required to register.');
      return;
    }

    setIsSubmitting(true);
    try {
      await signup(username, email, password, inviteCode.trim());
      navigate('/', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) return null;

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-white text-center mb-8">
          MTG Swapper
        </h1>

        <form
          onSubmit={(e) => { void handleSubmit(e); }}
          className="bg-gray-900 rounded-2xl p-6 space-y-5"
          noValidate
        >
          <h2 className="text-lg font-semibold text-white">Create account</h2>

          {error && (
            <p role="alert" className="text-sm text-red-400 bg-red-950 border border-red-800 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="space-y-1">
            <label htmlFor="username" className="block text-sm text-gray-400">
              Username
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              required
              minLength={3}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="email" className="block text-sm text-gray-400">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="password" className="block text-sm text-gray-400">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="text-xs text-gray-500">At least 8 characters</p>
          </div>

          <div className="space-y-1">
            <label htmlFor="invite-code" className="block text-sm text-gray-400">
              Invite code
            </label>
            <input
              id="invite-code"
              type="text"
              autoComplete="off"
              required
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900 disabled:text-indigo-400 text-white font-medium rounded-lg py-2 text-sm transition-colors"
          >
            {isSubmitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-4">
          Already have an account?{' '}
          <Link to="/login" className="text-indigo-400 hover:text-indigo-300">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
