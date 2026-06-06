"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient, LoginResponse } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

function roleHome(role: string) {
  return role === "admin" ? "/analytics/sales" : "/pos";
}

export default function LoginPage() {
  const router = useRouter();
  const { login, user, isLoaded } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Already logged in → redirect to role home
  useEffect(() => {
    if (isLoaded && user) {
      router.replace(roleHome(user.role));
    }
  }, [isLoaded, user, router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data } = await apiClient.post<LoginResponse>("/api/auth/login", {
        username,
        password,
      });
      login(data.access_token, data.role, username);
      router.replace(roleHome(data.role));
    } catch {
      setError("帳號或密碼錯誤");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-root">
      {/* Left panel — brand */}
      <div className="login-brand">
        <div className="login-brand__inner">
          <p className="login-brand__eyebrow">Modular Retail Suite</p>
          <h1 className="login-brand__name">About&#8209;Nine²</h1>
          <p className="login-brand__sub">管理員後台</p>
        </div>
        <div className="login-brand__deco" aria-hidden="true">
          <span className="login-brand__circle login-brand__circle--1" />
          <span className="login-brand__circle login-brand__circle--2" />
        </div>
      </div>

      {/* Right panel — form */}
      <div className="login-form-panel">
        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <div className="login-form__header">
            <h2 className="login-form__title">歡迎回來</h2>
            <p className="login-form__hint">請輸入管理員帳號登入</p>
          </div>

          <div className="login-form__fields">
            <label className="login-field">
              <span className="login-field__label">帳號</span>
              <input
                className="login-field__input"
                autoComplete="username"
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </label>

            <label className="login-field">
              <span className="login-field__label">密碼</span>
              <input
                type="password"
                className="login-field__input"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
          </div>

          {error && <p className="login-form__error">{error}</p>}

          <button type="submit" disabled={loading} className="login-form__btn">
            {loading ? (
              <span className="login-form__btn-loading">
                <span />
                <span />
                <span />
              </span>
            ) : (
              "登入"
            )}
          </button>
        </form>
      </div>

      <style>{`
        .login-root {
          display: flex;
          min-height: 100svh;
          overflow: hidden;
        }

        /* ── Brand panel ── */
        .login-brand {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 42%;
          background: #3f372d;
          overflow: hidden;
          padding: 3rem;
        }

        .login-brand__inner {
          position: relative;
          z-index: 2;
          text-align: left;
        }

        .login-brand__eyebrow {
          font-size: 0.7rem;
          letter-spacing: 0.3em;
          text-transform: uppercase;
          color: #c5b8a4;
          margin-bottom: 1rem;
        }

        .login-brand__name {
          font-size: clamp(2.4rem, 4vw, 3.5rem);
          font-weight: 700;
          color: #f6f0e4;
          line-height: 1.1;
          letter-spacing: -0.02em;
        }

        .login-brand__sub {
          margin-top: 1rem;
          font-size: 0.85rem;
          color: #a38c6b;
          letter-spacing: 0.08em;
        }

        /* Decorative circles */
        .login-brand__deco {
          position: absolute;
          inset: 0;
          z-index: 1;
          pointer-events: none;
        }

        .login-brand__circle {
          position: absolute;
          border-radius: 50%;
          border: 1px solid rgba(255,255,255,0.06);
        }

        .login-brand__circle--1 {
          width: 360px;
          height: 360px;
          bottom: -80px;
          right: -120px;
        }

        .login-brand__circle--2 {
          width: 200px;
          height: 200px;
          top: 40px;
          left: -60px;
          border-color: rgba(179, 141, 91, 0.15);
        }

        /* ── Form panel ── */
        .login-form-panel {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f6f0e4;
          padding: 3rem 2rem;
        }

        .login-form {
          width: 100%;
          max-width: 360px;
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }

        .login-form__header {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }

        .login-form__title {
          font-size: 1.75rem;
          font-weight: 700;
          color: #3f372d;
          letter-spacing: -0.02em;
        }

        .login-form__hint {
          font-size: 0.85rem;
          color: #a38c6b;
        }

        /* Fields */
        .login-form__fields {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }

        .login-field {
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
        }

        .login-field__label {
          font-size: 0.78rem;
          font-weight: 600;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #7a6955;
        }

        .login-field__input {
          width: 100%;
          background: #fff9f1;
          border: 1.5px solid #d7c6a6;
          border-radius: 0.75rem;
          padding: 0.75rem 1rem;
          font-size: 1rem;
          color: #3f372d;
          transition: border-color 0.2s, box-shadow 0.2s;
          outline: none;
        }

        .login-field__input:focus {
          border-color: #b38d5b;
          box-shadow: 0 0 0 3px rgba(179, 141, 91, 0.18);
        }

        /* Error */
        .login-form__error {
          font-size: 0.82rem;
          color: #b94040;
          background: rgba(185, 64, 64, 0.07);
          border: 1px solid rgba(185, 64, 64, 0.2);
          border-radius: 0.5rem;
          padding: 0.55rem 0.85rem;
        }

        /* Button */
        .login-form__btn {
          width: 100%;
          padding: 0.85rem;
          background: #3f372d;
          color: #f6f0e4;
          border: none;
          border-radius: 0.75rem;
          font-size: 0.9rem;
          font-weight: 600;
          letter-spacing: 0.04em;
          cursor: pointer;
          transition: background 0.2s, transform 0.15s;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 48px;
        }

        .login-form__btn:hover:not(:disabled) {
          background: #564d41;
        }

        .login-form__btn:active:not(:disabled) {
          transform: scale(0.99);
        }

        .login-form__btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        /* Loading dots */
        .login-form__btn-loading {
          display: flex;
          gap: 5px;
          align-items: center;
        }

        .login-form__btn-loading span {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #f6f0e4;
          animation: login-dot-pulse 1.2s infinite ease-in-out both;
        }

        .login-form__btn-loading span:nth-child(1) { animation-delay: 0s; }
        .login-form__btn-loading span:nth-child(2) { animation-delay: 0.2s; }
        .login-form__btn-loading span:nth-child(3) { animation-delay: 0.4s; }

        @keyframes login-dot-pulse {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }

        /* ── Mobile ── */
        @media (max-width: 640px) {
          .login-root {
            flex-direction: column;
          }

          .login-brand {
            width: 100%;
            padding: 2.5rem 2rem 2rem;
          }

          .login-brand__inner {
            text-align: center;
          }

          .login-brand__name {
            font-size: 2.2rem;
          }

          .login-form-panel {
            padding: 2.5rem 1.5rem;
          }
        }
      `}</style>
    </div>
  );
}
