import { NextResponse } from "next/server";
import { log } from "@/lib/log";
import { mailerFromEnv } from "@/lib/messaging/email";
import { handlePaymentEvent } from "@/lib/payments/handle-event";
import { createHotmartAdapter } from "@/lib/payments/hotmart";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 200_000;

export async function POST(req: Request) {
  const adapter = createHotmartAdapter(process.env.HOTMART_HOTTOK);

  const rawBody = await req.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, erro: "corpo grande demais" }, { status: 413 });
  }

  if (!adapter.verify(req.headers, rawBody)) {
    log.warn("webhook hotmart com hottok inválido");
    return NextResponse.json({ ok: false, erro: "não autorizado" }, { status: 401 });
  }

  let event;
  try {
    event = adapter.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, erro: "JSON inválido" }, { status: 400 });
  }

  try {
    const result = await handlePaymentEvent(event, {
      store: getStore(),
      mailer: mailerFromEnv(),
      appUrl: process.env.APP_URL ?? new URL(req.url).origin,
      allowedProductId: process.env.HOTMART_PRODUCT_ID || null,
    });
    log.info("webhook hotmart processado", { evento: event.eventType, resultado: result.outcome });
    return NextResponse.json({ ok: true, resultado: result.outcome });
  } catch (err) {
    // Erro 500 faz a Hotmart tentar de novo mais tarde, o que é o que queremos.
    log.error("erro no webhook hotmart", { evento: event.eventType, erro: (err as Error).message });
    return NextResponse.json({ ok: false, erro: "erro interno" }, { status: 500 });
  }
}
