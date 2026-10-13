import Anthropic from "@anthropic-ai/sdk"
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod"
import { getStore } from "@netlify/blobs"
import type { Config } from "@netlify/functions"
import { z } from "zod"

// Um devocional por dia, igual para todo mundo. O primeiro acesso do dia gera
// o texto e guarda; os demais leem o que foi guardado (sem custo de API).

const Devocional = z.object({
  referencia: z.string().describe("Livro capítulo:versículos"),
  tema: z.string().describe("Tema curto, até 6 palavras"),
  versiculoNVI: z.string().describe("Texto do trecho na Nova Versão Internacional"),
  versiculoARC: z.string().describe("Texto do trecho na Almeida Revista e Corrigida"),
  contextoHistorico: z.string().describe("Um parágrafo sobre contexto histórico e autoria do livro"),
  oQueTexto: z.string().describe("Um parágrafo e meio sobre a mensagem central e o que o autor quis comunicar"),
  paralelos: z
    .array(z.object({ referencia: z.string(), texto: z.string().describe("Trecho curto") }))
    .describe("Exatamente 3 versículos paralelos"),
  reflexao: z.string().describe("Um parágrafo de reflexão"),
  aplicacao: z.string().describe("Três aplicações práticas, no formato '1) ...\\n2) ...\\n3) ...'"),
  palavraChave: z.string().describe("PALAVRA - uma linha explicando por que é a âncora espiritual do dia"),
  oracao: z.string().describe("Oração de cerca de 5 linhas, em primeira pessoa, baseada no texto"),
})
type Devocional = z.infer<typeof Devocional>

const SISTEMA = `Você é um estudioso bíblico evangélico que escreve um devocional diário em português do Brasil.
A cada dia você recebe o livro da Bíblia do qual deve escolher UM trecho.
Os textos da NVI e da ARC devem ser citações fiéis dessas traduções. Prefira trechos curtos (1 a 4 versículos) que você conhece com segurança; não parafraseie dentro das aspas.
A reflexão deve servir a qualquer pessoa que busca crescer espiritualmente, sem supor gênero, idade ou situação de vida.
Escreva com clareza e calor, sem clichês.`

// O livro é sorteado aqui, no código. Deixar a escolha só com a IA faz ela
// voltar sempre aos mesmos trechos famosos.
const LIVROS = [
  "Gênesis", "Êxodo", "Levítico", "Números", "Deuteronômio", "Josué", "Juízes", "Rute",
  "1 Samuel", "2 Samuel", "1 Reis", "2 Reis", "1 Crônicas", "2 Crônicas", "Esdras", "Neemias",
  "Ester", "Jó", "Salmos", "Provérbios", "Eclesiastes", "Cânticos", "Isaías", "Jeremias",
  "Lamentações", "Ezequiel", "Daniel", "Oseias", "Joel", "Amós", "Obadias", "Jonas", "Miqueias",
  "Naum", "Habacuque", "Sofonias", "Ageu", "Zacarias", "Malaquias",
  "Mateus", "Marcos", "Lucas", "João", "Atos", "Romanos", "1 Coríntios", "2 Coríntios",
  "Gálatas", "Efésios", "Filipenses", "Colossenses", "1 Tessalonicenses", "2 Tessalonicenses",
  "1 Timóteo", "2 Timóteo", "Tito", "Filemom", "Hebreus", "Tiago", "1 Pedro", "2 Pedro",
  "1 João", "2 João", "3 João", "Judas", "Apocalipse",
]

type Uso = { livro: string; referencia: string }

function sortearLivro(historico: Uso[]): string {
  const recentes = new Set(historico.slice(-40).map(u => u.livro))
  const livres = LIVROS.filter(l => !recentes.has(l))
  return livres[Math.floor(Math.random() * livres.length)]
}

const FUSO = "America/Sao_Paulo"

function chaveDoDia(agora: Date): string {
  // en-CA formata como AAAA-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(agora)
}

async function gerar(agora: Date, livro: string, historico: Uso[]): Promise<Devocional> {
  const client = new Anthropic({ apiKey: Netlify.env.get("ANTHROPIC_API_KEY"), timeout: 50_000, maxRetries: 0 })
  const hoje = agora.toLocaleDateString("pt-BR", {
    timeZone: FUSO, weekday: "long", day: "numeric", month: "long", year: "numeric",
  })
  const usados = historico.filter(u => u.livro === livro).map(u => u.referencia)
  const evitar = usados.length ? `\nJá foram usados deste livro (não repita): ${usados.join("; ")}.` : ""

  const msg = await client.beta.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 8000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(Devocional) },
    system: SISTEMA,
    messages: [{ role: "user", content: `Hoje é ${hoje}. Prepare o devocional do dia com um trecho do livro de ${livro}.${evitar}` }],
  })

  if (msg.stop_reason === "refusal") throw new Error("O modelo recusou o pedido")
  if (msg.stop_reason === "max_tokens") throw new Error("Resposta cortada (max_tokens)")
  if (!msg.parsed_output) throw new Error("Resposta sem o formato esperado")
  return msg.parsed_output
}

export default async () => {
  const agora = new Date()
  const chave = chaveDoDia(agora)
  const store = getStore({ name: "devocionais", consistency: "strong" })

  const salvo = await store.get(chave, { type: "json" })
  if (salvo) return Response.json(salvo)

  try {
    const historico: Uso[] = (await store.get("historico", { type: "json" })) ?? []
    const livro = sortearLivro(historico)
    const estudo = await gerar(agora, livro, historico)

    // Se dois acessos gerarem ao mesmo tempo, vale o primeiro que gravou.
    const { modified } = await store.setJSON(chave, estudo, { onlyIfNew: true })
    if (!modified) return Response.json(await store.get(chave, { type: "json" }))

    await store.setJSON("historico", [...historico, { livro, referencia: estudo.referencia }].slice(-1000))
    return Response.json(estudo)
  } catch (err) {
    console.error(err)
    return Response.json({ error: "Não foi possível preparar a Palavra agora. Tente de novo em instantes." }, { status: 500 })
  }
}

export const config: Config = { path: "/api/palavra", method: "GET" }
