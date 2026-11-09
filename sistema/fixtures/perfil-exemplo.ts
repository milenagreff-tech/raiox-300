import { extractHashtags, type InstagramPost, type InstagramProfile, type PostType } from "@/lib/instagram/types";

// Perfil fictício usado no modo de simulação (DRY_RUN=true): não gasta coleta.
// As datas são relativas a "agora", para as métricas de frequência fazerem sentido.

const CAPTIONS: { type: PostType; caption: string; likes: number; comments: number }[] = [
  { type: "reel", caption: "3 erros que fazem seu bolo afundar 🎂 Salva pra não esquecer! #confeitaria #bolocaseiro", likes: 412, comments: 38 },
  { type: "carrossel", caption: "Cardápio de Natal chegou! Arrasta pro lado e escolhe o seu. Encomendas pelo link da bio até 18/12. #natal #encomendas", likes: 268, comments: 54 },
  { type: "imagem", caption: "Bom dia com cheirinho de café ☕", likes: 96, comments: 4 },
  { type: "reel", caption: "Bastidores de uma encomenda de 200 docinhos. Quem aí já pediu docinho pra festa? #docinhos #bastidores", likes: 530, comments: 41 },
  { type: "imagem", caption: "Bolo de cenoura com cobertura de brigadeiro. Clássico que nunca sai de moda.", likes: 143, comments: 9 },
  { type: "carrossel", caption: "Tabela de tamanhos: quantas fatias rende cada bolo? Salva este post! #dicas #confeitaria", likes: 301, comments: 27 },
  { type: "imagem", caption: "Feliz sexta! 🧁", likes: 77, comments: 2 },
  { type: "reel", caption: "Recheio de ninho com morango em 30 segundos 🍓 Me chama no direct pra encomendar!", likes: 488, comments: 63 },
  { type: "imagem", caption: "Encomenda da semana: bolo de aniversário da Júlia, 5 aninhos 💕", likes: 158, comments: 12 },
  { type: "carrossel", caption: "Depoimentos de clientes que me enchem de alegria 🥹 #depoimentos", likes: 189, comments: 15 },
  { type: "imagem", caption: "Nova embalagem chegando!", likes: 102, comments: 6 },
  { type: "reel", caption: "Como eu monto um bolo de andar sem tombar. #tutorial", likes: 377, comments: 22 },
  { type: "imagem", caption: "Domingo de produção.", likes: 64, comments: 1 },
  { type: "imagem", caption: "Bolo de pote de maracujá. Disponível na pronta entrega hoje!", likes: 121, comments: 18 },
  { type: "carrossel", caption: "Antes e depois da decoração ✨", likes: 233, comments: 11 },
  { type: "reel", caption: "Teste de sabor com a minha filha 😂", likes: 612, comments: 47 },
  { type: "imagem", caption: "Fim de semana lotado, obrigada pela confiança!", likes: 88, comments: 7 },
  { type: "imagem", caption: "Brigadeiro gourmet 🍫 #brigadeiro", likes: 134, comments: 5 },
  { type: "carrossel", caption: "Como fazer sua encomenda: 1) escolha o sabor 2) escolha o tamanho 3) me chama no WhatsApp do link da bio", likes: 176, comments: 20 },
  { type: "imagem", caption: "Bolo naked cake para casamento civil.", likes: 147, comments: 8 },
  { type: "reel", caption: "Um dia na minha cozinha 👩‍🍳", likes: 295, comments: 19 },
  { type: "imagem", caption: "Sexta-feira é dia de bolo!", likes: 71, comments: 3 },
  { type: "imagem", caption: "Promoção de inauguração 10% off na primeira encomenda.", likes: 109, comments: 14 },
  { type: "carrossel", caption: "Nossos sabores mais pedidos de 2026 🏆", likes: 214, comments: 16 },
];

// Dias atrás de cada post (mais recente primeiro); espaçamento irregular de propósito.
const DAYS_AGO = [1, 3, 4, 7, 9, 12, 14, 17, 21, 24, 28, 31, 35, 38, 42, 47, 52, 56, 61, 66, 72, 79, 85, 93];

export function buildExampleProfile(handle = "@docesdaana", now = new Date()): InstagramProfile {
  const posts: InstagramPost[] = CAPTIONS.map((c, i) => ({
    id: `exemplo-${i + 1}`,
    type: c.type,
    timestamp: new Date(now.getTime() - DAYS_AGO[i] * 86400000 - (i % 5) * 3600000).toISOString(),
    caption: c.caption,
    likes: c.likes,
    comments: c.comments,
    hashtags: extractHashtags(c.caption),
    permalink: `https://www.instagram.com/p/exemplo${i + 1}/`,
  }));

  return {
    handle,
    name: "Doces da Ana | Confeitaria artesanal",
    biography: "Bolos e doces artesanais em Campinas 🎂\nEncomendas com 3 dias de antecedência\nEntrega em toda a cidade",
    website: "https://linktr.ee/docesdaana",
    category: "Confeitaria",
    followers: 4820,
    following: 612,
    mediaCount: 318,
    profilePictureUrl: null,
    posts,
    highlights: [{ title: "Cardápio" }, { title: "Clientes" }, { title: "Bastidores" }],
    provider: "simulacao",
    fetchedAt: now.toISOString(),
  };
}
