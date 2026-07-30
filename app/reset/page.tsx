"use client";

import { useEffect, useState } from "react";

export default function ResetPage() {
  const [status, setStatus] = useState("Đang làm mới Mandy AI…");

  useEffect(() => {
    const reset = async () => {
      try {
        if ("serviceWorker" in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map((registration) => registration.unregister()));
        }
        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((key) => caches.delete(key)));
        }
        setStatus("Đã xóa phiên bản cũ. Đang mở Mandy AI…");
      } finally {
        window.setTimeout(() => {
          window.location.replace("/?fresh=" + Date.now());
        }, 700);
      }
    };
    void reset();
  }, []);

  return (
    <main className="login-screen">
      <section className="login-card" style={{ textAlign: "center", padding: "48px 32px" }}>
        <h1 style={{ marginBottom: 12 }}>Làm mới Mandy AI</h1>
        <p>{status}</p>
      </section>
    </main>
  );
}
