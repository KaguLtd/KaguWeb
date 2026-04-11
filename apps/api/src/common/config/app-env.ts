type EnvSource = Record<string, unknown>;
const storageDriverValues = ["local", "s3-compatible"] as const;
const objectStorageAccessModeValues = ["public", "signed"] as const;

function readEnum<T extends readonly string[]>(
  env: EnvSource,
  key: string,
  values: T,
  errors: string[],
  fallback?: T[number]
) {
  const value = readString(env, key);
  if (!value) {
    return fallback;
  }

  if (!values.includes(value as T[number])) {
    errors.push(`${key} must be one of: ${values.join(", ")}.`);
    return fallback;
  }

  return value as T[number];
}

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
  const storageDriver = readEnum(env, "STORAGE_DRIVER", storageDriverValues, errors, "local");
  const storagePublicBaseUrl = readString(env, "STORAGE_PUBLIC_BASE_URL");
  const objectStorageAccessMode = readEnum(
    env,
    "OBJECT_STORAGE_ACCESS_MODE",
    objectStorageAccessModeValues,
    errors,
    "public"
  );
  const objectStorageEndpoint = readString(env, "OBJECT_STORAGE_ENDPOINT");
  const objectStorageRegion = readString(env, "OBJECT_STORAGE_REGION");
  const objectStorageBucket = readString(env, "OBJECT_STORAGE_BUCKET");
  const objectStorageAccessKeyId = readString(env, "OBJECT_STORAGE_ACCESS_KEY_ID");
  const objectStorageSecretAccessKey = readString(env, "OBJECT_STORAGE_SECRET_ACCESS_KEY");
  const objectStorageSignedUrlTtlSeconds = readString(env, "OBJECT_STORAGE_SIGNED_URL_TTL_SECONDS");
  const vapidSubject = readString(env, "VAPID_SUBJECT");
  const vapidPublicKey = readString(env, "VAPID_PUBLIC_KEY");
  const vapidPrivateKey = readString(env, "VAPID_PRIVATE_KEY");

  if (storagePublicBaseUrl) {
    readHttpUrl({ STORAGE_PUBLIC_BASE_URL: storagePublicBaseUrl }, "STORAGE_PUBLIC_BASE_URL", errors);
  }

  if (storageDriver === "s3-compatible") {
    if (!objectStorageEndpoint) {
      errors.push("OBJECT_STORAGE_ENDPOINT is required when STORAGE_DRIVER is s3-compatible.");
    } else {
      readHttpUrl({ OBJECT_STORAGE_ENDPOINT: objectStorageEndpoint }, "OBJECT_STORAGE_ENDPOINT", errors);
    }

    if (!objectStorageRegion) {
      errors.push("OBJECT_STORAGE_REGION is required when STORAGE_DRIVER is s3-compatible.");
    }

    if (!objectStorageBucket) {
      errors.push("OBJECT_STORAGE_BUCKET is required when STORAGE_DRIVER is s3-compatible.");
    }

    if (!objectStorageAccessKeyId) {
      errors.push("OBJECT_STORAGE_ACCESS_KEY_ID is required when STORAGE_DRIVER is s3-compatible.");
    }

    if (!objectStorageSecretAccessKey) {
      errors.push("OBJECT_STORAGE_SECRET_ACCESS_KEY is required when STORAGE_DRIVER is s3-compatible.");
    }

    if (objectStorageAccessMode === "public" && !storagePublicBaseUrl) {
      errors.push("STORAGE_PUBLIC_BASE_URL is required when OBJECT_STORAGE_ACCESS_MODE is public.");
    }

    if (objectStorageAccessMode === "signed") {
      const ttl = Number(objectStorageSignedUrlTtlSeconds);
      if (!Number.isInteger(ttl) || ttl < 60) {
        errors.push("OBJECT_STORAGE_SIGNED_URL_TTL_SECONDS must be an integer of at least 60 when OBJECT_STORAGE_ACCESS_MODE is signed.");
      }
    }
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
    STORAGE_DRIVER: storageDriver,
    STORAGE_PUBLIC_BASE_URL: storagePublicBaseUrl,
    OBJECT_STORAGE_ACCESS_MODE: objectStorageAccessMode,
    OBJECT_STORAGE_ENDPOINT: objectStorageEndpoint,
    OBJECT_STORAGE_REGION: objectStorageRegion,
    OBJECT_STORAGE_BUCKET: objectStorageBucket,
    OBJECT_STORAGE_ACCESS_KEY_ID: objectStorageAccessKeyId,
    OBJECT_STORAGE_SECRET_ACCESS_KEY: objectStorageSecretAccessKey,
    OBJECT_STORAGE_SIGNED_URL_TTL_SECONDS: objectStorageSignedUrlTtlSeconds,
    VAPID_SUBJECT: vapidSubject,
    VAPID_PUBLIC_KEY: vapidPublicKey,
    VAPID_PRIVATE_KEY: vapidPrivateKey
  };
}
