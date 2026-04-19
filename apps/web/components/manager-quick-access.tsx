"use client";

import { ReactNode, useMemo, useRef, useState } from "react";
import { openProtectedFile as openProtectedFileWithAuth } from "../lib/protected-file";
import { useAuth } from "./auth-provider";
import { ManagerDrawer, ManagerDrawerSection } from "./manager-ui";

export type QuickAccessFile = {
  id: string;
  name: string;
  extension?: string | null;
  downloadPath: string;
  previewPath?: string;
};

export type QuickAccessRecord = {
  id: string;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  meta?: string[];
  files?: QuickAccessFile[];
};

export type QuickAccessLink = {
  href: string;
  label: string;
};

export type QuickAccessPayload = {
  title: string;
  eyebrow?: string;
  summary: string;
  records: QuickAccessRecord[];
  emptyMessage?: string;
  links?: QuickAccessLink[];
};

type ManagerQuickAccessChipProps = {
  children: ReactNode;
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  payload?: QuickAccessPayload;
  resolve?: () => Promise<QuickAccessPayload>;
};

export function ManagerQuickAccessChip({
  children,
  ariaLabel,
  className = "manager-mini-chip",
  disabled = false,
  payload,
  resolve
}: ManagerQuickAccessChipProps) {
  const { token } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [resolvedPayload, setResolvedPayload] = useState<QuickAccessPayload | null>(payload ?? null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState<string | null>(null);
  const previewObjectUrlRef = useRef<string | null>(null);

  const effectivePayload = resolvedPayload ?? payload ?? null;
  const isActionable = useMemo(() => {
    if (disabled) {
      return false;
    }

    if (resolve) {
      return true;
    }

    if (!effectivePayload) {
      return false;
    }

    return effectivePayload.records.length > 0 || (effectivePayload.links?.length ?? 0) > 0;
  }, [disabled, effectivePayload, resolve]);

  async function handleOpen() {
    if (!isActionable) {
      return;
    }

    if (!resolvedPayload && resolve) {
      try {
        setLoading(true);
        setMessage(null);
        const nextPayload = await resolve();
        setResolvedPayload(nextPayload);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Detay acilamadi.");
      } finally {
        setLoading(false);
      }
    }

    setOpen(true);
  }

  function closePreview() {
    if (previewObjectUrlRef.current) {
      URL.revokeObjectURL(previewObjectUrlRef.current);
      previewObjectUrlRef.current = null;
    }
    setPreviewUrl(null);
    setPreviewName(null);
  }

  async function handleFileOpen(file: QuickAccessFile, mode: "preview" | "download") {
    if (!token) {
      return;
    }

    try {
      await openProtectedFileWithAuth({
        mode,
        path: mode === "preview" ? file.previewPath ?? file.downloadPath : file.downloadPath,
        token,
        onPreview: ({ filename, objectUrl }) => {
          if (previewObjectUrlRef.current) {
            URL.revokeObjectURL(previewObjectUrlRef.current);
          }
          previewObjectUrlRef.current = objectUrl;
          setPreviewUrl(objectUrl);
          setPreviewName(filename);
        }
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Dosya acilamadi.");
    }
  }

  if (!isActionable) {
    return <span className={className}>{children}</span>;
  }

  return (
    <>
      <button
        aria-label={ariaLabel}
        className={`${className} manager-quick-access-trigger`}
        onClick={() => void handleOpen()}
        type="button"
      >
        {children}
      </button>

      <ManagerDrawer onClose={() => setOpen(false)} open={open} title={effectivePayload?.title ?? "Hizli erisim"}>
        <div className="stack">
          <ManagerDrawerSection eyebrow={effectivePayload?.eyebrow ?? "Hizli erisim"} title="Ozet">
            <p className="muted">{message ?? effectivePayload?.summary ?? (loading ? "Detaylar hazirlaniyor." : "Kayit yok.")}</p>
          </ManagerDrawerSection>

          <ManagerDrawerSection
            eyebrow="Kayitlar"
            title="Icerik"
            meta={<span className="manager-mini-chip">{loading ? "Yukleniyor..." : effectivePayload?.records.length ?? 0}</span>}
          >
            {loading ? (
              <div className="empty">Detaylar hazirlaniyor.</div>
            ) : !effectivePayload?.records.length ? (
              <div className="empty">{effectivePayload?.emptyMessage ?? "Gosterilecek kayit bulunmuyor."}</div>
            ) : (
              <div className="stack">
                {effectivePayload.records.map((record) => (
                  <article className="manager-overview-note" key={record.id}>
                    <div className="manager-entity-headline">
                      <div className="manager-table-primary">
                        <strong>{record.title}</strong>
                        {record.subtitle ? <span>{record.subtitle}</span> : null}
                      </div>
                    </div>
                    {record.description ? <p>{record.description}</p> : null}
                    {record.meta?.length ? (
                      <div className="toolbar-tight">
                        {record.meta.map((item) => (
                          <span className="manager-mini-chip" key={`${record.id}-${item}`}>
                            {item}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {record.files?.length ? (
                      <div className="file-list">
                        {record.files.map((file) => (
                          <div className="file-row" key={file.id}>
                            <div>
                              <strong>{file.name}</strong>
                              <div className="tiny muted">{file.extension ?? "Dosya"}</div>
                            </div>
                            <div className="toolbar-tight">
                              {file.previewPath ? (
                                <button
                                  className="button ghost"
                                  onClick={() => void handleFileOpen(file, "preview")}
                                  type="button"
                                >
                                  Onizle
                                </button>
                              ) : null}
                              <button
                                className="button ghost"
                                onClick={() => void handleFileOpen(file, "download")}
                                type="button"
                              >
                                Indir
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </ManagerDrawerSection>

          {effectivePayload?.links?.length ? (
            <ManagerDrawerSection eyebrow="Hizli git" title="Moduller">
              <div className="toolbar-tight">
                {effectivePayload.links.map((link) => (
                  <a className="button ghost" href={link.href} key={link.href}>
                    {link.label}
                  </a>
                ))}
              </div>
            </ManagerDrawerSection>
          ) : null}
        </div>
      </ManagerDrawer>

      {previewUrl ? (
        <div className="field-v3-preview-shell">
          <button aria-label="Kapat" className="field-v3-preview-backdrop" onClick={closePreview} type="button" />
          <div className="field-v3-preview-panel glass" tabIndex={-1}>
            <div className="field-v3-preview-header">
              <div>
                <div className="field-v3-kicker">Dosya onizleme</div>
                <h2>{previewName}</h2>
              </div>
              <button className="button ghost" type="button" onClick={closePreview}>
                Kapat
              </button>
            </div>

            {previewName?.toLowerCase().endsWith(".pdf") ? (
              <iframe className="field-v3-preview-frame" src={previewUrl} title={previewName} />
            ) : (
              <img
                alt={previewName ?? "onizleme"}
                className="field-v3-preview-frame"
                src={previewUrl}
                style={{ objectFit: "contain" }}
              />
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
