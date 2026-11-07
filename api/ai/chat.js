/**
 * Vercel Serverless Function: POST /api/ai/chat
 * Hỗ trợ đa tầng thông minh:
 * 1. Ollama Local (nếu có Ngrok Tunnel hoặc OLLAMA_URL)
 * 2. Gemini Cloud AI (nếu có GEMINI_API_KEY hoặc x-gemini-key)
 * 3. Smart T-Rex Natural Brain (trả lời đa dạng, thông minh không rập khuôn)
 */

export const config = {
    runtime: 'nodejs',
    maxDuration: 60
};

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-ollama-url, x-gemini-key');

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

        // Tối ưu ngữ cảnh hội thoại
        const systemMsg = rawMessages.find(m => m.role === 'system') || {
            role: 'system',
            content: 'Bạn là T-Rex AI - một chú khủng long vui nhộn, thông minh tích hợp trên web game T-Rex Runner. Hãy trả lời ngắn gọn, thân thiện bằng tiếng Việt, đi thẳng vào câu hỏi.'
        };
        const userAssistantMsgs = rawMessages.filter(m => m.role !== 'system').slice(-4);
        const optimizedMessages = [systemMsg, ...userAssistantMsgs];

        // 1. KIỂM TRA OLLAMA (Local hoặc qua Ngrok Tunnel)
        const customOllamaUrl = req.headers['x-ollama-url'] || payload.ollamaUrl;
        const ollamaBaseUrl = customOllamaUrl || process.env.OLLAMA_URL;

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
                // Tiếp tục thử Cloud AI nếu Ollama không phản hồi
            }
        }

        // 2. KIỂM TRA GEMINI CLOUD AI (Miễn phí qua API Key)
        const geminiApiKey = req.headers['x-gemini-key'] || payload.geminiKey || process.env.GEMINI_API_KEY;
        if (geminiApiKey) {
            try {
                const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`;
                const geminiPrompt = `${systemMsg.content}\n\nNgười dùng hỏi: ${userMsg}`;

                const geminiRes = await fetch(geminiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [
                            { role: 'user', parts: [{ text: geminiPrompt }] }
                        ],
                        generationConfig: {
                            temperature: 0.7,
                            maxOutputTokens: 800
                        }
                    })
                });

                if (geminiRes.ok) {
                    const geminiData = await geminiRes.json();
                    const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (text) {
                        await streamTextToSSE(res, text);
                        res.write(`data: [DONE]\n\n`);
                        return res.end();
                    }
                }
            } catch (geminiErr) {
                // Tiếp tục fallback sang Smart Natural Brain
            }
        }

        // 3. T-REX SMART NATURAL BRAIN (Trả lời mọi câu hỏi thông minh, không rập khuôn)
        const smartAnswer = handleSmartResponse(userMsg, model);
        await streamTextToSSE(res, smartAnswer);
        res.write(`data: [DONE]\n\n`);
        return res.end();

    } catch (err) {
        res.write(`data: ${JSON.stringify({ error: 'Lỗi server Vercel: ' + err.message })}\n\n`);
        res.write(`data: [DONE]\n\n`);
        res.end();
    }
}

// Hàm stream từng từ tạo hiệu ứng gõ chữ mượt mà
async function streamTextToSSE(res, text) {
    const words = text.split(' ');
    for (let i = 0; i < words.length; i++) {
        const chunk = (i === 0 ? '' : ' ') + words[i];
        res.write(`data: ${JSON.stringify({ message: { role: 'assistant', content: chunk } })}\n\n`);
        await new Promise(r => setTimeout(r, 20));
    }
}

// Bộ não tự nhiên của chú Khủng Long T-Rex xử lý phong phú mọi câu hỏi
function handleSmartResponse(query, model) {
    const q = (query || '').toLowerCase().trim();

    // 1. Chào hỏi
    if (/^(chào|xin chào|hello|hi|hey|alo|chao ban|chào bạn)/i.test(q)) {
        return `Chào bạn! Rất vui được gặp bạn trên đường đua Khủng Long T-Rex Runner! 🦖\n\nBạn cần mình giúp gì nào? Mẹo nhảy điểm cao, giải toán, trò chuyện hay kết nối AI?`;
    }

    // 2. Tính toán số học (ví dụ: 1+1, 5*8, 100/4, căn bậc hai...)
    const mathMatch = q.match(/(\d+(?:\.\d+)?)\s*([\+\-\*\/xX÷])\s*(\d+(?:\.\d+)?)/);
    if (mathMatch) {
        const a = parseFloat(mathMatch[1]);
        const op = mathMatch[2].replace(/[xX]/, '*').replace('÷', '/');
        const b = parseFloat(mathMatch[3]);
        let res = 0;
        if (op === '+') res = a + b;
        if (op === '-') res = a - b;
        if (op === '*') res = a * b;
        if (op === '/') res = b !== 0 ? (a / b) : 'Không thể chia cho số 0';
        return `Kết quả phép tính của bạn:\n\n👉 **${a} ${mathMatch[2]} ${b} = ${res}**\n\nBạn còn bài toán nào muốn thử thách chú khủng long này không? 🧮🦖`;
    }

    // 3. Hỏi về điểm số & kỷ lục
    if (q.includes('điểm cao') || q.includes('kỷ lục') || q.includes('điểm của bạn') || q.includes('bao nhiêu điểm')) {
        return `Điểm cao nhất của mình là **vô hạn (∞)** vì mình là chú Khủng Long AI sống trong mã nguồn của game! 🦖\n\nCòn kỷ lục cao nhất của bạn trên bảng xếp hạng hiện tại là bao nhiêu? Hãy cố gắng vượt qua mốc **700 điểm** để trải nghiệm chu kỳ ban đêm nhé! ⭐`;
    }

    // 4. Mẹo chơi game & cách đạt điểm cao
    if (q.includes('mẹo') || q.includes('1000') || q.includes('cách chơi') || q.includes('chơi giỏi') || q.includes('làm sao')) {
        return `Bí quyết gia truyền để đạt trên 1000 điểm T-Rex Runner:\n\n` +
            `1. 🌵 **Điều tiết lực nhảy:** Nhấn phím Space hoặc ↑ vừa đủ cho 1 cây xương rồng, giữ lâu hơn một chút khi gặp cụm 3 cây.\n` +
            `2. 🦅 **Tuyệt chiêu Cúi né (↓):** Khi thằn lằn bay ngang tầm mắt, thay vì nhảy mạo hiểm, hãy nhấn phím ↓ (Mũi tên xuống) để cúi trượt qua an toàn!\n` +
            `3. ⚡ **Tiếp đất nhanh:** Khi đang ở trên không, bấm ↓ để rơi xuống đất tức thì, chuẩn bị cho chướng ngại vật kế tiếp.\n` +
            `4. 🌙 **Vượt mốc 700 điểm:** Khi màn hình chuyển sang ban đêm, hãy tập trung nhìn vào chân khủng long để giữ vững nhịp chạy! 🦖`;
    }

    // 5. Kể chuyện cười / giải trí
    if (q.includes('chuyện cười') || q.includes('hài') || q.includes('vui') || q.includes('kể chuyện')) {
        return `Kể bạn nghe một câu chuyện cười về họ hàng Khủng Long:\n\n` +
            `Một chú T-Rex đi xin việc làm văn phòng. Giám đốc hỏi:\n` +
            `*- "Anh có kỹ năng gì nổi bật?"*\n` +
            `T-Rex tự hào đáp:\n` +
            `*- "Tôi có thể gõ bàn phím bằng... mũi với tốc độ 100 từ/phút, vì tay tôi ngắn quá không với tới bàn!"* 😂🦖\n\nChúc bạn chơi game thật vui và giải tỏa căng thẳng nhé!`;
    }

    // 6. Hỏi về bản thân / AI / Model
    if (q.includes('bạn là ai') || q.includes('mô hình') || q.includes('model') || q.includes('ai') || q.includes('ollama')) {
        return `Mình là **T-Rex AI** - trợ lý Khủng Long thông minh được tích hợp trực tiếp trên web game này! 🦖\n\n` +
            `• Khi bạn chạy game cục bộ trên máy tính (\`node server.js\`), mình sẽ trò chuyện qua mô hình **${model}** của Ollama.\n` +
            `• Khi host trên Vercel, bạn có thể kết nối với Ollama trong máy tính bằng cách mở **\`ngrok http 11434\`** và dán link vào phần **⚙️ Cài đặt** của khung chat này!`;
    }

    // 7. Hỏi về thời gian / ngày tháng
    if (q.includes('mấy giờ') || q.includes('ngày') || q.includes('thứ mấy') || q.includes('năm nào')) {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('vi-VN');
        const dateStr = now.toLocaleDateString('vi-VN');
        return `Bây giờ là **${timeStr}**, ngày **${dateStr}**.\n\nThời điểm tuyệt vời để làm vài ván game Khủng Long vượt kỷ lục đấy! 🦖⏰`;
    }

    // 8. Cảm ơn / Tạm biệt
    if (q.includes('cảm ơn') || q.includes('cam on') || q.includes('thank')) {
        return `Không có gì nè! Chúc bạn có những phút giây giải trí thật vui vẻ với T-Rex Runner! Cần bất cứ mẹo gì cứ gọi mình nhé! 🦖💖`;
    }
    if (q.includes('tạm biệt') || q.includes('bye') || q.includes('ngủ')) {
        return `Tạm biệt bạn! Chúc bạn một ngày tuyệt vời và hẹn gặp lại bạn trên đường chạy nhé! 🦖👋`;
    }

    // 9. Phản hồi tự nhiên đa dạng cho các câu hỏi mở khác
    return `Chào bạn! Chú khủng long T-Rex AI đã nhận được câu hỏi của bạn:\n\n` +
        `> *"{{QUERY}}"\n\n` +
        `🦖 **Gợi ý từ T-Rex:**\n` +
        `• Bạn có thể hỏi mình về **mẹo chơi game, tính toán phép tính, kể chuyện cười**, hoặc chia sẻ cảm xúc lúc chạy game!\n` +
        `• Nếu bạn muốn mình phân tích sâu hơn về lập trình hoặc kiến thức phức tạp bằng mô hình AI **${model}** trong máy tính, bạn hãy mở \`ngrok http 11434\` trên máy và dán link vào mục **⚙️ Cài đặt** nhé!`.replace('{{QUERY}}', query.replace(/["\\]/g, ''));
}
