import { NextResponse } from "next/server";
import { depsFromEnv, runJobs } from "@/lib/jobs/worker";
import { log } from "@/lib/log";
import { safeEqual } from "@/lib/payments/hotmart";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Chamado pela rotina agendada (a cada 2 minutos) para processar a fila.
// Protegido pelo segredo CRON_SECRET no cabeçalho Authorization: Bearer <segredo>.
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  try {
    const processed = await runJobs(depsFromEnv(), { maxJobs: 10 });
    return NextResponse.json({ ok: true, processadas: processed.length, tarefas: processed });
  } catch (err) {
    log.error("erro ao processar fila", { erro: (err as Error).message });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
