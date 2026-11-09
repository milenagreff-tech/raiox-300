// Log simples, sem dados pessoais: nunca passe e-mail, telefone ou nome aqui.
// Use ids de pedido e de transação para rastrear.

type Fields = Record<string, string | number | boolean | null | undefined>;

function write(level: "info" | "warn" | "error", msg: string, fields?: Fields) {
  const line = JSON.stringify({ level, msg, ...fields, at: new Date().toISOString() });
  if (process.env.NODE_ENV === "test") return;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  info: (msg: string, f?: Fields) => write("info", msg, f),
  warn: (msg: string, f?: Fields) => write("warn", msg, f),
  error: (msg: string, f?: Fields) => write("error", msg, f),
};
