/**
 * Vercel Serverless Function: POST /api/ai/chat
 * Hỗ trợ Streaming SSE kết nối với Ollama Local (qua Ngrok/Tunnel) hoặc Cloud AI
 */

export const config = {
    runtime: 'nodejs',
    maxDuration: 60
};

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-ollama-url');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const payload = req.body || {};
        const model = payload.model || 'qwen-fast:latest';
        const rawMessages = payload.messages || [];
        const think = payload.think === true;

        if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
            return res.status(400).json({ error: 'Thiếu mảng tin nhắn (messages)' });
        }

        // Tối ưu ngữ cảnh
        const systemMsg = rawMessages.find(m => m.role === 'system') || {
            role: 'system',
            content: 'Bạn là T-Rex AI - một chú khủng long vui nhộn, thông minh tích hợp trên web game T-Rex Runner. Hãy trả lời ngắn gọn, thân thiện bằng tiếng Việt, đi thẳng vào câu hỏi.'
        };
        const userAssistantMsgs = rawMessages.filter(m => m.role !== 'system').slice(-4);
        const optimizedMessages = [systemMsg, ...userAssistantMsgs];

        // Xác định endpoint Ollama
        const customUrl = req.headers['x-ollama-url'] || payload.ollamaUrl;
        const ollamaBaseUrl = customUrl || process.env.OLLAMA_URL || 'http://127.0.0.1:11434';

        // Cấu hình headers SSE
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');

        let connected = false;
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 6000);

            const ollamaRes = await fetch(`${ollamaBaseUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: model,
                    messages: optimizedMessages,
                    stream: true,
                    think: think,
                    options: {
                        num_predict: 512,
                        temperature: 0.6
                    }
                }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (ollamaRes.ok && ollamaRes.body) {
                connected = true;
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
            }
        } catch (fetchErr) {
            // Không kết nối được tới Ollama (do chạy trên Vercel Cloud chưa mở Ngrok Tunnel)
        }

        // Nếu không kết nối được Ollama trên máy từ Vercel Cloud:
        if (!connected) {
            const guideMessage = `🦖 **Chào bạn! Website đang chạy trên đám mây Vercel.**\n\n` +
                `Hiện tại website đang host trên server toàn cầu của Vercel, trong khi mô hình AI **${model}** của bạn đang nằm trên máy tính cá nhân (Localhost).\n\n` +
                `👉 **Để kết nối AI từ máy tính của bạn với Vercel:**\n` +
                `1. Mở PowerShell trên máy tính và chạy lệnh:\n` +
                `   \`\`\`bash\n   ngrok http 11434\n   \`\`\`\n` +
                `2. Sao chép đường link HTTPS mà ngrok cấp (ví dụ: \`https://xxxx.ngrok-free.app\`).\n` +
                `3. Bấm vào biểu tượng **⚙️ Cài đặt** ở góc trên khung chat này và dán link vào là trò chuyện được ngay!\n\n` +
                `*(Nếu bạn chơi game trực tiếp trên máy bằng lệnh \`node server.js\`, AI sẽ tự động kết nối mà không cần bước này!)*`;

            res.write(`data: ${JSON.stringify({ message: { role: 'assistant', content: guideMessage } })}\n\n`);
            res.write(`data: [DONE]\n\n`);
            return res.end();
        }

    } catch (err) {
        res.write(`data: ${JSON.stringify({ error: 'Lỗi máy chủ Vercel: ' + err.message })}\n\n`);
        res.write(`data: [DONE]\n\n`);
        res.end();
    }
}
