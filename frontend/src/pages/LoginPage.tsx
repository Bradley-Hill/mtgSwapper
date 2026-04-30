import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context";
import { ApiError } from "@/api/client";
import styles from './LoginPage.module.scss';

export function LoginPage() {
  const { user, isLoading, login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isLoading && user) {
      navigate("/", { replace: true });
    }
  }, [isLoading, user, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await login(email, password);
      navigate("/", { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Something went wrong. Please try again.");
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
          <h2 className={styles.formTitle}>Sign in</h2>

          {error && (
            <p role="alert" className={styles.errorAlert}>
              {error}
            </p>
          )}

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
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={styles.input}
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className={styles.submitBtn}
          >
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className={styles.footer}>
          Have an invite?{' '}
          <Link to="/register">Create account</Link>
        </p>
      </div>
    </main>
  );
}
