import Anthropic from "@anthropic-ai/sdk"
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod"
import { getStore } from "@netlify/blobs"
import type { Config } from "@netlify/functions"
import { z } from "zod"

// Um devocional por dia, igual para todo mundo. O primeiro acesso do dia gera
// o texto e guarda; os demais leem o que foi guardado (sem custo de API).

const Devocional = z.object({
  referencia: z.string().describe("Ex.: Salmos 46:1-3"),
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
Escolha UM trecho da Bíblia inteira, variando entre Antigo e Novo Testamento e entre gêneros (narrativa, poesia, profecia, evangelhos, cartas).
Os textos da NVI e da ARC devem ser citações fiéis dessas traduções. Prefira trechos curtos (1 a 4 versículos) que você conhece com segurança; não parafraseie dentro das aspas.
A reflexão deve servir a qualquer pessoa que busca crescer espiritualmente, sem supor gênero, idade ou situação de vida.
Escreva com clareza e calor, sem clichês.`

const FUSO = "America/Sao_Paulo"

function chaveDoDia(agora: Date): string {
  // en-CA formata como AAAA-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(agora)
}

async function gerar(agora: Date, recentes: string[]): Promise<Devocional> {
  const client = new Anthropic({ apiKey: Netlify.env.get("ANTHROPIC_API_KEY"), timeout: 50_000, maxRetries: 0 })
  const hoje = agora.toLocaleDateString("pt-BR", {
    timeZone: FUSO, weekday: "long", day: "numeric", month: "long", year: "numeric",
  })
  const evitar = recentes.length
    ? `\nNão repita nenhum destes trechos usados recentemente: ${recentes.join("; ")}.`
    : ""

  const msg = await client.beta.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 8000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(Devocional) },
    system: SISTEMA,
    messages: [{ role: "user", content: `Hoje é ${hoje}. Prepare o devocional do dia.${evitar}` }],
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
    const historico: string[] = (await store.get("historico", { type: "json" })) ?? []
    const estudo = await gerar(agora, historico.slice(-60))

    // Se dois acessos gerarem ao mesmo tempo, vale o primeiro que gravou.
    const { modified } = await store.setJSON(chave, estudo, { onlyIfNew: true })
    if (!modified) return Response.json(await store.get(chave, { type: "json" }))

    await store.setJSON("historico", [...historico, estudo.referencia].slice(-365))
    return Response.json(estudo)
  } catch (err) {
    console.error(err)
    return Response.json({ error: "Não foi possível preparar a Palavra agora. Tente de novo em instantes." }, { status: 500 })
  }
}

export const config: Config = { path: "/api/palavra", method: "GET" }
