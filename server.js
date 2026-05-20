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

  const prompt = `Estudioso biblico evangelico. Hoje: ${hoje}. Escolha UM trecho da Biblia inteira (varie entre AT e NT). Responda SOMENTE JSON sem texto extra: {"referencia":"Salmos 46:1","tema":"tema curto","versiculoNVI":"texto NVI","versiculoARC":"texto ARC","contextoHistorico":"um paragrafo sobre contexto historico e autoria do livro","oQueTexto":"um paragrafo e meio explicando a mensagem central e o que o autor quis comunicar","paralelos":[{"referencia":"ref1","texto":"trecho curto"},{"referencia":"ref2","texto":"trecho curto"},{"referencia":"ref3","texto":"trecho curto"}],"reflexao":"um paragrafo de reflexao universal para qualquer pessoa que busca crescer espiritualmente sem mencionar genero ou situacao especifica","aplicacao":"1) aplicacao pratica\n2) aplicacao pratica\n3) aplicacao pratica","palavraChave":"PALAVRA - uma linha explicando por que e a ancora espiritual do dia","oracao":"oracao de 5 linhas em primeira pessoa baseada no texto"}`;

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
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    if (!response.ok) return res.status(500).json({ error: data.error?.message || 'Erro na API' });

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
