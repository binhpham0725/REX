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
    console.log(`🦖 T-Rex Runner Server & Database đã sẵn sàng!`);
    console.log(`🌐 Truy cập game tại: http://localhost:${PORT}/`);
    console.log(`📁 File Database lưu tại: ${DB_FILE}`);
    console.log(`🔄 Tất cả trình duyệt đều đồng bộ điểm chung qua Server API!`);
    console.log(`===============================================`);
});
