import { NextResponse } from "next/server";
import { getAIEnvStatus } from "@/lib/ai/env-keys";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const status = getAIEnvStatus();
    return NextResponse.json(status);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Erro ao consultar status das chaves de IA." },
      { status: 500 }
    );
  }
}
