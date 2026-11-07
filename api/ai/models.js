/**
 * API lấy danh sách mô hình trực tiếp từ Ollama
 */

const DEFAULT_OLLAMA_URL = process.env.OLLAMA_URL || 'https://e6a0-116-99-255-211.ngrok-free.app';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-ollama-url');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    const customUrl = req.headers['x-ollama-url'] || req.query.url;
    const ollamaBaseUrl = customUrl || DEFAULT_OLLAMA_URL;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);

        const ollamaRes = await fetch(`${ollamaBaseUrl}/api/tags`, {
            method: 'GET',
            headers: {
                'ngrok-skip-browser-warning': '1'
            },
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (ollamaRes.ok) {
            const data = await ollamaRes.json();
            return res.status(200).json({
                success: true,
                online: true,
                source: ollamaBaseUrl,
                models: data.models || []
            });
        }
    } catch (err) {
        console.error('[Models Error]', err);
    }

    return res.status(200).json({
        success: true,
        online: false,
        source: ollamaBaseUrl,
        models: [
            { name: 'qwen-fast:latest' },
            { name: 'qwen3.5:4b' }
        ]
    });
}
