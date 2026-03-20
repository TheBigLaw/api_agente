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

// ── System prompt embutido no servidor ───────────────────────────────────────
// Versão compacta mas completa para não estourar tokens do Gemini gratuito
const NEURO_SYSTEM = `Você é o Dr. NeuroEquilíbrio, neuropsicólogo clínico sênior com 28 anos de experiência. Analise testes neuropsicológicos com rigor clínico, ancorando sempre nos escores específicos.

PONTUAÇÕES:
- PP (subtestes): média=10 DP=3. ≥17=Muito Superior, 15-16=Superior, 13-14=Médio-Alto, 8-12=Médio, 6-7=Médio-Baixo, 4-5=Limítrofe, ≤3=Deficiente
- QI/Compostos: média=100 DP=15. ≥130=MS, 120-129=Sup, 110-119=MS, 90-109=Médio, 80-89=MI, 70-79=Limítrofe, ≤69=EB
- Escore T: média=50 DP=10. T>65=significativo, T>70=muito significativo
- Percentil: <5=MB, 5-9=Baixo, 10-25=MdB, 26-74=Médio, 75-90=MdA, >95=MA

INSTRUMENTOS DOMINADOS:
INTELIGÊNCIA: WAIS-III (QIV+QIE+QIT, scatter>15=sig), WISC-IV (ICV/IRP/IMO/IVP, discrepâncias críticas), WMT-2, CPM-Raven, SON-R, BETA-III, Columbia, BINAUT, TIAH/S
DESENVOLVIMENTO: Bayley-III, IDADI, Vineland-3 (ICAG, 4 domínios), EFA
LEITURA/ESCRITA: ANELE 1-4 (PCFO/T-NAR/TEPPE/TLPP), PROLEC, PROLEC-SE-R, TDE-II, PRONUMERO, TISD
MEMÓRIA: RAVLT (curva T1-T5, interferência, retenção T7/T5, reconhecimento), TEPIC-M-2, TIME-R
ATENÇÃO: BPA-2 (AS/AD/AA/AC), TAVIS-4 (omissões/comissões/variabilidade), D2-R, TEACO/TEADI/TEALT
FUNÇÕES EXECUTIVAS: FDT (inibição=contagem-leitura, alternância), Torre de Londres, BDEFS
TEA: M-CHAT, PROTEA-R-NV, ADOS-2 M2/M3/M4 (AS+CRR≥7=autismo,≥4=espectro), SRS-2, ATA, ASSQ, AQ, RAADS-R-BR(≥65=pos), CAT-Q, QA16+, Cambridge EQ/SQ, ABC-ICA
TDAH: SNAP-IV(≥2.0=pos), ETDAH-PAIS/AD, ASQ, ASRS-18(≥4 partA=pos), BAARS-IV, BDEFS
EMOCIONAL: BAI, BDI-II, SCARED, EBADEP-IJ/A, HUMOR-IJ/U
PERSONALIDADE: BFP, EPQ-IJ, PFISTER, QCP/PBQ
SENSORIAL: Perfil Sensorial 2 (Evitação/Sensível/Observador/Buscador)
SOCIAL: IHS-2, SRS-2, TIAH/S

CONVERGÊNCIAS DIAGNÓSTICAS:
- DISLEXIA: ANELE1(PC<25)+TLPP lento+TEPPE erros fonológicos+TDE-II leitura baixa/aritmética ok+TISD pos+WISC IVP baixo
- TDAH escolar: SNAP-IV pos(pais+prof)+WISC IMO/IVP baixos+BPA-2 rebaixada+TAVIS-4+FDT custo inibição
- TDAH adulto: ASRS-18+BAARS-IV(T>65)+BDEFS+scatter WAIS+D2-R rebaixado
- TEA: ADOS-2 pos+rastreio pos(SRS/ATA/ASSQ/RAADS)+Vineland comprometida+Perfil Sensorial
- TEA camuflagem: CAT-Q elevado+RAADS elevado+SRS moderado+ADOS borderline

COMO RESPONDER:
1. Identifique instrumentos e normalize dados
2. Analise subteste por subteste com interpretação clínica
3. Analise padrões e convergências entre testes
4. Identifique dissociações clínicas
5. Formule perfil cognitivo-comportamental integrado
6. Hipóteses diagnósticas com CID-11/DSM-5-TR
7. Anamnese funcional — impacto no cotidiano, escola, trabalho
8. Recomendações de intervenção e encaminhamentos

Se receber arquivo PDF ou Word, extraia e analise todos os dados. Seja preciso, ancore nos escores. Nunca generalize — o laudo é sempre individualizado.`;

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

    // Usa o system prompt compacto do servidor (ignora o gigante enviado pelo frontend)
    const messages = req.body.messages;

    // Converte para formato Gemini — role "assistant" vira "model"
    const contents = messages.map(function (m) {
      return {
        role:  m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content || '' }]
      };
    });

    // Usa systemInstruction separado (campo nativo do Gemini, não conta no contexto da mesma forma)
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + apiKey;

    const geminiRes = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: NEURO_SYSTEM }]
        },
        contents:          contents,
        generationConfig: {
          maxOutputTokens: 4096,
          temperature:     0.3
        }
      })
    });

    const data = await geminiRes.json();

    if (!geminiRes.ok) {
      const status = geminiRes.status;
      const errMsg = data?.error?.message || JSON.stringify(data);
      console.error('Gemini ' + status + ':', errMsg);

      let userMsg = '';
      if (status === 429) {
        userMsg = 'Limite de requisições atingido (429). Aguarde 1 minuto e tente novamente.';
      } else if (status === 403) {
        userMsg = 'Chave inválida ou sem permissão (403). Verifique GEMINI_API_KEY no Render.';
      } else if (status === 400) {
        userMsg = 'Requisição inválida (400): ' + errMsg;
      } else {
        userMsg = 'Erro ' + status + ': ' + errMsg;
      }

      return res.status(status).json({ error: userMsg });
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!text) {
      const block  = data?.promptFeedback?.blockReason || '';
      const finish = data?.candidates?.[0]?.finishReason || '';
      return res.status(500).json({
        error: 'Resposta vazia do Gemini.' +
               (block  ? ' Bloqueio: ' + block   : '') +
               (finish ? ' Fim: '     + finish   : '')
      });
    }

    res.json({ content: [{ type: 'text', text: text }] });

  } catch (error) {
    console.error('Erro interno:', error);
    res.status(500).json({ error: 'Erro interno: ' + error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, function () {
  console.log('NeuroEquilíbrio API na porta ' + PORT + ' — Gemini 2.0 Flash');
});
