import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const summaries = await prisma.summary.findMany({
    orderBy: { date: "desc" },
    take: 10,
    include: {
      conversation: {
        include: {
          tasks: true,
          promises: true,
          events: true,
        },
      },
    },
  });
  return NextResponse.json(summaries);
}
