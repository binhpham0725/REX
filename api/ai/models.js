/**
 * Vercel Serverless Function: GET /api/ai/models
 */

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-ollama-url');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    // Lấy URL Ollama từ header, query, biến môi trường hoặc local
    const customUrl = req.headers['x-ollama-url'] || req.query.url;
    const ollamaBaseUrl = customUrl || process.env.OLLAMA_URL || 'http://127.0.0.1:11434';

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);

        const ollamaRes = await fetch(`${ollamaBaseUrl}/api/tags`, {
            method: 'GET',
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
        // Nếu không kết nối được (ví dụ chạy trên Vercel Cloud chưa gắn Tunnel Ngrok)
    }

    // Fallback khi chạy trên Vercel Cloud mà máy tính chưa bật Ngrok Tunnel
    return res.status(200).json({
        success: true,
        online: false,
        isVercel: true,
        message: 'Website đang chạy trên Vercel Cloud.',
        models: [
            { name: 'qwen-fast:latest' },
            { name: 'qwen3.5:4b' },
            { name: 'qwen3.5-4k:latest' }
        ]
    });
}
