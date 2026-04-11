type AlertTone = "info" | "success" | "error";

const ERROR_HINTS = [
  "yuklenemedi",
  "yüklenemedi",
  "gonderilemedi",
  "gönderilemedi",
  "kaydedilemedi",
  "olusturulamadi",
  "oluşturulamadı",
  "guncellenemedi",
  "güncellenemedi",
  "silinemedi",
  "kaldirilamadi",
  "kaldırılamadı",
  "bulunamadi",
  "bulunamadı",
  "gecersiz",
  "geçersiz",
  "gerekir",
  "reddedildi",
  "hata",
  "basarisiz",
  "başarısız"
];

const SUCCESS_HINTS = [
  "kaydedildi",
  "olusturuldu",
  "oluşturuldu",
  "guncellendi",
  "güncellendi",
  "aktif edildi",
  "pasife alindi",
  "pasife alındı",
  "arsivlendi",
  "arşivlendi",
  "indirildi",
  "eklendi",
  "gonderildi",
  "gönderildi",
  "yuklendi",
  "yüklendi",
  "silindi",
  "hazir",
  "hazır"
];

function inferAlertTone(message: string): AlertTone {
  const normalized = message.toLocaleLowerCase("tr-TR");

  if (ERROR_HINTS.some((token) => normalized.includes(token))) {
    return "error";
  }

  if (SUCCESS_HINTS.some((token) => normalized.includes(token))) {
    return "success";
  }

  return "info";
}

export function AlertMessage({
  message,
  tone,
  className
}: {
  message: string;
  tone?: AlertTone;
  className?: string;
}) {
  const resolvedTone = tone ?? inferAlertTone(message);
  const resolvedClassName = ["alert", `alert-${resolvedTone}`, className].filter(Boolean).join(" ");

  return (
    <div className={resolvedClassName} role={resolvedTone === "error" ? "alert" : "status"}>
      {message}
    </div>
  );
}
