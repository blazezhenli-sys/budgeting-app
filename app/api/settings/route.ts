import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { badRequest, requireApiUser } from "@/lib/server/api";
import { ensureSettings } from "@/lib/server/settings";
import { settingsSchema } from "@/lib/validation/schemas";

export async function GET() {
  const { user, response } = await requireApiUser();
  if (!user) return response!;

  const settings = await ensureSettings(user.id);
  return NextResponse.json({ settings });
}

export async function PUT(request: Request) {
  const { user, response } = await requireApiUser();
  if (!user) return response!;

  const payload = settingsSchema.safeParse(await request.json());
  if (!payload.success) {
    return badRequest("Invalid settings payload");
  }

  const settings = await prisma.setting.upsert({
    where: { userId: user.id },
    update: payload.data,
    create: {
      userId: user.id,
      ...payload.data,
    },
  });

  return NextResponse.json({ settings });
}
