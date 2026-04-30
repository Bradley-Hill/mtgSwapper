import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '@/context';
import { ApiError } from '@/api/client';
import styles from './RegisterPage.module.scss';

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
    <main className={styles.page}>
      <div className={styles.container}>
        <h1 className={styles.appTitle}>MTG Swapper</h1>

        <form
          onSubmit={(e) => { void handleSubmit(e); }}
          className={styles.form}
          noValidate
        >
          <h2 className={styles.formTitle}>Create account</h2>

          {error && (
            <p role="alert" className={styles.errorAlert}>
              {error}
            </p>
          )}

          <div className={styles.field}>
            <label htmlFor="username" className={styles.label}>Username</label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              required
              minLength={3}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={styles.input}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="email" className={styles.label}>Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={styles.input}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="password" className={styles.label}>Password</label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={styles.input}
            />
            <p className={styles.fieldHint}>At least 8 characters</p>
          </div>

          <div className={styles.field}>
            <label htmlFor="invite-code" className={styles.label}>Invite code</label>
            <input
              id="invite-code"
              type="text"
              autoComplete="off"
              required
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              className={styles.input}
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className={styles.submitBtn}
          >
            {isSubmitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className={styles.footer}>
          Already have an account?{' '}
          <Link to="/login">Sign in</Link>
        </p>
      </div>
    </main>
  );
}
