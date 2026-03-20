const express = require('express');
const cors    = require('cors');

const app = express();
app.use(express.json({ limit: '4mb' }));

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

    const systemText = req.body.system || '';
    const messages   = req.body.messages;

    // ── Monta o array contents para o Gemini ──────────────────────────────
    // O Gemini não aceita mensagens "system" diretamente no array contents.
    // Injetamos o system prompt como primeira instrução, apenas na primeira
    // mensagem do usuário (evita reenvio gigante em cada turno).
    const contents = messages.map(function (m, index) {
      let text = m.content || '';

      if (index === 0 && m.role === 'user' && systemText) {
        text = '=== INSTRUÇÕES DO SISTEMA ===\n' + systemText + '\n\n=== MENSAGEM DO USUÁRIO ===\n' + text;
      }

      return {
        role:  m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: text }]
      };
    });

    // ── Chamada à API nativa do Gemini ────────────────────────────────────
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + apiKey;

    const geminiRes = await fetch(url, {
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

    const data = await geminiRes.json();

    // ── Tratamento de erros ───────────────────────────────────────────────
    if (!geminiRes.ok) {
      const status  = geminiRes.status;
      const errMsg  = data?.error?.message || JSON.stringify(data);

      console.error('Erro Gemini ' + status + ':', errMsg);

      let userFacing = '';

      if (status === 429) {
        userFacing =
          'Limite de requisições do Gemini atingido (erro 429). ' +
          'O plano gratuito permite 15 req/min e 1.500 req/dia. ' +
          'Aguarde 1 minuto e tente novamente.';
      } else if (status === 400) {
        userFacing = 'Requisição inválida para o Gemini (400): ' + errMsg;
      } else if (status === 403) {
        userFacing = 'Chave de API inválida ou sem permissão (403). Verifique GEMINI_API_KEY no Render.';
      } else if (status === 404) {
        userFacing = 'Modelo não encontrado (404). Verifique o nome do modelo no servidor.';
      } else {
        userFacing = 'Gemini retornou erro ' + status + ': ' + errMsg;
      }

      return res.status(status).json({ error: userFacing });
    }

    // ── Extrai texto da resposta ──────────────────────────────────────────
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!text) {
      // Pode ser bloqueio por safety filters
      const blockReason = data?.promptFeedback?.blockReason || '';
      const finishReason = data?.candidates?.[0]?.finishReason || '';
      console.error('Resposta vazia. blockReason:', blockReason, 'finishReason:', finishReason);
      return res.status(500).json({
        error: 'Gemini retornou resposta vazia.' +
               (blockReason ? ' Motivo de bloqueio: ' + blockReason : '') +
               (finishReason ? ' Fim por: ' + finishReason : '')
      });
    }

    // ── Retorna no formato que o app.js já sabe parsear ───────────────────
    res.json({
      content: [{ type: 'text', text: text }]
    });

  } catch (error) {
    console.error('Erro interno:', error);
    res.status(500).json({ error: 'Erro interno do servidor: ' + error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, function () {
  console.log('NeuroEquilíbrio API na porta ' + PORT + ' — Gemini 2.0 Flash');
});
