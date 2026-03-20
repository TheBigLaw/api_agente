const express = require('express');
const cors    = require('cors');

const app = express();
app.use(express.json({ limit: '2mb' }));

// Origens permitidas: produção (GitHub Pages) + testes locais
const allowedOrigins = [
  'https://thebiglaw.github.io',
  'http://localhost',
  'http://127.0.0.1',
  'null' // arquivos abertos direto no navegador via file://
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

// Rota de saúde — para verificar se o servidor está rodando
app.get('/health', function (req, res) {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Rota principal — proxy para a Anthropic API
app.post('/api/chat', async function (req, res) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'ANTHROPIC_API_KEY não configurada no servidor Render.' });
    }

    if (!req.body.messages || !Array.isArray(req.body.messages)) {
      return res.status(400).json({ error: 'Campo "messages" ausente ou inválido.' });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model:      'claude-3-5-sonnet-20241022',
        max_tokens: 4096,
        system:     req.body.system   || '',
        messages:   req.body.messages
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Erro da Anthropic:', JSON.stringify(data));
      return res.status(response.status).json(data);
    }

    res.json(data);

  } catch (error) {
    console.error('Erro no servidor:', error);
    res.status(500).json({ error: 'Erro interno: ' + error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, function () {
  console.log('Servidor NeuroEquilíbrio rodando na porta ' + PORT);
});
