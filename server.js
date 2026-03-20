const express = require('express');
const cors    = require('cors');

const app = express();
app.use(express.json({ limit: '2mb' }));

const allowedOrigins = [
  'https://thebiglaw.github.io',
  'http://localhost',
  'http://127.0.0.1',
  'null'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Origem não permitida: ' + origin));
    }
  },
  optionsSuccessStatus: 200
}));

app.get('/health', function (req, res) {
  res.json({ status: 'ok', model: 'gemini-2.0-flash', time: new Date().toISOString() });
});

app.post('/api/chat', async function (req, res) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY não configurada no servidor Render.' });
    }

    if (!req.body.messages || !Array.isArray(req.body.messages)) {
      return res.status(400).json({ error: 'Campo "messages" ausente ou inválido.' });
    }

    // Converte mensagens para o formato nativo do Gemini
    // O system prompt vira uma parte da primeira mensagem user
    const systemText = req.body.system || '';

    const contents = req.body.messages.map(function (m, index) {
      let text = m.content;
      // Injeta o system prompt no início da primeira mensagem do usuário
      if (index === 0 && m.role === 'user' && systemText) {
        text = systemText + '\n\n---\n\n' + text;
      }
      return {
        role:  m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: text }]
      };
    });

    // Usa a API nativa do Gemini (mais estável que o endpoint OpenAI-compat)
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + apiKey;

    const response = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: contents,
        generationConfig: {
          maxOutputTokens: 4096,
          temperature:     0.3
        }
      })
    });

    const data = await response.json();

    // Log completo do erro para diagnóstico
    if (!response.ok) {
      const errDetail = JSON.stringify(data);
      console.error('Erro do Gemini (status ' + response.status + '):', errDetail);
      return res.status(response.status).json({
        error: 'Gemini retornou erro ' + response.status + ': ' + errDetail
      });
    }

    // Extrai o texto da resposta
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!text) {
      console.error('Resposta vazia do Gemini:', JSON.stringify(data));
      return res.status(500).json({ error: 'Gemini retornou resposta vazia. Dados: ' + JSON.stringify(data) });
    }

    // Retorna no formato Anthropic que o app.js já sabe parsear
    res.json({
      content: [{ type: 'text', text: text }]
    });

  } catch (error) {
    console.error('Erro no servidor:', error);
    res.status(500).json({ error: 'Erro interno: ' + error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, function () {
  console.log('Servidor NeuroEquilíbrio na porta ' + PORT + ' — Gemini 2.0 Flash');
});
