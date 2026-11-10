import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { InstagramProfile } from "@/lib/instagram/types";
import type { Metrics } from "@/lib/metrics";
import { REPORT_MODEL } from "./constants";
import { checkReport } from "./guardrails";
import { buildUserMessage, SYSTEM_PROMPT } from "./prompt";
import { type ReportContent, ReportContentSchema } from "./schema";

export interface WriterUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface ReportWriter {
  name: string;
  write(userMessage: string): Promise<{ content: ReportContent; usage: WriterUsage }>;
}

/** Erro que vale tentar de novo mais tarde (limite de uso, instabilidade, rede). */
export class TemporaryWriterError extends Error {}
/** Erro de configuração (chave inválida, sem crédito): precisa de ação da Milena. */
export class ConfigWriterError extends Error {}

export function createClaudeWriter(apiKey: string | undefined): ReportWriter {
  return {
    name: "claude",
    async write(userMessage) {
      if (!apiKey) throw new ConfigWriterError("ANTHROPIC_API_KEY não configurada");
      const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 120_000 });
      let response;
      try {
        response = await client.beta.messages.parse({
          model: REPORT_MODEL,
          max_tokens: 16000,
          // Se o filtro de segurança recusar por engano, a própria API tenta outro modelo.
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: { effort: "medium", format: betaZodOutputFormat(ReportContentSchema) },
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: userMessage }],
        });
      } catch (err) {
        if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
          throw new ConfigWriterError(`Anthropic recusou a chave: ${err.message}`);
        }
        if (err instanceof Anthropic.BadRequestError && /credit|billing|balance/i.test(err.message)) {
          throw new ConfigWriterError(`Anthropic sem crédito: ${err.message}`);
        }
        if (
          err instanceof Anthropic.RateLimitError ||
          err instanceof Anthropic.InternalServerError ||
          err instanceof Anthropic.APIConnectionError
        ) {
          throw new TemporaryWriterError(err.message);
        }
        if (err instanceof Anthropic.APIError && (err.status === 529 || err.status === 503)) {
          throw new TemporaryWriterError(err.message);
        }
        throw err;
      }

      if (response.stop_reason === "refusal") throw new Error("o modelo recusou gerar o relatório");
      if (response.stop_reason === "max_tokens") throw new Error("o relatório ficou longo demais (max_tokens)");
      if (!response.parsed_output) throw new Error("resposta fora do formato esperado");
      return {
        content: response.parsed_output,
        usage: {
          model: response.model,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
      };
    },
  };
}

export interface GenerateInput {
  firstName: string;
  salesPain: string | null;
  profile: InstagramProfile;
  metrics: Metrics;
}

export type GenerateResult =
  | { ok: true; content: ReportContent; usage: WriterUsage[]; attempts: number }
  | { ok: false; content: ReportContent | null; usage: WriterUsage[]; problems: string[]; attempts: number };

export const MAX_WRITE_ATTEMPTS = 2;

/** Gera o texto e confere as regras. Se algo falhar, tenta uma segunda vez explicando o problema. */
export async function generateReportContent(input: GenerateInput, writer: ReportWriter): Promise<GenerateResult> {
  const baseMessage = buildUserMessage(input);
  const ctx = { sourceText: baseMessage, bestPostIds: input.metrics.best.map((p) => p.id) };
  const usage: WriterUsage[] = [];
  let last: { content: ReportContent; problems: string[] } | null = null;

  for (let attempt = 1; attempt <= MAX_WRITE_ATTEMPTS; attempt++) {
    const message =
      attempt === 1 || !last
        ? baseMessage
        : `${baseMessage}\n\nAtenção: uma versão anterior deste relatório foi recusada pela revisão automática porque ${last.problems.join("; ")}. Escreva de novo corrigindo isso.`;
    const r = await writer.write(message);
    usage.push(r.usage);
    const checked = checkReport(r.content, ctx);
    if (checked.problems.length === 0) return { ok: true, content: checked.content, usage, attempts: attempt };
    last = checked;
  }
  return { ok: false, content: last?.content ?? null, usage, problems: last?.problems ?? [], attempts: MAX_WRITE_ATTEMPTS };
}
