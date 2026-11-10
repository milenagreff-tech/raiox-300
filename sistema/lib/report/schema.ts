import { z } from "zod";

// Formato que o Claude devolve (JSON estruturado). As quantidades exatas (3 pontos de atenção,
// até 2 posts) são conferidas no código depois, em guardrails.ts.

export const ReportContentSchema = z.object({
  saudacao: z.string().describe("Uma frase curta falando com a pessoa pelo primeiro nome."),
  retrato_do_perfil: z
    .array(z.string())
    .describe("1 a 3 parágrafos: como a bio e o link da bio se apresentam hoje."),
  consistencia_e_formatos: z
    .array(z.string())
    .describe("1 a 3 parágrafos: o que os números de frequência, formatos e engajamento mostram."),
  o_que_esta_funcionando: z.object({
    introducao: z.string(),
    posts: z
      .array(z.object({ id: z.string().describe("id exato de um dos posts em melhores_posts"), por_que: z.string() }))
      .describe("Os posts de melhor desempenho (no máximo 2), cada um com uma explicação curta."),
  }),
  pontos_de_atencao: z
    .array(z.object({ titulo: z.string(), explicacao: z.string() }))
    .describe("Exatamente 3 pontos onde o perfil provavelmente perde conversão."),
  ajuste_da_semana: z.object({
    titulo: z.string(),
    passos: z.array(z.string()).describe("2 a 4 passos práticos e simples."),
  }),
});

export type ReportContent = z.infer<typeof ReportContentSchema>;
