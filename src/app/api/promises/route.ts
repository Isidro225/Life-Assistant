import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const promises = await prisma.promise.findMany({
    where: { fulfilled: false },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json(promises);
}

export async function PATCH(req: Request) {
  const { id, fulfilled } = await req.json();
  const promise = await prisma.promise.update({
    where: { id },
    data: { fulfilled },
  });
  return NextResponse.json(promise);
}
