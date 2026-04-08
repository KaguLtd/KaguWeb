import { PrismaClient, Role } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const fieldPassword = await bcrypt.hash("Saha123!", 10);

  const managerPassword = await bcrypt.hash("Kagu123!", 10);
  const existingManager = await prisma.user.findFirst({
    where: { role: Role.MANAGER },
    orderBy: { createdAt: "asc" }
  });

  const manager =
    existingManager ??
    (await prisma.user.upsert({
      where: { username: "yonetici" },
      update: {},
      create: {
        username: "yonetici",
        displayName: "Ana Yonetici",
        passwordHash: managerPassword,
        role: Role.MANAGER
      }
    }));

  const saha1 = await prisma.user.upsert({
    where: { username: "saha.1" },
    update: {},
    create: {
      username: "saha.1",
      displayName: "Saha Personeli 1",
      passwordHash: fieldPassword,
      role: Role.FIELD
    }
  });

  await prisma.user.upsert({
    where: { username: "saha.2" },
    update: {},
    create: {
      username: "saha.2",
      displayName: "Saha Personeli 2",
      passwordHash: fieldPassword,
      role: Role.FIELD
    }
  });

  const project = await prisma.project.upsert({
    where: { code: "PRJ-001" },
    update: {},
    create: {
      code: "PRJ-001",
      name: "Ornek Fiber Sahasi",
      description: "Seed icin olusturulan ornek saha projesi.",
      storageRoot: "projects/seed-prj-001",
      createdById: manager.id
    }
  });

  const today = new Date();
  const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  const program = await prisma.dailyProgram.upsert({
    where: { date },
    update: {},
    create: {
      date,
      createdById: manager.id
    }
  });

  const programProject = await prisma.dailyProgramProject.upsert({
    where: {
      dailyProgramId_projectId: {
        dailyProgramId: program.id,
        projectId: project.id
      }
    },
    update: {},
    create: {
      dailyProgramId: program.id,
      projectId: project.id,
      addedById: manager.id
    }
  });

  await prisma.projectAssignment.upsert({
    where: {
      dailyProgramProjectId_userId: {
        dailyProgramProjectId: programProject.id,
        userId: saha1.id
      }
    },
    update: {},
    create: {
      dailyProgramProjectId: programProject.id,
      userId: saha1.id,
      assignedById: manager.id
    }
  });
}

main()
  .catch(async (error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
