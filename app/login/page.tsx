"use client";

import { useEffect, useRef, useState } from "react";
import { GOOGLE_CLIENT_ID } from "../../lib/google";

type User = { id: string; email: string; name: string; avatarUrl: string | null };

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
          }) => void;
          renderButton: (
            target: HTMLElement,
            options: { theme: string; size: string; shape: string; text: string; width: number },
          ) => void;
        };
      };
    };
  }
}

export default function LoginPage() {
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    let active = true;

    const pwaCleanup = Promise.all([
      "serviceWorker" in navigator
        ? navigator.serviceWorker.getRegistrations().then((registrations) =>
            Promise.all(registrations.map((registration) => registration.unregister())),
          )
        : Promise.resolve([]),
      "caches" in window
        ? caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
        : Promise.resolve([]),
    ]);

    const initializeGoogle = () => {
      if (!active || !window.google || !googleButtonRef.current) return;
      googleButtonRef.current.innerHTML = "";
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        auto_select: false,
        cancel_on_tap_outside: true,
        callback: async ({ credential }) => {
          setAuthError("");
          const response = await fetch("/api/auth/google", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ credential }),
          });
          const data = (await response.json()) as { user?: User; error?: string };
          if (response.ok && data.user) {
            window.location.replace("/");
            return;
          }
          setAuthError(data.error ?? "Không thể đăng nhập Google.");
        },
      });
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: "outline",
        size: "large",
        shape: "pill",
        text: "continue_with",
        width: 320,
      });
    };

    const loadGoogle = () => {
      const existing = document.querySelector<HTMLScriptElement>(
        'script[src="https://accounts.google.com/gsi/client"]',
      );
      if (existing) {
        if (window.google) initializeGoogle();
        else existing.addEventListener("load", initializeGoogle, { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.onload = initializeGoogle;
      script.onerror = () => setAuthError("Không tải được dịch vụ đăng nhập Google.");
      document.head.appendChild(script);
    };

    void pwaCleanup
      .then(() => fetch("/api/auth/session"))
      .then((response) => response.json())
      .then((data: { user: User | null }) => {
        if (data.user) {
          window.location.replace("/");
          return;
        }
        if (active) {
          setReady(true);
          window.setTimeout(loadGoogle, 0);
        }
      })
      .catch(() => {
        if (active) {
          setReady(true);
          window.setTimeout(loadGoogle, 0);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="login-screen login-gateway">
      <section className="login-card">
        <div className="login-brand">
          <span className="brand-mark" />
          <span><strong>Mandy AI</strong><small>Personal AI & Mandy English</small></span>
        </div>
        <span className="login-badge">Không gian học tập và trợ lý AI riêng của bạn</span>
        <h1>Chào mừng trở lại</h1>
        <p>Đăng nhập một lần để lưu và tiếp tục cuộc trò chuyện trên điện thoại, tablet hoặc máy tính.</p>

        <div className="login-benefits" aria-label="Lợi ích tài khoản">
          <span><b>✓</b> Lịch sử riêng tư</span>
          <span><b>✓</b> Đồng bộ thiết bị</span>
          <span><b>✓</b> Mandy English</span>
        </div>

        <div className="login-divider"><span>Đăng nhập an toàn</span></div>
        {ready ? <div className="google-button" ref={googleButtonRef} /> : (
          <div className="login-loader"><span /><span /><span /></div>
        )}
        {authError && <p className="auth-error">{authError}</p>}
        <small>Bằng cách tiếp tục, bạn đồng ý cho Mandy AI sử dụng tên, email và ảnh đại diện để tạo tài khoản và đồng bộ dữ liệu.</small>
      </section>
      <p className="login-footnote">Mandy AI · Dành cho cá nhân, gia đình và Mandy English</p>
    </main>
  );
}
