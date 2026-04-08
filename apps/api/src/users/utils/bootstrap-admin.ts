import { Role } from "@prisma/client";
import { hash } from "bcryptjs";

export interface BootstrapAdminInput {
  username: string;
  displayName: string;
  password: string;
}

export interface BootstrapAdminPrisma {
  user: {
    count(args: { where: { role: Role } }): Promise<number>;
    create(args: {
      data: {
        username: string;
        displayName: string;
        passwordHash: string;
        role: Role;
      };
      select: {
        id: true;
        username: true;
        displayName: true;
        role: true;
        createdAt: true;
      };
    }): Promise<{
      id: string;
      username: string;
      displayName: string;
      role: Role;
      createdAt: Date;
    }>;
  };
}

export async function bootstrapAdmin(
  prisma: BootstrapAdminPrisma,
  input: BootstrapAdminInput
) {
  if (!input.username.trim() || !input.displayName.trim()) {
    throw new Error("Kullanici adi ve gorunen ad bos olamaz.");
  }

  const existingManagerCount = await prisma.user.count({
    where: {
      role: Role.MANAGER
    }
  });

  if (existingManagerCount > 0) {
    throw new Error(
      "Yonetici kullanicisi zaten mevcut. db:bootstrap-admin yalnizca bos kurulum icin kullanilabilir."
    );
  }

  if (input.password.trim().length < 6) {
    throw new Error("Yonetici sifresi en az 6 karakter olmali.");
  }

  const passwordHash = await hash(input.password, 10);

  return prisma.user.create({
    data: {
      username: input.username.trim(),
      displayName: input.displayName.trim(),
      passwordHash,
      role: Role.MANAGER
    },
    select: {
      id: true,
      username: true,
      displayName: true,
      role: true,
      createdAt: true
    }
  });
}
