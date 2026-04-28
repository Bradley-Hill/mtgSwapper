import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context";
import { ApiError } from "@/api/client";

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
    <main className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-white text-center mb-8">
          MTG Swapper
        </h1>

        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
          className="bg-gray-900 rounded-2xl p-6 space-y-5"
          noValidate
        >
          <h2 className="text-lg font-semibold text-white">Sign in</h2>

          {error && (
            <p
              role="alert"
              className="text-sm text-red-400 bg-red-950 border border-red-800 rounded-lg px-3 py-2"
            >
              {error}
            </p>
          )}

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
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900 disabled:text-indigo-400 text-white font-medium rounded-lg py-2 text-sm transition-colors"
          >
            {isSubmitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-4">
          Have an invite?{" "}
          <Link
            to="/register"
            className="text-indigo-400 hover:text-indigo-300"
          >
            Create account
          </Link>
        </p>
      </div>
    </main>
  );
}
