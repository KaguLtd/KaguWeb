import { Role } from "@prisma/client";
import { bootstrapAdmin } from "../src/users/utils/bootstrap-admin";

describe("bootstrapAdmin", () => {
  it("creates the first manager when the system is empty", async () => {
    const create = jest.fn().mockResolvedValue({
      id: "u_1",
      username: "yonetici",
      displayName: "Ana Yonetici",
      role: Role.MANAGER,
      createdAt: new Date("2026-03-23T09:00:00.000Z")
    });

    const result = await bootstrapAdmin(
      {
        user: {
          count: jest.fn().mockResolvedValue(0),
          create
        }
      },
      {
        username: "yonetici",
        displayName: "Ana Yonetici",
        password: "Kagu123!"
      }
    );

    expect(result.username).toBe("yonetici");
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data.role).toBe(Role.MANAGER);
    expect(create.mock.calls[0][0].data.passwordHash).not.toBe("Kagu123!");
  });

  it("rejects bootstrap when a manager already exists", async () => {
    await expect(
      bootstrapAdmin(
        {
          user: {
            count: jest.fn().mockResolvedValue(1),
            create: jest.fn()
          }
        },
        {
          username: "yonetici",
          displayName: "Ana Yonetici",
          password: "Kagu123!"
        }
      )
    ).rejects.toThrow("Yonetici kullanicisi zaten mevcut");
  });
});
