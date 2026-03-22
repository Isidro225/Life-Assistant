import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const tasks = await prisma.task.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json(tasks);
}

export async function PATCH(req: Request) {
  const { id, completed } = await req.json();
  const task = await prisma.task.update({
    where: { id },
    data: { completed },
  });
  return NextResponse.json(task);
}
