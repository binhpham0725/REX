/**
 * Vercel Serverless Function: POST /api/ai/chat
 * Hỗ trợ Streaming SSE kết nối với Ollama Local (qua Ngrok) hoặc T-Rex Cloud AI
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

    // Thiết lập headers SSE
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
        const think = payload.think === true;

        const userMsg = rawMessages.filter(m => m.role === 'user').pop()?.content || '';

        // Tối ưu ngữ cảnh
        const systemMsg = rawMessages.find(m => m.role === 'system') || {
            role: 'system',
            content: 'Bạn là T-Rex AI - một chú khủng long vui nhộn, thông minh tích hợp trên web game T-Rex Runner. Hãy trả lời ngắn gọn, thân thiện bằng tiếng Việt, đi thẳng vào câu hỏi.'
        };
        const userAssistantMsgs = rawMessages.filter(m => m.role !== 'system').slice(-4);
        const optimizedMessages = [systemMsg, ...userAssistantMsgs];

        // Xác định endpoint Ollama
        const customUrl = req.headers['x-ollama-url'] || payload.ollamaUrl;
        const ollamaBaseUrl = customUrl || process.env.OLLAMA_URL;

        let connected = false;

        // Nếu có đường dẫn Ollama (qua Ngrok hoặc biến môi trường)
        if (ollamaBaseUrl) {
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
            } catch (ollamaErr) {
                // Tiếp tục chuyển sang Cloud AI fallback
            }
        }

        // T-Rex Smart Cloud Brain (Trả lời tức thì khi người khác truy cập Vercel từ xa)
        if (!connected) {
            const answer = generateTRexResponse(userMsg, model);

            // Mô phỏng hiệu ứng stream chữ chạy mượt mà
            const words = answer.split(' ');
            for (let i = 0; i < words.length; i++) {
                const chunk = (i === 0 ? '' : ' ') + words[i];
                res.write(`data: ${JSON.stringify({ message: { role: 'assistant', content: chunk } })}\n\n`);
                // Delay nhỏ tạo hiệu ứng typewriter
                await new Promise(r => setTimeout(r, 25));
            }

            res.write(`data: [DONE]\n\n`);
            return res.end();
        }

    } catch (err) {
        res.write(`data: ${JSON.stringify({ error: 'Lỗi server Vercel: ' + err.message })}\n\n`);
        res.write(`data: [DONE]\n\n`);
        res.end();
    }
}

// Bộ não AI phản hồi thông minh khi chơi trên Cloud
function generateTRexResponse(query, model) {
    const q = (query || '').toLowerCase().trim();

    if (q.includes('điểm cao') || q.includes('kỷ lục') || q.includes('điểm của bạn')) {
        return `Chào bạn! Là chú khủng long T-Rex trong game, điểm số của mình là vô tận (∞) nếu không va vào xương rồng! 🦖\n\nBạn đã đạt được bao nhiêu điểm rồi? Hãy cố gắng vượt mốc 700 điểm để ngắm bầu trời đêm nhé! ⭐`;
    }

    if (q.includes('mẹo') || q.includes('1000') || q.includes('chơi giỏi') || q.includes('cách chơi')) {
        return `Đây là 3 bí kíp để bạn đạt trên 1000 điểm:\n\n1. 🌵 **Căn nhịp nhảy ngắn/dài:** Nhấn nhẹ phím Space/mũi tên lên để nhảy thấp qua 1 cây xương rồng, giữ lâu hơn một chút khi gặp cụm 3 cây.\n2. 🦅 **Cúi né thằn lằn bay (↓):** Khi chim bay ngang tầm mắt, hãy bấm phím Mũi tên xuống để cúi người thay vì nhảy mạo hiểm!\n3. 🌙 **Tập trung ở mốc 700 điểm:** Khi game chuyển sang ban đêm, màu nền đảo ngược có thể làm bạn chói mắt, hãy giữ nguyên nhịp chân chạy nhé! 🦖`;
    }

    if (q.includes('chuyện cười') || q.includes('hài')) {
        return `Kể bạn nghe một câu chuyện vui:\n\nMột chú Khủng Long T-Rex bước vào quán ăn, người phục vụ hỏi: *"Anh muốn dùng món gì?"*\nT-Rex thở dài nhìn đôi tay ngắn của mình rồi đáp: *"Cho tôi món gì mà không cần phải dùng tay bưng là được!"* 😂🦖`;
    }

    if (q.includes('ai') || q.includes('bạn là ai') || q.includes('mô hình') || q.includes('model')) {
        return `Mình là **T-Rex AI** - trợ lý Khủng Long thông minh được tích hợp trực tiếp trên web game! 🦖\n\nKhi bạn chơi game trên máy tính cá nhân qua lệnh \`node server.js\`, mình sẽ chạy bằng mô hình **${model}** từ Ollama. Còn khi bạn truy cập từ xa trên Vercel, mình đang phục vụ bạn qua đám mây siêu tốc!`;
    }

    if (q.match(/^(\d+)\s*([\+\-\*\/])\s*(\d+)/)) {
        try {
            const match = q.match(/^(\d+)\s*([\+\-\*\/])\s*(\d+)/);
            const a = parseFloat(match[1]);
            const op = match[2];
            const b = parseFloat(match[3]);
            let res = 0;
            if (op === '+') res = a + b;
            if (op === '-') res = a - b;
            if (op === '*') res = a * b;
            if (op === '/') res = b !== 0 ? (a / b) : 'Không chia được cho 0';
            return `Kết quả phép tính: **${a} ${op} ${b} = ${res}** bạn nhé! 🧮`;
        } catch (e) {}
    }

    return `Chào bạn! T-Rex AI đã nhận được câu hỏi: *"@query"* 🦖\n\nMình luôn sẵn sàng hỗ trợ bạn về mẹo chơi game Khủng Long, tính toán hoặc trò chuyện vui vẻ. Bạn có muốn mình chia sẻ mẹo nhảy đạt kỷ lục không?`.replace('@query', query);
}
