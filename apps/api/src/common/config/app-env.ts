type EnvSource = Record<string, unknown>;

function readString(env: EnvSource, key: string) {
  const value = env[key];
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

function readRequiredString(env: EnvSource, key: string, errors: string[]) {
  const value = readString(env, key);
  if (!value) {
    errors.push(`${key} is required.`);
    return "";
  }

  return value;
}

function readPort(env: EnvSource, errors: string[]) {
  const raw = readRequiredString(env, "PORT", errors);
  const port = Number(raw);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    errors.push("PORT must be an integer between 1 and 65535.");
    return "4000";
  }

  return String(port);
}

function readHttpUrl(env: EnvSource, key: string, errors: string[]) {
  const value = readRequiredString(env, key, errors);
  if (!value) {
    return "";
  }

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      errors.push(`${key} must use http or https.`);
    }
  } catch {
    errors.push(`${key} must be a valid URL.`);
  }

  return value;
}

export function validateAppEnv(env: EnvSource) {
  const errors: string[] = [];

  const databaseUrl = readRequiredString(env, "DATABASE_URL", errors);
  const jwtSecret = readRequiredString(env, "JWT_SECRET", errors);
  const port = readPort(env, errors);
  const webOrigin = readHttpUrl(env, "WEB_ORIGIN", errors);
  const storageRoot = readRequiredString(env, "STORAGE_ROOT", errors);
  const uploadTempRoot = readRequiredString(env, "UPLOAD_TEMP_ROOT", errors);
  const storagePublicBaseUrl = readString(env, "STORAGE_PUBLIC_BASE_URL");
  const vapidSubject = readString(env, "VAPID_SUBJECT");
  const vapidPublicKey = readString(env, "VAPID_PUBLIC_KEY");
  const vapidPrivateKey = readString(env, "VAPID_PRIVATE_KEY");

  if (storagePublicBaseUrl) {
    readHttpUrl({ STORAGE_PUBLIC_BASE_URL: storagePublicBaseUrl }, "STORAGE_PUBLIC_BASE_URL", errors);
  }

  if (vapidPublicKey && !vapidPrivateKey) {
    errors.push("VAPID_PRIVATE_KEY is required when VAPID_PUBLIC_KEY is set.");
  }

  if (vapidPrivateKey && !vapidPublicKey) {
    errors.push("VAPID_PUBLIC_KEY is required when VAPID_PRIVATE_KEY is set.");
  }

  if (errors.length) {
    throw new Error(`Environment validation failed:\n- ${errors.join("\n- ")}`);
  }

  return {
    ...env,
    DATABASE_URL: databaseUrl,
    JWT_SECRET: jwtSecret,
    PORT: port,
    WEB_ORIGIN: webOrigin,
    STORAGE_ROOT: storageRoot,
    STORAGE_DRIVER: "local",
    UPLOAD_TEMP_ROOT: uploadTempRoot,
    STORAGE_PUBLIC_BASE_URL: storagePublicBaseUrl,
    VAPID_SUBJECT: vapidSubject,
    VAPID_PUBLIC_KEY: vapidPublicKey,
    VAPID_PRIVATE_KEY: vapidPrivateKey
  };
}
