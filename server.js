/**
 * T-Rex Runner - Dedicated Local Database & Game Server
 * Cung cấp HTTP Web Server và REST API đồng bộ điểm số giữa nhiều trình duyệt và thiết bị
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 8080;
const PUBLIC_DIR = __dirname;
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'leaderboard.json');

// Khởi tạo thư mục và file database nếu chưa có
function initDatabase() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(DB_FILE)) {
        fs.writeFileSync(DB_FILE, JSON.stringify([], null, 2), 'utf8');
    }
}

// Đọc danh sách điểm số từ database
function readScores() {
    try {
        initDatabase();
        const data = fs.readFileSync(DB_FILE, 'utf8');
        const parsed = JSON.parse(data);
        return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
        console.error('[DB Error] Lỗi đọc database:', err);
        return [];
    }
}

// Ghi danh sách điểm số vào database
function writeScores(scores) {
    try {
        initDatabase();
        fs.writeFileSync(DB_FILE, JSON.stringify(scores, null, 2), 'utf8');
        return true;
    } catch (err) {
        console.error('[DB Error] Lỗi ghi database:', err);
        return false;
    }
}

// MIME types cho static files
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg'
};

// Đường dẫn file cấu hình từ AI Controller
const ACCESS_CONTROL_FILE = path.join(DATA_DIR, 'access_control.json');
const AI_RULES_FILE = path.join(DATA_DIR, 'ai_rules.json');
const ROUTER_CACHE_FILE = path.join(DATA_DIR, 'router_cache.json');

function normalizeQuestion(str) {
    return String(str || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, '')
        .trim()
        .replace(/\s+/g, ' ');
}

function getAccessStatus(clientSite) {
    try {
        if (!fs.existsSync(ACCESS_CONTROL_FILE)) return 'allowed';
        const data = JSON.parse(fs.readFileSync(ACCESS_CONTROL_FILE, 'utf8'));
        const info = data.sources?.[clientSite];
        if (info && info.status) return info.status;
        return data.defaultPolicy || 'allowed';
    } catch (e) {
        return 'allowed';
    }
}

function getActiveSystemPrompt() {
    try {
        if (!fs.existsSync(AI_RULES_FILE)) return null;
        const data = JSON.parse(fs.readFileSync(AI_RULES_FILE, 'utf8'));
        const rule = data.rules?.find(r => r.id === data.activeRuleId);
        return rule ? rule.prompt : null;
    } catch (e) {
        return null;
    }
}

function lookupRouterCache(question) {
    try {
        if (!fs.existsSync(ROUTER_CACHE_FILE)) return null;
        const data = JSON.parse(fs.readFileSync(ROUTER_CACHE_FILE, 'utf8'));
        if (data.enabled === false) return null;
        const normKey = normalizeQuestion(question);
        let matched = data.entries?.[normKey];
        if (!matched) {
            const keys = Object.keys(data.entries || {});
            for (const k of keys) {
                if (normKey.length >= 4 && (normKey.includes(k) || k.includes(normKey))) {
                    matched = data.entries[k];
                    break;
                }
            }
        }
        if (matched) {
            matched.hits = (matched.hits || 0) + 1;
            matched.lastHit = new Date().toISOString();
            if (!data.stats) data.stats = {};
            data.stats.cacheHits = (data.stats.cacheHits || 0) + 1;
            data.stats.tokensSaved = (data.stats.tokensSaved || 0) + (matched.tokensSavedPerHit || 80);
            fs.writeFileSync(ROUTER_CACHE_FILE, JSON.stringify(data, null, 2), 'utf8');
            return matched;
        }
    } catch (e) {}
    return null;
}

const server = http.createServer((req, res) => {
    // CORS headers cho phép mọi client truy cập (localhost, 127.0.0.1, mạng LAN)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    // ==========================================
    // API ENDPOINTS
    // ==========================================

    // 1. GET /api/scores - Lấy danh sách điểm số (Top N)
    if (pathname === '/api/scores' && req.method === 'GET') {
        const limit = parseInt(parsedUrl.query.limit, 10) || 5;
        const scores = readScores();

        // Lọc sạch dữ liệu bot demo cũ nếu còn sót lại
        const cleaned = scores.filter(s => s && s.id && !s.id.startsWith('bot_'));
        cleaned.sort((a, b) => b.score - a.score || a.updatedAt - b.updatedAt);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
            success: true,
            total: cleaned.length,
            top: cleaned.slice(0, limit),
            scores: cleaned
        }));
        return;
    }

    // 2. POST /api/scores - Cập nhật hoặc thêm mới điểm số của người chơi
    if (pathname === '/api/scores' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const payload = JSON.parse(body);
                const { id, name, score } = payload;

                if (!id || typeof id !== 'string') {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'Thiếu hoặc sai ID người chơi' }));
                    return;
                }

                const cleanedName = (name || 'Người chơi ẩn danh').trim().substring(0, 20);
                const numScore = parseInt(score, 10) || 0;

                const scores = readScores();
                // Lọc bỏ bot
                let cleaned = scores.filter(s => s && s.id && !s.id.startsWith('bot_'));
                const existingIndex = cleaned.findIndex(s => s.id === id);

                if (existingIndex >= 0) {
                    cleaned[existingIndex].name = cleanedName;
                    if (numScore > (cleaned[existingIndex].score || 0)) {
                        cleaned[existingIndex].score = numScore;
                        cleaned[existingIndex].updatedAt = Date.now();
                    }
                } else if (numScore > 0) {
                    cleaned.push({
                        id: id,
                        name: cleanedName,
                        score: numScore,
                        updatedAt: Date.now()
                    });
                }

                writeScores(cleaned);

                cleaned.sort((a, b) => b.score - a.score || a.updatedAt - b.updatedAt);

                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({
                    success: true,
                    top: cleaned.slice(0, 5),
                    scores: cleaned
                }));
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'Dữ liệu JSON không hợp lệ' }));
            }
        });
        return;
    }

    // 3. POST /api/player/rename - Đổi tên người chơi
    if (pathname === '/api/player/rename' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const payload = JSON.parse(body);
                const { id, name } = payload;
                const cleanedName = (name || '').trim().substring(0, 20);

                if (id && cleanedName) {
                    const scores = readScores();
                    const target = scores.find(s => s.id === id);
                    if (target) {
                        target.name = cleanedName;
                        writeScores(scores);
                    }
                }

                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ success: true, name: cleanedName }));
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
            }
        });
        return;
    }

    // ==========================================
    // AI LOCAL (OLLAMA) API ENDPOINTS
    // ==========================================

    // 4.0 GET /api/ai/tunnel - Lấy Public URL Ngrok hiện tại
    if (pathname === '/api/ai/tunnel' && req.method === 'GET') {
        let currentUrl = 'https://43e9-116-99-255-211.ngrok-free.app';
        try {
            const tunnelFile = path.join(DATA_DIR, 'current_tunnel.txt');
            if (fs.existsSync(tunnelFile)) {
                const u = fs.readFileSync(tunnelFile, 'utf8').trim();
                if (u && u.startsWith('https://')) currentUrl = u;
            }
        } catch (e) {}

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, url: currentUrl }));
        return;
    }

    // 4. GET /api/ai/models - Lấy danh sách mô hình AI đang chạy trên máy (Ollama)
    if (pathname === '/api/ai/models' && req.method === 'GET') {
        const ollamaReq = http.request('http://localhost:11434/api/tags', { method: 'GET' }, (ollamaRes) => {
            let data = '';
            ollamaRes.on('data', chunk => { data += chunk; });
            ollamaRes.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({
                        success: true,
                        online: true,
                        models: parsed.models || []
                    }));
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'Lỗi giải mã danh sách models từ Ollama' }));
                }
            });
        });

        ollamaReq.on('error', (err) => {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
                success: false,
                online: false,
                error: 'Không thể kết nối đến Ollama trên máy (localhost:11434). Vui lòng đảm bảo ứng dụng Ollama đang mở.',
                details: err.message
            }));
        });

        ollamaReq.end();
        return;
    }

    // 5. POST /api/ai/chat - Gửi tin nhắn đến AI local và stream phản hồi theo thời gian thực (SSE)
    if (pathname === '/api/ai/chat' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
            try {
                const payload = JSON.parse(body || '{}');
                const model = payload.model || 'qwen-fast:latest';
                const rawMessages = payload.messages || [];
                const think = payload.think === true; // Mặc định false để trả lời siêu nhanh trong vài giây

                if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'Thiếu mảng tin nhắn (messages)' }));
                    return;
                }

                // 1. KIỂM TRA QUYỀN TRUY CẬP (ACCESS CONTROL - CHỨC NĂNG 6)
                let clientWebsite = req.headers['x-client-origin'] || req.headers['origin'] || '';
                if (!clientWebsite && req.headers['referer']) {
                    try {
                        const u = new URL(req.headers['referer']);
                        clientWebsite = `${u.protocol}//${u.host}`;
                    } catch (e) { clientWebsite = req.headers['referer']; }
                }
                if (!clientWebsite) clientWebsite = 'Direct API Client';

                const accessStatus = getAccessStatus(clientWebsite);
                if (accessStatus === 'blocked') {
                    res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({
                        success: false,
                        error: `🚫 Quyền truy cập bị từ chối: Nguồn "${clientWebsite}" đã bị quản trị viên chặn trong Controller (Chức năng 6).`
                    }));
                    return;
                }

                // 2. KIỂM TRA ROUTER CACHE CÂU HỎI THƯỜNG GẶP (CHỨC NĂNG 10)
                const lastUserMsg = [...rawMessages].reverse().find(m => m.role === 'user');
                const userText = lastUserMsg ? lastUserMsg.content : '';
                const cachedAnswer = lookupRouterCache(userText);
                if (cachedAnswer) {
                    // Trả lời ngay lập tức qua SSE với 0 tokens sinh mới và tốc độ 0.01 giây!
                    res.writeHead(200, {
                        'Content-Type': 'text/event-stream; charset=utf-8',
                        'Cache-Control': 'no-cache, no-transform',
                        'Connection': 'keep-alive',
                        'X-Accel-Buffering': 'no'
                    });
                    res.write(`data: ${JSON.stringify({
                        model: 'qwen-fast (Router Cache)',
                        message: { role: 'assistant', content: cachedAnswer.answer },
                        done: false
                    })}\n\n`);
                    res.write(`data: ${JSON.stringify({
                        model: 'qwen-fast (Router Cache)',
                        message: { role: 'assistant', content: '' },
                        done: true,
                        prompt_eval_count: 0,
                        eval_count: 0,
                        total_duration: 10000000 // 10ms
                    })}\n\n`);
                    res.write(`data: [DONE]\n\n`);
                    res.end();
                    return;
                }

                // 3. ÁP DỤNG RULE / CHỈ THỊ HỆ THỐNG ĐANG KÍCH HOẠT (CHỨC NĂNG 8)
                const activePrompt = getActiveSystemPrompt();
                const systemPromptText = activePrompt || 'Bạn là T-Rex AI - một chú khủng long vui nhộn, thông minh tích hợp trên web game T-Rex Runner. Hãy trả lời ngắn gọn, thân thiện bằng tiếng Việt, đi thẳng vào câu hỏi.';
                const systemMsg = { role: 'system', content: systemPromptText };
                const userAssistantMsgs = rawMessages.filter(m => m.role !== 'system').slice(-4);
                const optimizedMessages = [systemMsg, ...userAssistantMsgs];

                // Cấu hình headers SSE cho streaming
                res.writeHead(200, {
                    'Content-Type': 'text/event-stream; charset=utf-8',
                    'Cache-Control': 'no-cache, no-transform',
                    'Connection': 'keep-alive',
                    'X-Accel-Buffering': 'no'
                });

                // Sử dụng native fetch gọi Ollama với think: false (hoặc true nếu người dùng bật)
                const ollamaRes = await fetch('http://127.0.0.1:11434/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: model,
                        messages: optimizedMessages,
                        stream: true,
                        think: think, // THAM SỐ QUAN TRỌNG: tắt suy nghĩ để trả lời tức thì
                        keep_alive: -1, // Giữ model trong VRAM vĩnh viễn
                        options: {
                            num_predict: 384,
                            temperature: 0.6
                        }
                    })
                });

                if (!ollamaRes.ok) {
                    const errText = await ollamaRes.text();
                    res.write(`data: ${JSON.stringify({ error: `Ollama lỗi HTTP ${ollamaRes.status}: ${errText}` })}\n\n`);
                    res.write(`data: [DONE]\n\n`);
                    res.end();
                    return;
                }

                const reader = ollamaRes.body.getReader();
                const decoder = new TextDecoder('utf-8');
                let buffer = '';

                while (true) {
                    const { value, done } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop(); // Giữ lại phần chưa có ký tự xuống dòng

                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (trimmed) {
                            res.write(`data: ${trimmed}\n\n`);
                        }
                    }
                }

                // Xử lý nốt phần còn sót lại trong buffer
                if (buffer.trim()) {
                    res.write(`data: ${buffer.trim()}\n\n`);
                }

                res.write(`data: [DONE]\n\n`);
                res.end();

            } catch (err) {
                console.error('[API Error /api/ai/chat]', err);
                res.write(`data: ${JSON.stringify({ error: 'Lỗi máy chủ kết nối Ollama: ' + err.message })}\n\n`);
                res.write(`data: [DONE]\n\n`);
                res.end();
            }
        });
        return;
    }

    // ==========================================
    // STATIC FILE SERVING
    // ==========================================
    let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

    // Chuẩn hóa và chống path traversal
    filePath = path.normalize(filePath);
    if (!filePath.startsWith(PUBLIC_DIR)) {
        res.writeHead(403);
        res.end('Access Denied');
        return;
    }

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('404 Not Found');
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        res.writeHead(200, {
            'Content-Type': contentType,
            'Cache-Control': 'no-cache, no-store, must-revalidate'
        });
        fs.createReadStream(filePath).pipe(res);
    });
});

initDatabase();

server.listen(PORT, () => {
    console.log(`===============================================`);
    console.log(`🦖 T-Rex Runner Server & AI Local đã sẵn sàng!`);
    console.log(`🌐 Truy cập web game tại: http://localhost:${PORT}/`);
    console.log(`🤖 AI Local Engine: Kết nối Ollama tại http://localhost:11434`);
    console.log(`💬 API AI Chat: http://localhost:${PORT}/api/ai/chat`);
    console.log(`📁 File Database lưu tại: ${DB_FILE}`);
    console.log(`===============================================`);
});
