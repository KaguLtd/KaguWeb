import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { PrismaClient } from "@prisma/client";
import {
  bootstrapAdmin,
  type BootstrapAdminInput
} from "../src/users/utils/bootstrap-admin";

function loadRootEnv() {
  const rootEnvPath = resolve(__dirname, "../../../.env");
  if (!existsSync(rootEnvPath)) {
    return;
  }

  const raw = readFileSync(rootEnvPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function parseArgs(argv: string[]): BootstrapAdminInput {
  const values = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith("--")) {
      continue;
    }

    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      throw new Error(`Eksik arguman: ${current}`);
    }

    values.set(current.slice(2), next);
    index += 1;
  }

  const username = values.get("username")?.trim();
  const displayName = values.get("displayName")?.trim();
  const password = values.get("password");

  if (!username || !displayName || !password) {
    throw new Error(
      "Kullanim: npm.cmd run db:bootstrap-admin -- --username yonetici --displayName \"Ana Yonetici\" --password \"Kagu123!\""
    );
  }

  return {
    username,
    displayName,
    password
  };
}

async function main() {
  loadRootEnv();

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL tanimli degil. Once kok dizinde .env dosyasini olusturun.");
  }

  const input = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();

  try {
    const manager = await bootstrapAdmin(prisma, input);
    console.log(
      `Ilk yonetici olusturuldu: ${manager.displayName} (@${manager.username})`
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

