"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
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
      setError(err instanceof Error ? err.message : "Giris basarisiz oldu.");
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
            <h1 className="title xl">Ayni urun, daha temiz bir operasyon girisi.</h1>
            <p className="muted" style={{ color: "rgba(255, 248, 239, 0.84)", maxWidth: 420 }}>
              Yonetici ve saha ekipleri ayni giris kapisini kullanir. Rol ayrimi, atama davranisi
              ve mevcut auth akisi degismeden daha net bir ilk ekran deneyimi sunulur.
            </p>
          </div>

          <div className="metric-rail">
            <div className="metric" style={{ background: "rgba(255,255,255,0.14)", color: "#fff8ef" }}>
              <span className="metric-icon" aria-hidden="true">
                <TimelineIcon />
              </span>
              <strong>liste</strong>
              O gun size atanan projeler tek akista.
            </div>
            <div className="metric" style={{ background: "rgba(255,255,255,0.14)", color: "#fff8ef" }}>
              <span className="metric-icon" aria-hidden="true">
                <CheckCircleIcon />
              </span>
              <strong>detay</strong>
              Dosya, not ve guncel akis ayni yerde.
            </div>
            <div className="metric" style={{ background: "rgba(255,255,255,0.14)", color: "#fff8ef" }}>
              <span className="metric-icon" aria-hidden="true">
                <LocationArrowIcon />
              </span>
              <strong>rota</strong>
              Harita uygulamasina gecip adres tarifi alin.
            </div>
          </div>
        </section>

        <form className="login-form" onSubmit={handleSubmit}>
          <div>
            <div className="eyebrow">Giris</div>
            <h2 className="title lg">Hesabiniza baglanin.</h2>
            <p className="muted">
              Bu cihaz size aitse beni hatirla acik kalabilir. Ortak cihazlarda kapatmaniz daha guvenlidir.
            </p>
          </div>

          {error ? <div className="alert">{error}</div> : null}

          <label className="stack" style={{ gap: 8 }}>
            <span>Kullanici adi</span>
            <input
              className="input"
              autoComplete="username"
              inputMode="text"
              placeholder="kullanici adiniz"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>

          <label className="stack" style={{ gap: 8 }}>
            <span>Sifre</span>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              placeholder="sifreniz"
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
              <strong>Beni hatirla</strong>
              <small>Tekrar tekrar giris yapmadan bu cihazda oturumu korur.</small>
            </span>
          </label>

          <button className="button" disabled={loading} type="submit">
            {loading ? "Baglaniyor..." : "Devam et"}
          </button>

          <div className="empty tiny">
            Yonetici ve saha kullanicilari ayni ekrandan giris yapar; sonraki ekran rolunuze gore acilir.
          </div>
        </form>
      </div>
    </div>
  );
}
