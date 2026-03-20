const express = require('express');
const cors    = require('cors');

const app = express();
app.use(express.json({ limit: '2mb' }));

// Origens permitidas
const allowedOrigins = [
  'https://thebiglaw.github.io',
  'http://localhost',
  'http://127.0.0.1',
  'null' // arquivos abertos via file:// no navegador
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

// Rota de saúde
app.get('/health', function (req, res) {
  res.json({ status: 'ok', model: 'gemini-2.0-flash', time: new Date().toISOString() });
});

// Rota principal — proxy para o Google Gemini (endpoint compatível com OpenAI)
app.post('/api/chat', async function (req, res) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY não configurada no servidor Render.' });
    }

    if (!req.body.messages || !Array.isArray(req.body.messages)) {
      return res.status(400).json({ error: 'Campo "messages" ausente ou inválido.' });
    }

    // Monta as mensagens: system prompt + histórico
    const messages = [];

    if (req.body.system) {
      messages.push({ role: 'system', content: req.body.system });
    }

    req.body.messages.forEach(function (m) {
      messages.push({ role: m.role, content: m.content });
    });

    // Gemini tem endpoint compatível com formato OpenAI — muito fácil de integrar
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey
        },
        body: JSON.stringify({
          model:       'gemini-2.0-flash',
          messages:    messages,
          max_tokens:  4096,
          temperature: 0.3
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('Erro do Gemini:', JSON.stringify(data));
      return res.status(response.status).json({ error: data.error?.message || 'Erro da API Gemini' });
    }

    // Converte resposta do formato OpenAI para o formato Anthropic
    // (que o app.js já sabe parsear)
    const text = data.choices?.[0]?.message?.content || '';

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
  console.log('Servidor NeuroEquilíbrio rodando na porta ' + PORT + ' (Gemini 2.0 Flash)');
});
