import Image from "next/image";

/** Moldura das páginas do cliente: faixa turquesa no topo, conteúdo e rodapé. */
export function Shell({ children, withPhoto = false }: { children: React.ReactNode; withPhoto?: boolean }) {
  return (
    <>
      <header className="topo">
        <div className="topo-inner">
          <span className="marca">Milena IA</span>
          <span className="chip chip-amarelo">Raio-X de Conversão</span>
        </div>
      </header>
      <main className="container">
        {withPhoto && (
          <div className="foto-wrap">
            {/* Foto sem recorte, na proporção original (1086 x 1448) */}
            <Image
              src="/foto-milena.jpg"
              alt="Milena, da Milena IA"
              width={1086}
              height={1448}
              sizes="160px"
              className="foto"
              priority
            />
          </div>
        )}
        {children}
      </main>
      <footer className="rodape">
        <p>
          Milena IA · <a href="/privacidade">Política de privacidade</a>
        </p>
      </footer>
    </>
  );
}

export function Aviso({ tone = "info", children }: { tone?: "info" | "erro" | "ok"; children: React.ReactNode }) {
  return (
    <div className={`aviso aviso-${tone}`} role={tone === "erro" ? "alert" : "status"}>
      {children}
    </div>
  );
}
