"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { AlertMessage } from "../../../components/alert-message";
import { useAuth } from "../../../components/auth-provider";
import { CheckCircleIcon, LocationArrowIcon, TimelineIcon } from "../../../components/ui-icons";

export default function LoginPage() {
  const router = useRouter();
  const { login, ready, user } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && user) {
      router.replace("/dashboard");
    }
  }, [ready, router, user]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await login(username, password, rememberMe);
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Giriş başarısız oldu.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="login-card glass">
        <section className="poster">
          <div>
            <div className="login-mark">K</div>
            <div className="eyebrow">Kagu saha operasyonu</div>
            <h1 className="title xl">Aynı ürün, daha temiz bir operasyon girişi.</h1>
            <p className="muted" style={{ color: "rgba(255, 248, 239, 0.84)", maxWidth: 420 }}>
              Yönetici ve saha ekipleri aynı giriş kapısını kullanır. Rol ayrımı, atama davranışı
              ve mevcut kimlik akışı değişmeden daha net bir ilk ekran deneyimi sunulur.
            </p>
          </div>

          <div className="metric-rail">
            <div className="metric" style={{ background: "rgba(255,255,255,0.14)", color: "#fff8ef" }}>
              <span className="metric-icon" aria-hidden="true">
                <TimelineIcon />
              </span>
              <strong>liste</strong>
              O gün size atanan projeler tek akışta.
            </div>
            <div className="metric" style={{ background: "rgba(255,255,255,0.14)", color: "#fff8ef" }}>
              <span className="metric-icon" aria-hidden="true">
                <CheckCircleIcon />
              </span>
              <strong>detay</strong>
              Dosya, not ve güncel akış aynı yerde.
            </div>
            <div className="metric" style={{ background: "rgba(255,255,255,0.14)", color: "#fff8ef" }}>
              <span className="metric-icon" aria-hidden="true">
                <LocationArrowIcon />
              </span>
              <strong>rota</strong>
              Harita uygulamasına geçip adres tarifi alın.
            </div>
          </div>
        </section>

        <form className="login-form" onSubmit={handleSubmit}>
          <div>
            <div className="eyebrow">Giriş</div>
            <h2 className="title lg">Hesabınıza bağlanın.</h2>
            <p className="muted">
              Bu cihaz size aitse beni hatırla açık kalabilir. Ortak cihazlarda kapatmanız daha güvenlidir.
            </p>
          </div>

          {error ? <AlertMessage message={error} /> : null}

          <label className="stack" style={{ gap: 8 }}>
            <span>Kullanıcı adı</span>
            <input
              className="input"
              autoComplete="username"
              inputMode="text"
              placeholder="kullanıcı adınız"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>

          <label className="stack" style={{ gap: 8 }}>
            <span>Şifre</span>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              placeholder="şifreniz"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          <label className="login-check-row">
            <input
              checked={rememberMe}
              type="checkbox"
              onChange={(event) => setRememberMe(event.target.checked)}
            />
            <span>
              <strong>Beni hatırla</strong>
              <small>Tekrar tekrar giriş yapmadan bu cihazda oturumu korur.</small>
            </span>
          </label>

          <button className="button" disabled={loading} type="submit">
            {loading ? "Bağlanıyor..." : "Devam et"}
          </button>

          <div className="empty tiny">
            Yönetici ve saha kullanıcıları aynı ekrandan giriş yapar; sonraki ekran rolünüze göre açılır.
          </div>
        </form>
      </div>
    </div>
  );
}
