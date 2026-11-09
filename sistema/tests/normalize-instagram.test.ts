import { describe, expect, it } from "vitest";
import { normalizeInstagramHandle } from "@/lib/instagram/normalize";

const ok = (input: string) => {
  const r = normalizeInstagramHandle(input);
  if (!r.ok) throw new Error(`esperava aceitar "${input}": ${r.error}`);
  return r.handle;
};
const rejects = (input: string) => expect(normalizeInstagramHandle(input).ok).toBe(false);

describe("normalização do @ do Instagram", () => {
  it("aceita formatos comuns e devolve @usuario em minúsculas", () => {
    expect(ok("@MilenaIA")).toBe("@milenaia");
    expect(ok("milena.ia")).toBe("@milena.ia");
    expect(ok("  @@loja_da_ana  ")).toBe("@loja_da_ana");
    expect(ok("instagram.com/loja_da_ana")).toBe("@loja_da_ana");
    expect(ok("https://www.instagram.com/loja_da_ana/")).toBe("@loja_da_ana");
    expect(ok("https://instagram.com/loja_da_ana?igsh=abc123&utm_source=qr")).toBe("@loja_da_ana");
    expect(ok("http://m.instagram.com/Loja.Da.Ana")).toBe("@loja.da.ana");
    expect(ok("instagr.am/lojadaana")).toBe("@lojadaana");
  });

  it("rejeita links que não são de perfil", () => {
    rejects("https://www.instagram.com/p/C1abcDEF/");
    rejects("https://www.instagram.com/reel/C1abcDEF/");
    rejects("instagram.com/stories/lojadaana/123");
    rejects("https://www.instagram.com/explore/tags/moda/");
    rejects("https://www.instagram.com/lojadaana/reels/");
    rejects("https://www.instagram.com/");
  });

  it("rejeita links de outros sites", () => {
    rejects("https://linktr.ee/lojadaana");
    rejects("facebook.com/lojadaana");
    rejects("https://instagram.com.golpe.com/lojadaana");
  });

  it("rejeita nomes inválidos", () => {
    rejects("");
    rejects("loja da ana");
    rejects(".lojadaana");
    rejects("lojadaana.");
    rejects("loja..ana");
    rejects("loja-da-ana");
    rejects("a".repeat(31));
    rejects("@");
  });
});
