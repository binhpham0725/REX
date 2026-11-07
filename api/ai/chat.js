/**
 * API duy nhất kết nối trực tiếp 100% với Ollama
 * Nhận tin nhắn từ Web -> Gọi Ollama -> Trả vềEcâu trả lời thực tế từ Ollama
 */

export const config = {
    runtime: 'nodejs',
    maxDuration: 60
};

// URL Ollama mặc định (kết nối trực tiếp tới máy tính của bạn)
const DEFAULT_OLLAMA_URL = process.env.OLLAMA_URL || 'https://e6a0-116-99-255-211.ngrok-free.app';

export default async function handler(req, res) {
    // CORS headers cho phép mọi thiết bềEtruy cập
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-ollama-url');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // Thiết lập Server-Sent Events (SSE) đềEstream câu trả lời từ Ollama vềEweb
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    try {
        let payload = req.body;
        if (typeof payload === 'string') {
            try { payload = JSON.parse(payload); } catch (e) { payload = {}; }
        }
        payload = payload || {};

        const model = payload.model || 'qwen-fast:latest';
        const rawMessages = payload.messages || [];
        const think = payload.think === true; // mặc định false đềEtrả lời nhanh

        if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
            res.write(`data: ${JSON.stringify({ error: 'Thiếu nội dung tin nhắn' })}\n\n`);
            res.write(`data: [DONE]\n\n`);
            return res.end();
        }

        // Tối ưu ngữ cảnh hội thoại
        const systemMsg = {
            role: 'system',
            content: 'Bạn là T-Rex AI - một chú khủng long vui nhộn, thông minh tích hợp trên web game T-Rex Runner. Hãy trả lời ngắn gọn, thân thiện bằng tiếng Việt, đi thẳng vào câu hỏi.'
        };
        const chatHistory = rawMessages.filter(m => m.role !== 'system').slice(-4);
        const messagesToSend = [systemMsg, ...chatHistory];

        // Lấy địa chềEOllama
        const ollamaBaseUrl = req.headers['x-ollama-url'] || payload.ollamaUrl || DEFAULT_OLLAMA_URL;

        // Gửi trực tiếp đến Ollama API
        const ollamaRes = await fetch(`${ollamaBaseUrl}/api/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'ngrok-skip-browser-warning': '1' // BềEqua trang cảnh báo của ngrok
            },
            body: JSON.stringify({
                model: model,
                messages: messagesToSend,
                stream: true,
                think: think,
                options: {
                    num_predict: 512,
                    temperature: 0.7
                }
            })
        });

        if (!ollamaRes.ok) {
            const errText = await ollamaRes.text();
            res.write(`data: ${JSON.stringify({ error: `Ollama trả vềElỗi HTTP ${ollamaRes.status}: ${errText}` })}\n\n`);
            res.write(`data: [DONE]\n\n`);
            return res.end();
        }

        // Pipe trực tiếp từng token từ Ollama vềEgiao diện Web theo thời gian thực
        const reader = ollamaRes.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed) {
                    res.write(`data: ${trimmed}\n\n`);
                }
            }
        }

        if (buffer.trim()) {
            res.write(`data: ${buffer.trim()}\n\n`);
        }

        res.write(`data: [DONE]\n\n`);
        return res.end();

    } catch (err) {
        console.error('[Ollama API Error]', err);
        res.write(`data: ${JSON.stringify({ error: `Không thềEkết nối đến Ollama: ${err.message}. Hãy đảm bảo máy tính đang mềEOllama và Ngrok!` })}\n\n`);
        res.write(`data: [DONE]\n\n`);
        res.end();
    }
}
