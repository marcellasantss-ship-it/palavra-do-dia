const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/palavra', async (req, res) => {
  const hoje = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  const prompt = `Voce e um estudioso biblico evangelico. Hoje e ${hoje}. Escolha UM trecho da Biblia inteira (qualquer livro do AT ou NT) para este dia. Varie entre Antigo e Novo Testamento. IMPORTANTE: Responda SOMENTE com o objeto JSON, sem nenhum texto antes ou depois, sem markdown: {"referencia":"ex: Salmos 46:1-3","tema":"frase curta do tema do dia","versiculoNVI":"texto completo em NVI","versiculoARC":"texto completo em ARC","contextoHistorico":"dois paragrafos sobre contexto historico e autoria do livro","oQueTexto":"dois paragrafos sobre o que o texto comunica","paralelos":[{"referencia":"ref1","texto":"versiculo paralelo curto"},{"referencia":"ref2","texto":"versiculo paralelo curto"},{"referencia":"ref3","texto":"versiculo paralelo curto"}],"reflexao":"dois paragrafos de reflexao universal sobre este texto, escrita para qualquer pessoa que esteja lendo, sem mencionar genero profissao ou situacao pessoal especifica. Fale sobre o que este texto ensina para a vida humana os desafios comuns a todos e como esta mensagem biblica se aplica ao cotidiano de quem busca crescer espiritualmente","aplicacao":"1) primeira aplicacao pratica\n2) segunda aplicacao pratica\n3) terceira aplicacao pratica","palavraChave":"PALAVRA - explicacao em duas linhas de por que e a ancora espiritual do dia","oracao":"oracao de seis linhas em primeira pessoa baseada no texto"}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(500).json({ error: data.error?.message || 'Erro na API' });
    }

    const texto = data.content.map(i => i.text || '').join('');
    const limpo = texto.replace(/```json|```/g, '').trim();
    const estudo = JSON.parse(limpo);

    res.json(estudo);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno. Tente novamente.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
