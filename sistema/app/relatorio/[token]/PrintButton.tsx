"use client";

export function PrintButton() {
  return (
    <button className="botao nao-imprimir" type="button" onClick={() => window.print()}>
      Baixar PDF
    </button>
  );
}
