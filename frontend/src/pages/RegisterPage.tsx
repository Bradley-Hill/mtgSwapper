import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { usePageTitle } from "@/hooks";
import { useAuth } from "@/context";
import { ApiError } from "@/api/client";
import styles from "./RegisterPage.module.scss";

export function RegisterPage() {
  const { user, isLoading, signup } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  usePageTitle(t("auth.register.title"));
  const [username, setUsername] = useState("");
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

    if (username.length < 3) {
      setError(t("auth.register.errorMinUsername"));
      return;
    }
    if (password.length < 8) {
      setError(t("auth.register.errorMinPassword"));
      return;
    }

    setIsSubmitting(true);
    try {
      await signup(username, email, password);
      navigate("/", { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(t("common.error"));
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
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
          className={styles.form}
          noValidate
        >
          <h2 className={styles.formTitle}>{t("auth.register.title")}</h2>

          {error && (
            <p role="alert" className={styles.errorAlert}>
              {error}
            </p>
          )}

          <div className={styles.field}>
            <label htmlFor="username" className={styles.label}>
              {t("auth.register.username")}
            </label>
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
            <label htmlFor="email" className={styles.label}>
              {t("auth.register.email")}
            </label>
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
            <label htmlFor="password" className={styles.label}>
              {t("auth.register.password")}
            </label>
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
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className={styles.submitBtn}
          >
            {isSubmitting
              ? t("auth.register.submitting")
              : t("auth.register.submit")}
          </button>
        </form>

        <p className={styles.footer}>
          {t("auth.register.haveAccount")}{" "}
          <Link to="/login">{t("auth.register.signIn")}</Link>
        </p>
      </div>
    </main>
  );
}
