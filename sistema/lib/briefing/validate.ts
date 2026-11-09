import { normalizeInstagramHandle } from "@/lib/instagram/normalize";

export interface BriefingInput {
  instagram: string;
  site: string;
  whatsapp: string;
  whatsappConsent: boolean;
  salesPain: string;
}

export interface CleanBriefing {
  handle: string;
  site: string | null;
  whatsapp: string; // formato +55DDDNUMERO
  whatsappConsent: boolean;
  salesPain: string;
}

export type FieldErrors = Partial<Record<keyof BriefingInput, string>>;

export const LIMITS = { site: 300, salesPain: 1000 };

/** WhatsApp brasileiro: DDD + número (10 ou 11 dígitos), com ou sem +55. */
export function normalizeWhatsapp(input: string): string | null {
  let d = (input ?? "").replace(/\D/g, "");
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return null;
  const ddd = Number(d.slice(0, 2));
  if (ddd < 11 || ddd > 99) return null;
  if (d.length === 11 && d[2] !== "9") return null; // celular com 9 dígitos começa com 9
  return `+55${d}`;
}

export function normalizeSite(input: string): string | null | "invalid" {
  const s = (input ?? "").trim();
  if (!s) return null;
  if (s.length > LIMITS.site) return "invalid";
  try {
    const url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    if (!url.hostname.includes(".")) return "invalid";
    return url.toString();
  } catch {
    return "invalid";
  }
}

export function validateBriefing(input: BriefingInput): { ok: true; data: CleanBriefing } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};

  const handle = normalizeInstagramHandle(input.instagram);
  if (!handle.ok) errors.instagram = handle.error;

  const site = normalizeSite(input.site);
  if (site === "invalid") errors.site = "Esse link não parece válido. Ex.: linktr.ee/seunegocio ou seusite.com.br";

  const whatsapp = normalizeWhatsapp(input.whatsapp);
  if (!whatsapp) errors.whatsapp = "Informe o WhatsApp com DDD, por exemplo (11) 99999-8888.";

  const salesPain = (input.salesPain ?? "").trim();
  if (salesPain.length < 3) errors.salesPain = "Conte em poucas palavras o que mais te incomoda nas vendas hoje.";
  else if (salesPain.length > LIMITS.salesPain) errors.salesPain = `Use no máximo ${LIMITS.salesPain} caracteres.`;

  if (Object.keys(errors).length > 0 || !handle.ok || site === "invalid" || !whatsapp) return { ok: false, errors };

  return {
    ok: true,
    data: { handle: handle.handle, site, whatsapp, whatsappConsent: !!input.whatsappConsent, salesPain },
  };
}
