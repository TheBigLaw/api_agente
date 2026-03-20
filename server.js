const express = require('express');
const cors = require('cors');

const app = express();
app.use(express.json());

// Segurança: Permite requisições APENAS do seu site no GitHub Pages
const corsOptions = {
    origin: 'https://thebiglaw.github.io',
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

app.post('/api/chat', async (req, res) => {
    try {
        // A chave de API agora fica escondida no servidor do Render
        const apiKey = process.env.ANTHROPIC_API_KEY;

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                // Corrigi o nome do modelo para o padrão oficial da Anthropic (Claude 3.5 Sonnet)
                model: 'claude-3-5-sonnet-20241022', 
                max_tokens: 4096,
                system: req.body.system,
                messages: req.body.messages
            })
        });

        const data = await response.json();

        // Repassa o erro exato caso a Anthropic reclame de algo
        if (!response.ok) {
            return res.status(response.status).json(data);
        }

        // Devolve a resposta com sucesso para o seu frontend
        res.json(data);
        
    } catch (error) {
        console.error("Erro no servidor:", error);
        res.status(500).json({ error: 'Erro interno ao contatar a inteligência artificial.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
