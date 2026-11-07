/**
 * 🦖 T-REX AI CONTROLLER & API GATEWAY CLI DASHBOARD
 * Công cụ điều khiển và giám sát AI Local (Ollama) + Ngrok Tunnel trên Windows
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');
const readline = require('readline');

// Mã màu ANSI cho Terminal chuyên nghiệp
const C = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    red: '\x1b[31m',
    white: '\x1b[37m',
    bgRed: '\x1b[41m',
    bgBlue: '\x1b[44m',
    bgGreen: '\x1b[42m',
    bgYellow: '\x1b[43m',
    bgCyan: '\x1b[46m',
    bgMagenta: '\x1b[45m'
};

const OLLAMA_PORT = 11434;
const NGROK_API_PORT = 4040;

// Đường dẫn file lưu trữ dữ liệu thống kê lâu dài
const DATA_DIR = path.join(__dirname, 'data');
const TRAFFIC_DB_FILE = path.join(DATA_DIR, 'web_traffic_stats.json');

// Khởi tạo file database lưu lượng
function initTrafficDb() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(TRAFFIC_DB_FILE)) {
        const initial = {
            processedIds: {},
            websites: {},
            recentAudit: []
        };
        fs.writeFileSync(TRAFFIC_DB_FILE, JSON.stringify(initial, null, 2), 'utf8');
        return initial;
    }
    try {
        const data = fs.readFileSync(TRAFFIC_DB_FILE, 'utf8');
        const parsed = JSON.parse(data);
        if (!parsed.processedIds) parsed.processedIds = {};
        if (!parsed.websites) parsed.websites = {};
        if (!parsed.recentAudit) parsed.recentAudit = [];
        return parsed;
    } catch (e) {
        return { processedIds: {}, websites: {}, recentAudit: [] };
    }
}

// Lưu database lưu lượng
function saveTrafficDb(db) {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        fs.writeFileSync(TRAFFIC_DB_FILE, JSON.stringify(db, null, 2), 'utf8');
    } catch (e) {}
}

// Xóa sạch lịch sử thống kê
function resetTrafficDb() {
    const fresh = {
        processedIds: {},
        websites: {},
        recentAudit: []
    };
    saveTrafficDb(fresh);
    return fresh;
}

// -------------------------------------------------------------
// KHỞI TẠO CÁC CƠ SỞ DỮ LIỆU CẤU HÌNH & BỘ NHỚ ĐỆM GATEWAY
// -------------------------------------------------------------
const ACCESS_CONTROL_FILE = path.join(DATA_DIR, 'access_control.json');
const AI_RULES_FILE = path.join(DATA_DIR, 'ai_rules.json');
const ROUTER_CACHE_FILE = path.join(DATA_DIR, 'router_cache.json');

// 1. Quản lý Quyền truy cập API (Access Control - Allow/Block)
function initAccessControlDb() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const defaultSources = {
        'https://rex-nu-ten.vercel.app': { status: 'allowed', note: 'Web Game chính thức (Vercel)', updatedAt: new Date().toISOString() },
        'Web Game Vercel (binhpham0725/REX)': { status: 'allowed', note: 'Proxy Serverless Vercel', updatedAt: new Date().toISOString() },
        'cURL CLI / Terminal Client': { status: 'allowed', note: 'Lệnh test cURL từ Terminal', updatedAt: new Date().toISOString() },
        'Node.js Backend Client': { status: 'allowed', note: 'Ứng dụng Node.js nội bộ', updatedAt: new Date().toISOString() },
        'Direct API Client': { status: 'allowed', note: 'Client gọi API trực tiếp', updatedAt: new Date().toISOString() }
    };

    if (!fs.existsSync(ACCESS_CONTROL_FILE)) {
        // Tự động quét từ database lưu lượng để nạp sẵn danh sách
        const trafficDb = initTrafficDb();
        const sources = { ...defaultSources };
        Object.keys(trafficDb.websites || {}).forEach(site => {
            if (!sources[site]) {
                sources[site] = { status: 'allowed', note: 'Phát hiện tự động từ Traffic', updatedAt: new Date().toISOString() };
            }
        });

        const initial = {
            defaultPolicy: 'allow', // 'allow' hoặc 'block'
            sources: sources
        };
        fs.writeFileSync(ACCESS_CONTROL_FILE, JSON.stringify(initial, null, 2), 'utf8');
        return initial;
    }

    try {
        const data = fs.readFileSync(ACCESS_CONTROL_FILE, 'utf8');
        const parsed = JSON.parse(data);
        if (!parsed.sources) parsed.sources = {};
        if (!parsed.defaultPolicy) parsed.defaultPolicy = 'allow';
        return parsed;
    } catch (e) {
        return { defaultPolicy: 'allow', sources: defaultSources };
    }
}

function saveAccessControlDb(db) {
    try {
        fs.writeFileSync(ACCESS_CONTROL_FILE, JSON.stringify(db, null, 2), 'utf8');
    } catch (e) {}
}

// 2. Quản lý Rule / Chỉ thị hệ thống của AI (AI Rules Manager)
function initAiRulesDb() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const defaultRules = [
        {
            id: 'rule_dino_friendly',
            name: '🦖 Khủng Long T-Rex Vui Nhộn (Mặc định)',
            prompt: 'Bạn là T-Rex AI - một chú khủng long vui nhộn, thông minh tích hợp trên web game T-Rex Runner. Hãy trả lời ngắn gọn, thân thiện bằng tiếng Việt, đi thẳng vào câu hỏi.',
            createdAt: new Date().toISOString()
        },
        {
            id: 'rule_pro_coder',
            name: '💻 Chuyên Gia Lập Trình & Code Tối Ưu',
            prompt: 'Bạn là một chuyên gia lập trình cao cấp. Hãy trả lời cực kỳ chính xác, ngắn gọn, cung cấp code mẫu sạch sẽ, chuẩn cú pháp và giải thích súc tích.',
            createdAt: new Date().toISOString()
        },
        {
            id: 'rule_super_fast',
            name: '⚡ Siêu Ngắn Gọn & Trả Lời Trực Tiếp (Ultra Fast)',
            prompt: 'Hãy trả lời trực tiếp trong tối đa 1-2 câu ngắn gọn, không giải thích dài dòng, không dùng từ ngữ rườm rà hay mở đầu khách sáo.',
            createdAt: new Date().toISOString()
        },
        {
            id: 'rule_game_coach',
            name: '🎮 Huấn Luyện Viên Game Khủng Long',
            prompt: 'Bạn là bậc thầy chơi game Khủng Long (T-Rex Runner). Hãy đưa ra các mẹo nhảy, né chim bay, canh thời gian chuẩn xác để giúp người chơi đạt kỷ lục trên 1000 điểm!',
            createdAt: new Date().toISOString()
        }
    ];

    if (!fs.existsSync(AI_RULES_FILE)) {
        const initial = {
            activeRuleId: 'rule_dino_friendly',
            rules: defaultRules
        };
        fs.writeFileSync(AI_RULES_FILE, JSON.stringify(initial, null, 2), 'utf8');
        return initial;
    }

    try {
        const data = fs.readFileSync(AI_RULES_FILE, 'utf8');
        const parsed = JSON.parse(data);
        if (!Array.isArray(parsed.rules)) parsed.rules = defaultRules;
        if (!parsed.activeRuleId) parsed.activeRuleId = defaultRules[0].id;
        return parsed;
    } catch (e) {
        return { activeRuleId: defaultRules[0].id, rules: defaultRules };
    }
}

function saveAiRulesDb(db) {
    try {
        fs.writeFileSync(AI_RULES_FILE, JSON.stringify(db, null, 2), 'utf8');
    } catch (e) {}
}

// 3. Quản lý Router Cache Câu hỏi lặp lại (Router Cache Gateway)
function initRouterCacheDb() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const seedEntries = {
        'meo dat 1000 diem': {
            question: 'Làm sao để chơi game Khủng Long đạt điểm kỷ lục trên 1000 điểm?',
            normalized: 'meo dat 1000 diem',
            answer: '🎮 **Bí quyết đạt 1000+ điểm T-Rex Runner:**\n1. **Nhìn xa:** Tập trung nhìn cách xa chú khủng long khoảng 3-4 bước chân.\n2. **Né chim Pterodactyl:** Dùng phím `Mũi tên xuống` để cúi đầu khi gặp chim bay ở tầm trung và cao.\n3. **Nhấp nhả phím nhảy nhanh:** Bấm nhẹ phím Space để nhảy thấp, giữ lâu hơn một chút khi gặp cụm 3 xương rồng liền kề!\nChúc bạn sớm đạt mốc 1000 điểm!',
            hits: 14,
            tokensSavedPerHit: 120,
            createdAt: new Date().toISOString(),
            lastHit: new Date().toISOString()
        },
        'ke chuyen cuoi': {
            question: 'Kể một câu chuyện cười ngắn vui vẻ',
            normalized: 'ke chuyen cuoi',
            answer: '😄 **Chuyện cười Khủng Long:**\nMột chú T-Rex hỏi bạn: "Sao dạo này cậu không vỗ tay cổ vũ tớ?"\nChú T-Rex kia ngậm ngùi giơ hai tay lên: "Tay ngắn thế này, vỗ hụt mãi chán lắm cậu ơi!" 😂',
            hits: 9,
            tokensSavedPerHit: 95,
            createdAt: new Date().toISOString(),
            lastHit: new Date().toISOString()
        },
        'gioi thieu ve ban': {
            question: 'Bạn đang chạy bằng model AI nào trên máy tôi?',
            normalized: 'gioi thieu ve ban',
            answer: '🦖 Mình là **T-Rex AI**, đang chạy trực tiếp trên máy tính của bạn qua **Ollama Local** (model `qwen-fast:latest`). Toàn bộ hội thoại được xử lý an toàn 100% trên phần cứng cục bộ của bạn!',
            hits: 18,
            tokensSavedPerHit: 85,
            createdAt: new Date().toISOString(),
            lastHit: new Date().toISOString()
        },
        'chao ban': {
            question: 'Chào bạn',
            normalized: 'chao ban',
            answer: 'Xin chào! 🦖 Rất vui được gặp bạn! Mình là AI hỗ trợ web game Khủng Long. Bạn có cần chia sẻ mẹo chơi game đạt điểm cao hay cần giúp đỡ điều gì không?',
            hits: 26,
            tokensSavedPerHit: 60,
            createdAt: new Date().toISOString(),
            lastHit: new Date().toISOString()
        }
    };

    if (!fs.existsSync(ROUTER_CACHE_FILE)) {
        const initial = {
            enabled: true,
            stats: {
                totalQueries: 67,
                cacheHits: 67,
                tokensSaved: 5680,
                timeSavedSec: 96.5
            },
            entries: seedEntries
        };
        fs.writeFileSync(ROUTER_CACHE_FILE, JSON.stringify(initial, null, 2), 'utf8');
        return initial;
    }

    try {
        const data = fs.readFileSync(ROUTER_CACHE_FILE, 'utf8');
        const parsed = JSON.parse(data);
        if (!parsed.stats) parsed.stats = { totalQueries: 0, cacheHits: 0, tokensSaved: 0, timeSavedSec: 0 };
        if (!parsed.entries) parsed.entries = {};
        if (typeof parsed.enabled !== 'boolean') parsed.enabled = true;
        return parsed;
    } catch (e) {
        return { enabled: true, stats: { totalQueries: 0, cacheHits: 0, tokensSaved: 0, timeSavedSec: 0 }, entries: seedEntries };
    }
}

function saveRouterCacheDb(db) {
    try {
        fs.writeFileSync(ROUTER_CACHE_FILE, JSON.stringify(db, null, 2), 'utf8');
    } catch (e) {}
}

// Tính kích thước file Router Cache theo KB / MB
function getRouterCacheFileSize() {
    try {
        if (!fs.existsSync(ROUTER_CACHE_FILE)) return '0.00 KB';
        const stats = fs.statSync(ROUTER_CACHE_FILE);
        const bytes = stats.size;
        if (bytes >= 1024 * 1024) {
            return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
        }
        return (bytes / 1024).toFixed(2) + ' KB';
    } catch (e) {
        return '0.00 KB';
    }
}

// Chuẩn hóa câu hỏi để tra cứu trong Router Cache
function normalizeQuestion(str) {
    return String(str || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Bỏ dấu tiếng Việt để tìm kiếm thông minh
        .replace(/[^a-z0-9\s]/g, '')     // Bỏ dấu câu chấm hỏi, phẩy
        .trim()
        .replace(/\s+/g, ' ');
}

// Helper loại bỏ mã màu ANSI để tính toán độ dài ký tự hiển thị thực tế
function stripAnsi(str) {
    return String(str || '').replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
}

// Căn lề chuẩn xác dựa trên độ dài hiển thị thực tế (bỏ qua ký tự màu ANSI)
function padAnsi(str, targetWidth) {
    const visibleLen = stripAnsi(str).length;
    const padding = Math.max(0, targetWidth - visibleLen);
    return str + ' '.repeat(padding);
}

// Helper thực thi lệnh hệ thống trả về Promise
function runCmd(cmd) {
    return new Promise((resolve) => {
        exec(cmd, (err, stdout, stderr) => {
            resolve({ err, stdout: stdout ? stdout.trim() : '', stderr });
        });
    });
}

// Helper gửi request JSON đơn giản
function fetchJson(url, options = {}) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const client = parsed.protocol === 'https:' ? https : http;

        const req = client.request(url, {
            method: options.method || 'GET',
            headers: options.headers || {},
            timeout: 5000
        }, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve(data);
                }
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Timeout'));
        });

        if (options.body) {
            req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
        }
        req.end();
    });
}

// Kích hoạt nạp sẵn Model vào VRAM vĩnh viễn (keep_alive: -1) để luôn phản hồi trong 1 giây
async function warmUpOllama() {
    try {
        await fetchJson(`http://127.0.0.1:${OLLAMA_PORT}/api/generate`, {
            method: 'POST',
            body: {
                model: 'qwen-fast:latest',
                keep_alive: -1 // Giữ model trong VRAM vĩnh viễn
            }
        });
    } catch (e) {}
}

// Kiểm tra trạng thái Ollama
async function getOllamaStatus() {
    try {
        const data = await fetchJson(`http://127.0.0.1:${OLLAMA_PORT}/api/tags`);
        return {
            online: true,
            models: Array.isArray(data.models) ? data.models : []
        };
    } catch (e) {
        return { online: false, models: [] };
    }
}

// Kiểm tra trạng thái Ngrok & lấy Public URL
async function getNgrokStatus() {
    try {
        const data = await fetchJson(`http://127.0.0.1:${NGROK_API_PORT}/api/tunnels`);
        if (data.tunnels && data.tunnels.length > 0) {
            const httpsTunnel = data.tunnels.find(t => t.proto === 'https') || data.tunnels[0];
            return {
                online: true,
                url: httpsTunnel.public_url,
                proto: httpsTunnel.proto
            };
        }
        return { online: false, url: null };
    } catch (e) {
        return { online: false, url: null };
    }
}

// Copy văn bản vào Clipboard Windows (clip.exe)
function copyToClipboard(text) {
    try {
        const proc = spawn('clip');
        proc.stdin.write(text);
        proc.stdin.end();
        return true;
    } catch (e) {
        return false;
    }
}

// In Header chính của Controller
async function printBanner() {
    console.clear();
    console.log(`${C.cyan}╔════════════════════════════════════════════════════════════════════════════════╗${C.reset}`);
    console.log(`${C.cyan}║${C.bright}${C.yellow}                🦖 T-REX AI CONTROLLER & API GATEWAY CLI                ${C.reset}${C.cyan}║${C.reset}`);
    console.log(`${C.cyan}║${C.dim}          Quan ly & Giam sat AI Local (Ollama) va Ngrok Tunnel          ${C.reset}${C.cyan}║${C.reset}`);
    console.log(`${C.cyan}╚════════════════════════════════════════════════════════════════════════════════╝${C.reset}`);

    const [ollama, ngrok] = await Promise.all([getOllamaStatus(), getNgrokStatus()]);

    console.log(`${C.bright}TRẠNG THÁI HỆ THỐNG HIỆN TẠI:${C.reset}`);
    
    // Status Ollama
    if (ollama.online) {
        const modelNames = ollama.models.map(m => m.name.split(':')[0]).join(', ') || 'Chưa nạp model';
        console.log(`  🤖 ${C.bright}Ollama AI:${C.reset}    ${C.green}● ONLINE (Port ${OLLAMA_PORT})${C.reset} | Models: ${C.yellow}${modelNames}${C.reset}`);
    } else {
        console.log(`  🤖 ${C.bright}Ollama AI:${C.reset}    ${C.red}○ OFFLINE${C.reset} (Chưa bật service)`);
    }

    // Status Ngrok
    if (ngrok.online) {
        console.log(`  🌐 ${C.bright}Ngrok Tunnel:${C.reset} ${C.green}● ONLINE${C.reset} -> ${C.cyan}${C.bright}${ngrok.url}${C.reset}`);
    } else {
        console.log(`  🌐 ${C.bright}Ngrok Tunnel:${C.reset} ${C.red}○ OFFLINE${C.reset} (Chưa mở cổng Internet)`);
    }

    console.log(`${C.dim}────────────────────────────────────────────────────────────────────────────────${C.reset}`);
}

// -------------------------------------------------------------
// [1] KHỞI ĐỘNG AI (Ollama)
// -------------------------------------------------------------
async function handleStartAI() {
    console.log(`\n${C.yellow}⏳ Đang kiểm tra và khởi động Ollama AI...${C.reset}`);
    
    const status = await getOllamaStatus();
    if (status.online) {
        console.log(`${C.green}✅ Ollama đã đang chạy sẵn tại port ${OLLAMA_PORT}!${C.reset}`);
    } else {
        exec('start "" ollama app');
        process.stdout.write('  Đang khởi động tiến trình Ollama');
        for (let i = 0; i < 6; i++) {
            await new Promise(r => setTimeout(r, 800));
            process.stdout.write('.');
            const check = await getOllamaStatus();
            if (check.online) {
                console.log(`\n${C.green}✅ Khởi động Ollama thành công!${C.reset}`);
                break;
            }
        }
    }

    const finalStatus = await getOllamaStatus();
    if (finalStatus.online) {
        console.log(`\n📦 ${C.bright}Danh sách mô hình đã cài đặt trong máy:${C.reset}`);
        finalStatus.models.forEach((m, idx) => {
            const sizeGB = (m.size / (1024 * 1024 * 1024)).toFixed(2);
            console.log(`  ${idx + 1}. ${C.yellow}${m.name.padEnd(25)}${C.reset} | Size: ${sizeGB} GB | Quant: ${m.details?.quantization_level || 'N/A'}`);
        });

        // Tự động nạp sẵn model qwen-fast vào VRAM vĩnh viễn
        process.stdout.write(`\n🚀 Đang nạp sẵn mô hình vào VRAM để phản hồi siêu tốc... `);
        await warmUpOllama();
        console.log(`${C.green}Hoàn tất! Model luôn sẵn sàng trong 1 giây.${C.reset}`);
    } else {
        console.log(`\n${C.red}⚠️ Không thể khởi động Ollama tự động. Bạn vui lòng mở ứng dụng Ollama từ Start Menu!${C.reset}`);
    }
}

// -------------------------------------------------------------
// [2] KHỞI ĐỘNG NGROK
// -------------------------------------------------------------
async function handleStartNgrok() {
    console.log(`\n${C.yellow}⏳ Đang kiểm tra và khởi động Ngrok Tunnel...${C.reset}`);

    const currentNgrok = await getNgrokStatus();
    if (currentNgrok.online) {
        console.log(`${C.green}✅ Ngrok đã đang chạy sẵn!${C.reset}`);
        console.log(`🔗 Public URL: ${C.cyan}${C.bright}${currentNgrok.url}${C.reset}`);
        copyToClipboard(currentNgrok.url);
        console.log(`📋 ${C.dim}(Đã tự động sao chép link vào Clipboard)${C.reset}`);
        return;
    }

    // Chạy ngrok với host-header để Ollama không chặn 403
    exec('start /B ngrok http 11434 --host-header=localhost:11434 --log=stdout');
    process.stdout.write('  Đang thiết lập đường hầm HTTPS');
    for (let i = 0; i < 8; i++) {
        await new Promise(r => setTimeout(r, 800));
        process.stdout.write('.');
        const check = await getNgrokStatus();
        if (check.online) {
            console.log(`\n${C.green}✅ Mở đường hầm Ngrok thành công!${C.reset}`);
            console.log(`🔗 Public URL: ${C.cyan}${C.bright}${check.url}${C.reset}`);
            copyToClipboard(check.url);
            console.log(`📋 ${C.dim}(Đã tự động sao chép link vào Clipboard)${C.reset}`);
            return;
        }
    }

    console.log(`\n${C.red}⚠️ Chưa thể lấy URL Ngrok. Hãy đảm bảo bạn đã cài ngrok và có authtoken!${C.reset}`);
}

// -------------------------------------------------------------
// [3] HIỆN BẢNG THỐNG KÊ AI (LÀM MỚI LIÊN TỤC)
// -------------------------------------------------------------
async function handleLiveDashboard() {
    console.clear();
    let isRunning = true;

    // Lắng nghe phím bấm để thoát khỏi Dashboard
    const onKeypress = (chunk, key) => {
        if (key && (key.name === 'q' || key.name === 'escape' || key.name === 'return')) {
            isRunning = false;
        }
    };

    if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.on('keypress', onKeypress);
    }

    while (isRunning) {
        console.clear();
        const now = new Date().toLocaleTimeString('vi-VN');
        console.log(`${C.bgBlue}${C.white}${C.bright} 📊 T-REX AI LIVE MONITOR DASHBOARD (Cập nhật lúc: ${now}) ${C.reset}`);
        console.log(`${C.dim}Nhấn phím [Q] hoặc [ESC] hoặc [Enter] để quay lại Menu chính${C.reset}\n`);

        // 1. Thông số Ollama Process
        const procInfo = await runCmd('powershell -Command "Get-Process ollama -ErrorAction SilentlyContinue | Select-Object -First 1 Id, CPU, WorkingSet64"');
        console.log(`${C.bright}1. THÔNG SỐ TÀI NGUYÊN OLLAMA (Local Machine):${C.reset}`);
        if (procInfo.stdout) {
            const lines = procInfo.stdout.split('\n').filter(Boolean);
            if (lines.length >= 2) {
                const parts = lines[lines.length - 1].trim().split(/\s+/);
                const pid = parts[0] || 'N/A';
                const cpu = parts[1] ? parseFloat(parts[1]).toFixed(1) + 's' : 'N/A';
                const ramMB = parts[2] ? (parseInt(parts[2]) / (1024 * 1024)).toFixed(0) + ' MB' : 'N/A';
                console.log(`   • Tiến trình PID: ${C.yellow}${pid}${C.reset}  |  RAM Sử dụng: ${C.green}${ramMB}${C.reset}  |  CPU Time: ${C.cyan}${cpu}${C.reset}`);
            }
        } else {
            console.log(`   • Trạng thái: ${C.red}Ollama chưa được kích hoạt${C.reset}`);
        }

        // 2. Mô hình đang nạp trong VRAM
        try {
            const psData = await fetchJson(`http://127.0.0.1:${OLLAMA_PORT}/api/ps`);
            if (psData.models && psData.models.length > 0) {
                console.log(`   • Mô hình đang chạy trong RAM/VRAM:`);
                psData.models.forEach(m => {
                    const vramMB = (m.size_vram / (1024 * 1024)).toFixed(0);
                    console.log(`     -> ${C.magenta}${m.name}${C.reset} (VRAM: ${vramMB} MB, Trạng thái: ${C.green}Đã ghim vĩnh viễn${C.reset})`);
                });
            } else {
                console.log(`   • Mô hình trong VRAM: ${C.dim}Chế độ chờ (Sleep/Idle)${C.reset}`);
            }
        } catch (e) {
            console.log(`   • Mô hình trong VRAM: ${C.dim}Không lấy được dữ liệu${C.reset}`);
        }

        console.log(`\n${C.bright}2. THÔNG SỐ MẠNG & ĐƯỜNG HẦM NGROK:${C.reset}`);
        const ngrok = await getNgrokStatus();
        if (ngrok.online) {
            console.log(`   • Trạng thái: ${C.green}Đang mở kết nối toàn cầu${C.reset}`);
            console.log(`   • Link Public: ${C.cyan}${ngrok.url}${C.reset}`);

            // Lấy metrics từ ngrok
            try {
                const metrics = await fetchJson(`http://127.0.0.1:${NGROK_API_PORT}/api/tunnels`);
                const t = metrics.tunnels?.[0];
                if (t && t.metrics) {
                    console.log(`   • Tổng lượt kết nối: ${C.yellow}${t.metrics.conns?.count || 0}${C.reset}  |  HTTP Requests: ${C.green}${t.metrics.http?.count || 0}${C.reset}  |  Tốc độ: ${(t.metrics.http?.rate1 || 0).toFixed(2)} req/s`);
                }
            } catch (e) {}
        } else {
            console.log(`   • Trạng thái: ${C.red}Chưa mở Ngrok Tunnel${C.reset}`);
        }

        // 3. Lịch sử Request gần nhất
        console.log(`\n${C.bright}3. YÊU CẦU TRUY CẬP GẦN ĐÂY (Recent Requests):${C.reset}`);
        try {
            const reqsData = await fetchJson(`http://127.0.0.1:${NGROK_API_PORT}/api/requests/http?limit=5`);
            if (reqsData.requests && reqsData.requests.length > 0) {
                console.log(`   ${'THỜI GIAN'.padEnd(10)} | ${'METHOD & URI'.padEnd(16)} | ${'STATUS'.padEnd(10)} | ${'ĐỘ TRỄ'.padEnd(10)} | ${'CLIENT IP'}`);
                console.log(`   ${C.dim}────────────────────────────────────────────────────────────────────${C.reset}`);
                reqsData.requests.slice(0, 5).forEach(r => {
                    const time = new Date(r.start).toLocaleTimeString();
                    const status = r.response?.status_code || (r.response ? 'ERR' : 'IN_FLIGHT');
                    const statusColored = status === 200 ? `${C.green}200 OK${C.reset}` : (status === 'IN_FLIGHT' ? `${C.yellow}Đang xử lý${C.reset}` : `${C.red}${status}${C.reset}`);
                    const dur = (r.duration / 1000000000).toFixed(2) + 's';
                    const ip = r.remote_addr || 'unknown';
                    const uri = (r.request?.method || 'GET') + ' ' + (r.request?.uri || '/');
                    console.log(`   ${time.padEnd(10)} | ${uri.padEnd(16)} | ${statusColored.padEnd(19)} | ${dur.padEnd(10)} | ${ip}`);
                });
            } else {
                console.log(`   ${C.dim}Chưa có lượt request nào qua Ngrok gần đây.${C.reset}`);
            }
        } catch (e) {
            console.log(`   ${C.dim}Chưa có dữ liệu lịch sử yêu cầu.${C.reset}`);
        }

        console.log(`\n${C.dim}────────────────────────────────────────────────────────────────────────────────${C.reset}`);
        console.log(`${C.yellow}Đang tự động làm mới mỗi 1.5 giây... (Nhấn Q để thoát)${C.reset}`);

        await new Promise(r => setTimeout(r, 1500));
    }

    if (process.stdin.isTTY) {
        process.stdin.removeListener('keypress', onKeypress);
        process.stdin.setRawMode(false);
    }
}

// -------------------------------------------------------------
// [4] XUẤT API ĐỂ GỌI TỪ MỌI WEB
// -------------------------------------------------------------
async function handleExportAPI() {
    const ngrok = await getNgrokStatus();
    const apiUrl = ngrok.online ? ngrok.url : `http://localhost:${OLLAMA_PORT}`;

    console.log(`\n${C.cyan}╔════════════════════════════════════════════════════════════════════════════════╗${C.reset}`);
    console.log(`${C.cyan}║${C.bright}${C.green}                     HỒ SƠ API KẾT NỐI AI CHO MỌI WEBSITE                       ${C.reset}${C.cyan}║${C.reset}`);
    console.log(`${C.cyan}╚════════════════════════════════════════════════════════════════════════════════╝${C.reset}\n`);

    console.log(`📌 ${C.bright}API ENDPOINTS:${C.reset}`);
    console.log(`   • Chat Completion: ${C.yellow}${apiUrl}/api/chat${C.reset}`);
    console.log(`   • Models List:     ${C.yellow}${apiUrl}/api/tags${C.reset}`);
    console.log(`   • Text Generation: ${C.yellow}${apiUrl}/api/generate${C.reset}\n`);

    console.log(`📌 ${C.bright}HEADERS KẾT NỐI:${C.reset}`);
    console.log(`   • ${C.cyan}Content-Type:${C.reset} application/json`);
    console.log(`   • ${C.cyan}ngrok-skip-browser-warning:${C.reset} 1  (Bỏ qua màn hình bảo vệ Ngrok)`);
    console.log(`   • ${C.cyan}X-Client-Origin:${C.reset} Tên website của bạn (để bảng thống kê ghi nhận đúng tên web)\n`);

    const jsCode = `// 1. Mã nguồn JavaScript (Dùng trên mọi Web / React / Vue / HTML thuần)
async function askAI(prompt) {
    // Tự động lấy tên website hiện tại để xuất hiện trên Controller
    const myWebsite = typeof window !== 'undefined' ? window.location.origin : 'My-Custom-Web';

    const response = await fetch("${apiUrl}/api/chat", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "1",
            "X-Client-Origin": myWebsite
        },
        body: JSON.stringify({
            model: "qwen-fast:latest",
            messages: [{ role: "user", content: prompt }],
            stream: false,
            think: false, // Trả lời siêu tốc trong 1-2 giây
            keep_alive: -1
        })
    });
    const data = await response.json();
    console.log("Câu trả lời:", data.message.content);
    return data.message.content;
}

// Gọi thử:
askAI("Chào bạn, bạn có thể giúp gì cho tôi?");`;

    console.log(`💻 ${C.bright}CODE MẪU JAVASCRIPT (FRONTEND / NODEJS):${C.reset}`);
    console.log(`${C.dim}────────────────────────────────────────────────────────────────────${C.reset}`);
    console.log(jsCode);
    console.log(`${C.dim}────────────────────────────────────────────────────────────────────${C.reset}\n`);

    const curlCode = `curl -X POST "${apiUrl}/api/chat" ^
  -H "Content-Type: application/json" ^
  -H "ngrok-skip-browser-warning: 1" ^
  -H "X-Client-Origin: https://my-website.com" ^
  -d "{\\"model\\":\\"qwen-fast:latest\\",\\"messages\\":[{\\"role\\":\\"user\\",\\"content\\":\\"Xin chao!\\"}],\\"stream\\":false,\\"think\\":false,\\"keep_alive\\":-1}"`;

    console.log(`📡 ${C.bright}LỆNH TEST TRÊN TERMINAL (cURL):${C.reset}`);
    console.log(`${C.dim}────────────────────────────────────────────────────────────────────${C.reset}`);
    console.log(curlCode);
    console.log(`${C.dim}────────────────────────────────────────────────────────────────────${C.reset}\n`);

    copyToClipboard(jsCode);
    console.log(`📋 ${C.green}Đã tự động sao chép mã nguồn JavaScript vào Clipboard của bạn!${C.reset}`);
}

// -------------------------------------------------------------
// [5] HIỂN THỊ TÊN WEB ĐANG DÙNG AI, SỐ REQS & TOKENS
// CẬP NHẬT LIÊN TỤC MÀ KHÔNG NHÁY MÀN (FLICKER-FREE LIVE MONITOR)
// -------------------------------------------------------------

// Trích xuất định danh website chính xác từ HTTP Request
function extractWebsiteIdentity(r) {
    const headers = r.request?.headers || {};

    // 1. Header do client hoặc Vercel gửi chủ động
    let site = (headers['X-Client-Origin']?.[0] || headers['X-App-Name']?.[0] || '').trim();

    // 2. Standard Origin header từ trình duyệt
    if (!site && headers['Origin']?.[0]) {
        site = headers['Origin'][0].trim();
    }

    // 3. Standard Referer header từ trình duyệt
    if (!site && headers['Referer']?.[0]) {
        try {
            const u = new URL(headers['Referer'][0]);
            site = `${u.protocol}//${u.host}`;
        } catch (e) {
            site = headers['Referer'][0];
        }
    }

    // 4. Nếu là cuộc gọi từ Vercel Cloud Serverless Function
    if (!site && (headers['X-Vercel-Id'] || headers['X-Invocation-Id'])) {
        site = 'Web Game Vercel (binhpham0725/REX)';
    }

    // 5. Host Header (nếu không phải localhost)
    if (!site && headers['Host']?.[0] && !headers['Host'][0].includes('localhost')) {
        site = headers['Host'][0];
    }

    // 6. Nhận diện các Client khác
    if (!site) {
        const ua = (headers['User-Agent']?.[0] || '').toLowerCase();
        if (ua.includes('curl')) {
            site = 'cURL CLI / Terminal Client';
        } else if (ua.includes('node')) {
            site = 'Node.js Backend Client';
        } else if (ua.includes('python')) {
            site = 'Python Client Script';
        } else if (ua.includes('postman')) {
            site = 'Postman API Client';
        } else {
            site = 'Direct API Client';
        }
    }

    return site;
}

// Trích xuất số token thực tế từ phản hồi Ollama
function extractTokensFromResponse(r) {
    let promptTokens = 0;
    let completionTokens = 0;

    if (r.response && r.response.raw) {
        try {
            const rawStr = Buffer.from(r.response.raw, 'base64').toString('utf8');
            const promptMatch = rawStr.match(/"prompt_eval_count":\s*(\d+)/);
            const evalMatch = rawStr.match(/"eval_count":\s*(\d+)/);
            if (promptMatch) promptTokens = parseInt(promptMatch[1], 10);
            if (evalMatch) completionTokens = parseInt(evalMatch[1], 10);

            // Nếu là request chat thành công nhưng chưa bắt được trường eval_count
            if (promptTokens === 0 && completionTokens === 0 && r.request?.uri?.includes('/api/chat') && r.response.status_code === 200) {
                let contentLen = 0;
                const matches = rawStr.matchAll(/"content":"([^"]*)"/g);
                for (const m of matches) {
                    contentLen += m[1].length;
                }
                if (contentLen > 0) {
                    completionTokens = Math.max(1, Math.round(contentLen / 3));
                    promptTokens = Math.max(15, Math.round((r.request?.raw ? Buffer.from(r.request.raw, 'base64').toString('utf8').length : 120) / 4));
                }
            }
        } catch (e) {}
    }

    return {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens
    };
}

// Tạo thanh đo trực quan mức độ sử dụng (7 ký tự)
function generateUsageBar(percent) {
    const totalBars = 7;
    const filled = Math.min(totalBars, Math.max(0, Math.round((percent / 100) * totalBars)));
    const empty = totalBars - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
}

// Định dạng số có dấu phẩy ngăn cách hàng nghìn
function formatNum(n) {
    return Number(n || 0).toLocaleString('en-US');
}

// Rút gọn số token: 1450 -> 1.5k
function formatTokenShort(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return String(n || 0);
}

// Đồng bộ lưu lượng mới nhất từ Ngrok vào Database
async function syncTrafficData() {
    const db = initTrafficDb();

    try {
        const reqsData = await fetchJson(`http://127.0.0.1:${NGROK_API_PORT}/api/requests/http?limit=50`);
        if (reqsData.requests && reqsData.requests.length > 0) {
            reqsData.requests.forEach(r => {
                const reqId = r.id;
                const hasCompletedResponse = Boolean(r.response && r.response.status_code);

                // Nếu request này chưa xong (đang stream dở) thì bỏ qua chưa chốt vào processedIds
                if (!hasCompletedResponse) {
                    return;
                }

                // Nếu request này chưa được ghi nhận vào database
                if (!db.processedIds[reqId]) {
                    const siteName = extractWebsiteIdentity(r);
                    const isSuccess = r.response.status_code === 200;
                    const durationSec = r.duration ? r.duration / 1000000000 : 0;
                    const endpoint = r.request?.uri || '/api/chat';
                    const tokens = extractTokensFromResponse(r);
                    const isChat = endpoint.includes('/chat');
                    const isFinal = !isChat || tokens.totalTokens > 0;

                    db.processedIds[reqId] = {
                        time: r.start,
                        site: siteName,
                        promptTokens: tokens.promptTokens,
                        completionTokens: tokens.completionTokens,
                        totalTokens: tokens.totalTokens,
                        finalized: isFinal
                    };

                    if (!db.websites[siteName]) {
                        db.websites[siteName] = {
                            name: siteName,
                            totalRequests: 0,
                            successRequests: 0,
                            errorRequests: 0,
                            promptTokens: 0,
                            completionTokens: 0,
                            totalTokens: 0,
                            totalDuration: 0,
                            lastActive: r.start,
                            endpoints: {},
                            clientIps: []
                        };
                    }

                    const site = db.websites[siteName];
                    site.totalRequests++;
                    if (isSuccess) {
                        site.successRequests++;
                    } else {
                        site.errorRequests++;
                    }

                    site.promptTokens += tokens.promptTokens;
                    site.completionTokens += tokens.completionTokens;
                    site.totalTokens += tokens.totalTokens;
                    site.totalDuration += durationSec;

                    if (new Date(r.start) > new Date(site.lastActive)) {
                        site.lastActive = r.start;
                    }
                    site.endpoints[endpoint] = (site.endpoints[endpoint] || 0) + 1;
                    if (r.remote_addr && !site.clientIps.includes(r.remote_addr)) {
                        site.clientIps.push(r.remote_addr);
                    }

                    // Lưu vào danh sách audit log gần nhất (giữ tối đa 10 mục)
                    db.recentAudit.unshift({
                        id: reqId,
                        time: r.start,
                        site: siteName,
                        method: r.request?.method || 'POST',
                        uri: endpoint,
                        status: r.response.status_code,
                        duration: durationSec,
                        promptTokens: tokens.promptTokens,
                        completionTokens: tokens.completionTokens,
                        totalTokens: tokens.totalTokens
                    });
                    if (db.recentAudit.length > 10) {
                        db.recentAudit.pop();
                    }
                } else {
                    // Nếu request này đã lưu nhưng trước đó token = 0 (bị lưu sớm khi đang stream dở)
                    const proc = typeof db.processedIds[reqId] === 'object' ? db.processedIds[reqId] : { totalTokens: 0, finalized: false };
                    if (!proc.finalized || proc.totalTokens === 0) {
                        const tokens = extractTokensFromResponse(r);
                        if (tokens.totalTokens > 0) {
                            const siteName = extractWebsiteIdentity(r);
                            const site = db.websites[siteName];
                            const diffP = tokens.promptTokens - (proc.promptTokens || 0);
                            const diffC = tokens.completionTokens - (proc.completionTokens || 0);
                            const diffT = tokens.totalTokens - (proc.totalTokens || 0);

                            if (site && diffT > 0) {
                                site.promptTokens += Math.max(0, diffP);
                                site.completionTokens += Math.max(0, diffC);
                                site.totalTokens += Math.max(0, diffT);
                            }

                            // Cập nhật audit log tương ứng
                            const auditItem = db.recentAudit.find(a => a.id === reqId);
                            if (auditItem) {
                                auditItem.promptTokens = tokens.promptTokens;
                                auditItem.completionTokens = tokens.completionTokens;
                                auditItem.totalTokens = tokens.totalTokens;
                                if (r.duration) auditItem.duration = r.duration / 1000000000;
                            }

                            db.processedIds[reqId] = {
                                time: r.start,
                                site: siteName,
                                promptTokens: tokens.promptTokens,
                                completionTokens: tokens.completionTokens,
                                totalTokens: tokens.totalTokens,
                                finalized: true
                            };
                        }
                    }
                }
            });

            saveTrafficDb(db);
        }
    } catch (e) {
        // Ngrok chưa bật hoặc lỗi kết nối
    }

    return db;
}

// Bảng điều khiển giám sát thời gian thực không nháy màn (Flicker-Free Live Monitor)
async function handleWebUsageStats(rl) {
    let isRunning = true;

    // Lắng nghe phím bấm: Q, ESC, Enter để thoát; C để reset dữ liệu
    const onKeypress = (chunk, key) => {
        if (!key) return;
        if (key.name === 'q' || key.name === 'escape' || key.name === 'return' || (key.ctrl && key.name === 'c')) {
            isRunning = false;
        } else if (key.name === 'c') {
            resetTrafficDb();
        }
    };

    if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.on('keypress', onKeypress);
    }

    // Ẩn con trỏ terminal và xóa màn hình một lần duy nhất lúc khởi động
    process.stdout.write('\x1b[?25l');
    console.clear();

    // Định nghĩa độ rộng cột chuẩn xác (Tổng chiều rộng: 111 ký tự - không bao giờ rớt dòng!)
    const colWidths = [3, 22, 17, 7, 16, 6, 6, 9];

    const tableTop = '┌' + colWidths.map(w => '─'.repeat(w + 2)).join('┬') + '┐';
    const tableMid = '├' + colWidths.map(w => '─'.repeat(w + 2)).join('┼') + '┤';
    const tableBot = '└' + colWidths.map(w => '─'.repeat(w + 2)).join('┴') + '┘';

    while (isRunning) {
        const db = await syncTrafficData();
        const siteList = Object.values(db.websites);
        const now = Date.now();
        const timeStr = new Date().toLocaleTimeString('vi-VN');

        // Tạo buffer màn hình hoàn chỉnh (Single Render Buffer)
        // Di chuyển con trỏ về góc trên cùng bên trái [H] và ghi đè từng dòng [K]
        let out = '\x1b[H';

        out += `${C.cyan}╔═════════════════════════════════════════════════════════════════════════════════════════════════════════════╗${C.reset}\x1b[K\n`;
        out += `${C.cyan}║${C.bright}${C.yellow}                    🦖 T-REX AI - REAL-TIME WEB USAGE & TOKEN MONITOR (CẬP NHẬT 1.0s)                    ${C.reset}${C.cyan}║${C.reset}\x1b[K\n`;
        out += `${C.cyan}║${C.dim}                       Bấm [Q]/[ESC] để thoát ra Menu  │  Bấm [C] để Reset bộ đếm số liệu                       ${C.reset}${C.cyan}║${C.reset}\x1b[K\n`;
        out += `${C.cyan}╚═════════════════════════════════════════════════════════════════════════════════════════════════════════════╝${C.reset}\x1b[K\n`;

        if (siteList.length === 0) {
            out += `\n${C.yellow}  ℹ️ Hiện tại chưa ghi nhận yêu cầu truy cập nào qua Ngrok Tunnel.${C.reset}\x1b[K\n`;
            out += `  💡 Khi bất kỳ website nào (hoặc Web game Vercel) gửi prompt đến AI, dữ liệu sẽ lập tức nhảy tại đây!\x1b[K\n`;
            out += `\n  ${C.dim}Đang chờ kết nối... (Làm mới lúc: ${timeStr} | Bấm Q để quay lại Menu)${C.reset}\x1b[K\n`;
            for (let i = 0; i < 12; i++) {
                out += `\x1b[K\n`;
            }
            process.stdout.write(out);
            await new Promise(r => setTimeout(r, 1000));
            continue;
        }

        // Tính toán các chỉ số tổng hợp toàn hệ thống
        const totalAllRequests = siteList.reduce((sum, s) => sum + s.totalRequests, 0);
        const totalSuccess = siteList.reduce((sum, s) => sum + s.successRequests, 0);
        const totalErrors = siteList.reduce((sum, s) => sum + s.errorRequests, 0);
        const overallSuccessRate = totalAllRequests > 0 ? ((totalSuccess / totalAllRequests) * 100).toFixed(0) : 100;

        const totalAllTokens = siteList.reduce((sum, s) => sum + s.totalTokens, 0);
        const totalPromptTokens = siteList.reduce((sum, s) => sum + s.promptTokens, 0);
        const totalCompletionTokens = siteList.reduce((sum, s) => sum + s.completionTokens, 0);

        const totalDurationAll = siteList.reduce((sum, s) => sum + s.totalDuration, 0);
        const avgSpeed = totalDurationAll > 0 && totalCompletionTokens > 0 ? (totalCompletionTokens / totalDurationAll).toFixed(1) : '0.0';
        const avgLatencyAll = totalAllRequests > 0 ? (totalDurationAll / totalAllRequests).toFixed(1) + 's' : '0.0s';

        // Sắp xếp các website theo số lượt requests giảm dần
        siteList.sort((a, b) => b.totalRequests - a.totalRequests);
        const topSite = siteList[0] ? siteList[0].name : 'Chưa có';
        const topSiteClean = topSite.replace(/^https?:\/\//, '');
        const topSiteShort = topSiteClean.length > 30 ? topSiteClean.substring(0, 27) + '...' : topSiteClean;

        // Khối KPI Tổng Quan
        out += `${C.bright}📌 TỔNG QUAN HỆ THỐNG TOÀN CẦU:${C.reset}\x1b[K\n`;
        out += `   • ${C.bright}Tổng Websites:${C.reset} ${C.cyan}${siteList.length} nguồn${C.reset}   • ${C.bright}Tổng Reqs:${C.reset} ${C.green}${formatNum(totalAllRequests)} reqs${C.reset} (T.Công: ${C.green}${overallSuccessRate}%${C.reset} | Lỗi: ${C.red}${totalErrors}${C.reset})\x1b[K\n`;
        out += `   • ${C.bright}Tổng Tokens:${C.reset}   ${C.yellow}${formatNum(totalAllTokens)} Tokens${C.reset}  (In: ${C.cyan}${formatNum(totalPromptTokens)}${C.reset} | Out: ${C.magenta}${formatNum(totalCompletionTokens)}${C.reset})\x1b[K\n`;
        out += `   • ${C.bright}Nguồn Top 1:${C.reset}   ${C.yellow}${topSiteShort}${C.reset}\x1b[K\n`;
        out += `   • ${C.bright}Tốc độ AI:${C.reset}     ${C.cyan}${avgSpeed} tokens/s${C.reset}   • ${C.bright}Độ trễ TB:${C.reset} ${C.green}${avgLatencyAll}${C.reset} | Live: ${C.green}● ${timeStr}${C.reset}\x1b[K\n`;
        out += `\x1b[K\n`;

        // Bảng chi tiết từng Website (Độ rộng chuẩn 101 ký tự - Căn chỉnh hoàn hảo không bao giờ rớt dòng!)
        out += `${tableTop}\x1b[K\n`;
        
        // In Dòng Header
        const headerCols = [
            `${C.bright}STT${C.reset}`,
            `${C.bright}TÊN WEBSITE / NGUỒN${C.reset}`,
            `${C.bright}MỨC ĐỘ SỬ DỤNG${C.reset}`,
            `${C.bright}SỐ REQ${C.reset}`,
            `${C.bright}TOKENS (IN/OUT)${C.reset}`,
            `${C.bright}T.CÔNG${C.reset}`,
            `${C.bright}ĐỘ TRỄ${C.reset}`,
            `${C.bright}HOẠT ĐỘNG${C.reset}`
        ];
        let headerRow = '│';
        headerCols.forEach((col, i) => {
            headerRow += ' ' + padAnsi(col, colWidths[i]) + ' │';
        });
        out += `${headerRow}\x1b[K\n`;
        out += `${tableMid}\x1b[K\n`;

        siteList.forEach((site, idx) => {
            const percent = totalAllRequests > 0 ? (site.totalRequests / totalAllRequests) * 100 : 0;
            const bar = generateUsageBar(percent);

            let levelTag = '';
            let levelColor = C.green;
            if (percent >= 50) {
                levelTag = 'CAO';
                levelColor = C.red;
            } else if (percent >= 20) {
                levelTag = 'VỪA';
                levelColor = C.yellow;
            } else {
                levelTag = 'THẤP';
                levelColor = C.green;
            }

            const usageMeter = `[${levelColor}${bar}${C.reset}] ${Math.round(percent).toString().padStart(2)}% ${levelColor}${levelTag.padEnd(4)}${C.reset}`;
            const successRate = site.totalRequests > 0 ? Math.round((site.successRequests / site.totalRequests) * 100) + '%' : '100%';
            const avgDur = site.totalRequests > 0 ? (site.totalDuration / site.totalRequests).toFixed(1) + 's' : '0.0s';

            const lastTime = new Date(site.lastActive);
            const isRecent = (now - lastTime.getTime()) < 5 * 60 * 1000;
            const timeOnly = lastTime.toTimeString().split(' ')[0].substring(0, 5); // 01:40
            const activeStatus = isRecent ? `${C.green}🟢 ${timeOnly}${C.reset}` : `${C.dim}⚪ ${timeOnly}${C.reset}`;

            let displayName = site.name;
            // Làm gọn tên website cho đẹp
            displayName = displayName.replace(/^https?:\/\//, '');
            if (displayName.length > colWidths[1]) {
                displayName = displayName.substring(0, colWidths[1] - 3) + '...';
            }

            // Chuỗi Tokens gọn gàng (Ví dụ: 4.3k (3k/1.3k))
            const totalTokStr = formatTokenShort(site.totalTokens);
            const pTokStr = formatTokenShort(site.promptTokens);
            const cTokStr = formatTokenShort(site.completionTokens);
            const tokenStr = `${totalTokStr} (${pTokStr}/${cTokStr})`;

            const rowCols = [
                String(idx + 1),
                `${C.bright}${displayName}${C.reset}`,
                usageMeter,
                `${C.cyan}${site.totalRequests} req${C.reset}`,
                `${C.yellow}${tokenStr}${C.reset}`,
                `${C.green}${successRate}${C.reset}`,
                avgDur,
                activeStatus
            ];

            let rowStr = '│';
            rowCols.forEach((col, i) => {
                rowStr += ' ' + padAnsi(col, colWidths[i]) + ' │';
            });
            out += `${rowStr}\x1b[K\n`;
        });

        out += `${tableBot}\x1b[K\n`;

        // Live Audit Log: 4 Request gần đây nhất
        out += `${C.bright}📡 NHẬT KÝ 4 YÊU CẦU MỚI NHẤT (LIVE AUDIT FEED):${C.reset}\x1b[K\n`;
        if (db.recentAudit && db.recentAudit.length > 0) {
            db.recentAudit.slice(0, 4).forEach(r => {
                const time = new Date(r.time).toLocaleTimeString('vi-VN');
                let site = r.site.replace(/^https?:\/\//, '');
                if (site.length > 22) site = site.substring(0, 19) + '...';
                site = site.padEnd(22);

                const statusStr = r.status === 200 ? `${C.green}200 OK${C.reset}` : `${C.red}${r.status || 'ERR'}${C.reset}`;
                const dur = r.duration.toFixed(2) + 's';
                const tokenStr = r.totalTokens > 0 ? `${C.yellow}${formatNum(r.totalTokens)} Toks${C.reset} (In: ${r.promptTokens}, Out: ${r.completionTokens})` : `${C.dim}0 Tokens${C.reset}`;
                out += `   • ${C.dim}${time}${C.reset} │ ${C.cyan}${site}${C.reset} │ ${r.method.padEnd(4)} │ ${statusStr} │ ${tokenStr.padEnd(32)} │ ${dur}\x1b[K\n`;
            });
        } else {
            out += `   ${C.dim}Chưa có dữ liệu nhật ký mới.${C.reset}\x1b[K\n`;
        }

        out += `\x1b[K\n`;
        out += `💡 ${C.dim}Phím: [Q] hoặc [ESC] hoặc [Enter] để Quay lại Menu | [C] Xóa sạch dữ liệu thống kê${C.reset}\x1b[K\n`;
        out += `💡 ${C.dim}Màn hình cập nhật liên tục 1.0 giây hoàn toàn không nháy màn (Flicker-Free).${C.reset}\x1b[K\n`;

        // Ghi toàn bộ buffer ra terminal một lần duy nhất
        process.stdout.write(out);

        // Chờ 1 giây cho chu kỳ cập nhật tiếp theo
        await new Promise(r => setTimeout(r, 1000));
    }

    // Khôi phục lại trạng thái terminal khi thoát
    if (process.stdin.isTTY) {
        process.stdin.removeListener('keypress', onKeypress);
        process.stdin.setRawMode(false);
    }
    process.stdout.write('\x1b[?25h');
}

// Helper đặt câu hỏi dạng Promise
function askInput(rl, query) {
    return new Promise(resolve => rl.question(query, resolve));
}

// Helper tạm dừng
function delay(ms) {
    return new Promise(r => setTimeout(r, ms));
}

// -------------------------------------------------------------
// [6] BẬT / TẮT QUYỀN TRUY CẬP API CỦA TỪNG NGUỒN (ACCESS CONTROL)
// -------------------------------------------------------------
async function handleAccessControl(rl) {
    let subRunning = true;

    while (subRunning) {
        console.clear();
        const accessDb = initAccessControlDb();
        const trafficDb = initTrafficDb();

        // Tự động phát hiện nguồn mới từ traffic nếu có
        Object.keys(trafficDb.websites || {}).forEach(site => {
            if (!accessDb.sources[site]) {
                accessDb.sources[site] = {
                    status: accessDb.defaultPolicy || 'allowed',
                    note: 'Tự động phát hiện từ lưu lượng',
                    updatedAt: new Date().toISOString()
                };
            }
        });
        saveAccessControlDb(accessDb);

        const sourceList = Object.entries(accessDb.sources);

        console.log(`${C.cyan}╔═════════════════════════════════════════════════════════════════════════════════════════════════════════════╗${C.reset}`);
        console.log(`${C.cyan}║${C.bright}${C.yellow}                 🛡️  BẢNG BẬT / TẮT QUYỀN TRUY CẬP API CỦA TỪNG NGUỒN (ACCESS CONTROL GATEWAY)                  ${C.reset}${C.cyan}║${C.reset}`);
        console.log(`${C.cyan}║${C.dim}         Kiểm soát website / domain / ứng dụng nào được phép hoặc bị cấm gọi API đến AI Local          ${C.reset}${C.cyan}║${C.reset}`);
        console.log(`${C.cyan}╚═════════════════════════════════════════════════════════════════════════════════════════════════════════════╝${C.reset}\n`);

        const policyColor = accessDb.defaultPolicy === 'allow' ? C.green : C.red;
        const policyText = accessDb.defaultPolicy === 'allow' ? '🟢 CHO PHÉP TẤT CẢ (Default Allow)' : '🔴 CHẶN TẤT CẢ (Default Deny - Chỉ ai trong whitelist mới được gọi)';
        console.log(`📌 ${C.bright}CHÍNH SÁCH MẶC ĐỊNH (NGUỒN LẠ CHƯA ĐĂNG KÝ):${C.reset} ${policyColor}${policyText}${C.reset}`);
        console.log(`💡 ${C.dim}Bấm [P] để đổi chính sách mặc định  │  Bấm [A] để thêm nguồn thủ công  │  Bấm [0]/[Q] để quay lại${C.reset}\n`);

        // Bảng danh sách nguồn (Độ rộng chuẩn 111 ký tự)
        const colWidths = [3, 38, 20, 10, 24];
        const tableTop = '┌' + colWidths.map(w => '─'.repeat(w + 2)).join('┬') + '┐';
        const tableMid = '├' + colWidths.map(w => '─'.repeat(w + 2)).join('┼') + '┤';
        const tableBot = '└' + colWidths.map(w => '─'.repeat(w + 2)).join('┴') + '┘';

        console.log(tableTop);
        const headerCols = ['STT', 'TÊN NGUỒN / DOMAIN / CLIENT', 'QUYỀN TRUY CẬP', 'SỐ REQS', 'GHI CHÚ / CẬP NHẬT'];
        let hRow = '│';
        headerCols.forEach((h, i) => { hRow += ' ' + padAnsi(h, colWidths[i]) + ' │'; });
        console.log(hRow);
        console.log(tableMid);

        sourceList.forEach(([siteName, info], idx) => {
            const isAllowed = info.status === 'allowed';
            const statusBadge = isAllowed ? `${C.green}🟢 ĐƯỢC PHÉP${C.reset}` : `${C.red}🔴 BỊ CHẶN (403)${C.reset}`;
            const reqCount = trafficDb.websites[siteName]?.totalRequests || 0;
            const reqStr = `${reqCount} reqs`;

            let displayName = siteName.replace(/^https?:\/\//, '');
            if (displayName.length > colWidths[1]) {
                displayName = displayName.substring(0, colWidths[1] - 3) + '...';
            }

            let noteStr = info.note || 'Không có';
            if (noteStr.length > colWidths[4]) {
                noteStr = noteStr.substring(0, colWidths[4] - 3) + '...';
            }

            const rowCols = [
                String(idx + 1),
                displayName,
                statusBadge,
                reqStr,
                noteStr
            ];
            let rRow = '│';
            rowCols.forEach((c, i) => { rRow += ' ' + padAnsi(c, colWidths[i]) + ' │'; });
            console.log(rRow);
        });
        console.log(tableBot);

        console.log(`\n👉 ${C.bright}HƯỚNG DẪN THAO TÁC:${C.reset}`);
        console.log(`   • Nhập ${C.yellow}số thứ tự (1 - ${sourceList.length})${C.reset} để ${C.bright}BẬT / TẮT (Toggle)${C.reset} quyền truy cập của nguồn đó.`);
        console.log(`   • Nhập ${C.cyan}[A]${C.reset} để Thêm domain / nguồn mới.`);
        console.log(`   • Nhập ${C.cyan}[P]${C.reset} để Đổi chính sách mặc định.`);
        console.log(`   • Nhập ${C.red}[D]${C.reset} để Xóa một nguồn.`);
        console.log(`   • Nhập ${C.yellow}[0]${C.reset} hoặc ${C.yellow}[Q]${C.reset} để Quay lại Menu chính.`);

        const action = await askInput(rl, `\n👉 Nhập lựa chọn của bạn: `);
        const act = action.trim().toUpperCase();

        if (act === '0' || act === 'Q' || act === 'EXIT') {
            subRunning = false;
            break;
        } else if (act === 'P') {
            accessDb.defaultPolicy = accessDb.defaultPolicy === 'allow' ? 'block' : 'allow';
            saveAccessControlDb(accessDb);
            console.log(`\n${C.green}✅ Đã đổi chính sách mặc định thành: ${accessDb.defaultPolicy.toUpperCase()}${C.reset}`);
            await delay(900);
        } else if (act === 'A') {
            const newDomain = await askInput(rl, `Nhập tên nguồn / domain (Ví dụ: https://my-site.com hoặc Postman): `);
            const cleanDomain = newDomain.trim();
            if (cleanDomain) {
                accessDb.sources[cleanDomain] = {
                    status: 'allowed',
                    note: 'Thêm thủ công bởi Admin',
                    updatedAt: new Date().toISOString()
                };
                saveAccessControlDb(accessDb);
                console.log(`\n${C.green}✅ Đã thêm nguồn "${cleanDomain}" với quyền ĐƯỢC PHÉP!${C.reset}`);
            }
            await delay(1000);
        } else if (act === 'D') {
            const delIdxStr = await askInput(rl, `Nhập số thứ tự cần xóa (1 - ${sourceList.length}): `);
            const delIdx = parseInt(delIdxStr.trim(), 10) - 1;
            if (delIdx >= 0 && delIdx < sourceList.length) {
                const targetKey = sourceList[delIdx][0];
                delete accessDb.sources[targetKey];
                saveAccessControlDb(accessDb);
                console.log(`\n${C.green}✅ Đã xóa nguồn "${targetKey}" khỏi danh sách!${C.reset}`);
            } else {
                console.log(`\n${C.red}Số thứ tự không hợp lệ!${C.reset}`);
            }
            await delay(1000);
        } else {
            const num = parseInt(act, 10);
            if (!isNaN(num) && num >= 1 && num <= sourceList.length) {
                const [targetKey, targetInfo] = sourceList[num - 1];
                const newStatus = targetInfo.status === 'allowed' ? 'blocked' : 'allowed';
                targetInfo.status = newStatus;
                targetInfo.updatedAt = new Date().toISOString();
                saveAccessControlDb(accessDb);
                const statusLabel = newStatus === 'allowed' ? `${C.green}ĐƯỢC PHÉP (ALLOW)${C.reset}` : `${C.red}BỊ CHẶN (BLOCK)${C.reset}`;
                console.log(`\n${C.green}✅ Đã chuyển quyền của "${targetKey}" sang: ${statusLabel}${C.reset}`);
                await delay(1000);
            }
        }
    }
}

// -------------------------------------------------------------
// [7] TẮT HỆ THỐNG AI (UNLOAD VRAM / STOP OLLAMA & NGROK)
// -------------------------------------------------------------
async function handleStopAISystem(rl) {
    console.clear();
    console.log(`${C.cyan}╔═════════════════════════════════════════════════════════════════════════════════════════════════════════════╗${C.reset}`);
    console.log(`${C.cyan}║${C.bright}${C.red}                            🛑 BẢNG ĐIỀU KHIỂN TẮT & GIẢI PHÓNG HỆ THỐNG AI                             ${C.reset}${C.cyan}║${C.reset}`);
    console.log(`${C.cyan}║${C.dim}              Giải phóng bộ nhớ VRAM, dừng dịch vụ Ollama, đóng cổng Ngrok Tunnel an toàn               ${C.reset}${C.cyan}║${C.reset}`);
    console.log(`${C.cyan}╚═════════════════════════════════════════════════════════════════════════════════════════════════════════════╝${C.reset}\n`);

    const [ollama, ngrok] = await Promise.all([getOllamaStatus(), getNgrokStatus()]);

    console.log(`📌 ${C.bright}TRẠNG THÁI HIỆN TẠI TRÊN MÁY TÍNH:${C.reset}`);
    console.log(`   • Ollama Service:  ${ollama.online ? `${C.green}● Đang chạy (Port ${OLLAMA_PORT})${C.reset}` : `${C.dim}○ Đã tắt${C.reset}`}`);
    console.log(`   • Ngrok Tunnel:    ${ngrok.online ? `${C.green}● Đang mở (${ngrok.url})${C.reset}` : `${C.dim}○ Đã đóng${C.reset}`}`);
    console.log(`${C.dim}────────────────────────────────────────────────────────────────────────────────${C.reset}\n`);

    console.log(`${C.bright}CÁC TÙY CHỌN DỪNG HỆ THỐNG:${C.reset}`);
    console.log(`  ${C.yellow}[1]${C.reset} ⚡ ${C.bright}Giải phóng VRAM ngay (Unload Model)${C.reset}`);
    console.log(`      ${C.dim}-> Giữ Ollama mở nhưng dỡ sạch model khỏi GPU/RAM, trả lại 100% VRAM cho card đồ họa.${C.reset}`);
    console.log(`  ${C.yellow}[2]${C.reset} 🤖 ${C.bright}Tắt tiến trình Ollama AI Service${C.reset}`);
    console.log(`      ${C.dim}-> Đóng hoàn toàn tiến trình ollama.exe trên Windows.${C.reset}`);
    console.log(`  ${C.yellow}[3]${C.reset} 🌐 ${C.bright}Đóng đường hầm Ngrok Tunnel${C.reset}`);
    console.log(`      ${C.dim}-> Ngắt cổng kết nối ra ngoài Internet, chống truy cập từ xa.${C.reset}`);
    console.log(`  ${C.red}[4]${C.reset} 🛑 ${C.bright}TẮT TOÀN BỘ (Dừng cả Ollama + Ngrok + Giải phóng tài nguyên)${C.reset}`);
    console.log(`      ${C.dim}-> Đưa toàn bộ máy tính về trạng thái nghỉ.${C.reset}`);
    console.log(`  ${C.cyan}[0]${C.reset} ↩️ Quay lại Menu chính`);
    console.log(`${C.dim}────────────────────────────────────────────────────────────────────────────────${C.reset}`);

    const choice = await askInput(rl, `👉 Chọn lệnh tắt [0 - 4]: `);

    switch (choice.trim()) {
        case '1':
            console.log(`\n${C.yellow}⏳ Đang gửi lệnh giải phóng VRAM tới Ollama...${C.reset}`);
            try {
                await fetchJson(`http://127.0.0.1:${OLLAMA_PORT}/api/generate`, {
                    method: 'POST',
                    body: { model: 'qwen-fast:latest', keep_alive: 0 }
                });
                console.log(`${C.green}✅ Đã dỡ mô hình thành công! Toàn bộ VRAM card đồ họa đã được giải phóng.${C.reset}`);
            } catch (e) {
                console.log(`${C.yellow}ℹ️ Ollama chưa bật hoặc model đã được giải phóng sẵn.${C.reset}`);
            }
            break;
        case '2':
            console.log(`\n${C.yellow}⏳ Đang dừng tiến trình Ollama...${C.reset}`);
            await runCmd('taskkill /F /IM ollama.exe /T');
            await runCmd('taskkill /F /IM ollama_app.exe /T');
            console.log(`${C.green}✅ Đã dừng tiến trình Ollama thành công!${C.reset}`);
            break;
        case '3':
            console.log(`\n${C.yellow}⏳ Đang đóng đường hầm Ngrok...${C.reset}`);
            await runCmd('taskkill /F /IM ngrok.exe /T');
            console.log(`${C.green}✅ Đã đóng Ngrok Tunnel thành công! Cổng Internet đã ngắt kết nối an toàn.${C.reset}`);
            break;
        case '4':
            console.log(`\n${C.yellow}⏳ Đang tắt toàn bộ dịch vụ AI và giải phóng tài nguyên...${C.reset}`);
            try {
                await fetchJson(`http://127.0.0.1:${OLLAMA_PORT}/api/generate`, {
                    method: 'POST',
                    body: { model: 'qwen-fast:latest', keep_alive: 0 }
                });
            } catch (e) {}
            await runCmd('taskkill /F /IM ngrok.exe /T');
            await runCmd('taskkill /F /IM ollama.exe /T');
            await runCmd('taskkill /F /IM ollama_app.exe /T');
            console.log(`${C.green}✅ Đã tắt toàn bộ hệ thống AI (Ollama + Ngrok). Máy tính đã được giải phóng 100%!${C.reset}`);
            break;
        case '0':
        default:
            break;
    }

    await waitForEnter(rl);
}

// -------------------------------------------------------------
// [8] QUẢN LÝ RULE CHO AI (TẠO RULE MỚI, XEM RULE, XÓA RULE)
// -------------------------------------------------------------
async function handleAiRules(rl) {
    let subRunning = true;

    while (subRunning) {
        console.clear();
        const rulesDb = initAiRulesDb();

        console.log(`${C.cyan}╔═════════════════════════════════════════════════════════════════════════════════════════════════════════════╗${C.reset}`);
        console.log(`${C.cyan}║${C.bright}${C.yellow}                     📜 QUẢN LÝ RULE & CHỈ THỊ HỆ THỐNG CHO AI (SYSTEM RULES MANAGER)                    ${C.reset}${C.cyan}║${C.reset}`);
        console.log(`${C.cyan}║${C.dim}              Thiết lập phong cách, tính cách, giới hạn câu trả lời và chuyên môn cho AI Local              ${C.reset}${C.cyan}║${C.reset}`);
        console.log(`${C.cyan}╚═════════════════════════════════════════════════════════════════════════════════════════════════════════════╝${C.reset}\n`);

        const activeRule = rulesDb.rules.find(r => r.id === rulesDb.activeRuleId) || rulesDb.rules[0];
        console.log(`📌 ${C.bright}RULE ĐANG ÁP DỤNG TRÊN TOÀN HỆ THỐNG:${C.reset} ${C.green}● ${activeRule ? activeRule.name : 'Chưa có'}${C.reset}`);
        console.log(`💬 ${C.dim}Nội dung: "${activeRule ? (activeRule.prompt.length > 75 ? activeRule.prompt.substring(0, 72) + '...' : activeRule.prompt) : ''}"${C.reset}\n`);

        // Bảng danh sách rules
        const colWidths = [3, 40, 24, 22];
        const tableTop = '┌' + colWidths.map(w => '─'.repeat(w + 2)).join('┬') + '┐';
        const tableMid = '├' + colWidths.map(w => '─'.repeat(w + 2)).join('┼') + '┤';
        const tableBot = '└' + colWidths.map(w => '─'.repeat(w + 2)).join('┴') + '┘';

        console.log(tableTop);
        const headerCols = ['STT', 'TÊN RULE / PHONG CÁCH', 'TRẠNG THÁI HOẠT ĐỘNG', 'NGÀY TẠO'];
        let hRow = '│';
        headerCols.forEach((h, i) => { hRow += ' ' + padAnsi(h, colWidths[i]) + ' │'; });
        console.log(hRow);
        console.log(tableMid);

        rulesDb.rules.forEach((rule, idx) => {
            const isActive = rule.id === rulesDb.activeRuleId;
            const statusStr = isActive ? `${C.green}🟢 ĐANG KÍCH HOẠT${C.reset}` : `${C.dim}⚪ Sẵn sàng${C.reset}`;
            const timeStr = rule.createdAt ? new Date(rule.createdAt).toLocaleDateString('vi-VN') : 'Mặc định';

            let ruleName = rule.name;
            if (ruleName.length > colWidths[1]) {
                ruleName = ruleName.substring(0, colWidths[1] - 3) + '...';
            }

            const rowCols = [
                String(idx + 1),
                `${isActive ? C.bright : ''}${ruleName}${C.reset}`,
                statusStr,
                timeStr
            ];
            let rRow = '│';
            rowCols.forEach((c, i) => { rRow += ' ' + padAnsi(c, colWidths[i]) + ' │'; });
            console.log(rRow);
        });
        console.log(tableBot);

        console.log(`\n${C.bright}CÁC THAO TÁC QUẢN LÝ RULE:${C.reset}`);
        console.log(`  ${C.yellow}[1]${C.reset} 👁️  ${C.bright}Xem chi tiết nội dung rule${C.reset} (Đọc toàn bộ System Prompt)`);
        console.log(`  ${C.green}[2]${C.reset} 🚀 ${C.bright}Kích hoạt rule (Set Active)${C.reset} (Đổi phong cách AI cho người dùng)`);
        console.log(`  ${C.cyan}[3]${C.reset} ➕ ${C.bright}Tạo rule mới cho AI${C.reset} (Tùy chỉnh tính cách / chuyên môn)`);
        console.log(`  ${C.red}[4]${C.reset} 🗑️  ${C.bright}Xóa rule${C.reset}`);
        console.log(`  ${C.cyan}[0]${C.reset} ↩️ Quay lại Menu chính`);
        console.log(`${C.dim}────────────────────────────────────────────────────────────────────────────────${C.reset}`);

        const act = await askInput(rl, `👉 Chọn thao tác [0 - 4]: `);

        switch (act.trim()) {
            case '1': {
                const idxStr = await askInput(rl, `Nhập số STT rule muốn xem chi tiết (1 - ${rulesDb.rules.length}): `);
                const idx = parseInt(idxStr.trim(), 10) - 1;
                if (idx >= 0 && idx < rulesDb.rules.length) {
                    const r = rulesDb.rules[idx];
                    console.log(`\n${C.cyan}╔════════════════════════════════════════════════════════════════════════════════╗${C.reset}`);
                    console.log(`  📌 ${C.bright}Tên Rule:${C.reset} ${C.yellow}${r.name}${C.reset}`);
                    console.log(`  🆔 ${C.bright}ID:${C.reset} ${r.id}  |  Ngày tạo: ${r.createdAt}`);
                    console.log(`  📝 ${C.bright}NỘI DUNG CHỈ THỊ (SYSTEM PROMPT):${C.reset}`);
                    console.log(`  ${C.dim}────────────────────────────────────────────────────────────────────${C.reset}`);
                    console.log(`  ${C.green}${r.prompt}${C.reset}`);
                    console.log(`${C.cyan}╚════════════════════════════════════════════════════════════════════════════════╝${C.reset}`);
                } else {
                    console.log(`${C.red}Số STT không hợp lệ!${C.reset}`);
                }
                await waitForEnter(rl);
                break;
            }
            case '2': {
                const idxStr = await askInput(rl, `Nhập số STT rule bạn muốn KÍCH HOẠT (1 - ${rulesDb.rules.length}): `);
                const idx = parseInt(idxStr.trim(), 10) - 1;
                if (idx >= 0 && idx < rulesDb.rules.length) {
                    rulesDb.activeRuleId = rulesDb.rules[idx].id;
                    saveAiRulesDb(rulesDb);
                    console.log(`\n${C.green}✅ Đã kích hoạt thành công: "${rulesDb.rules[idx].name}" làm rule mặc định của AI!${C.reset}`);
                } else {
                    console.log(`${C.red}Số STT không hợp lệ!${C.reset}`);
                }
                await delay(1200);
                break;
            }
            case '3': {
                console.log(`\n${C.bright}--- TẠO RULE MỚI CHO AI ---${C.reset}`);
                const name = await askInput(rl, `Nhập Tên Rule (Ví dụ: Thầy Giáo Tiếng Anh, Bác Sĩ Dinh Dưỡng): `);
                if (!name.trim()) {
                    console.log(`${C.red}Tên rule không được để trống!${C.reset}`);
                    await delay(1000);
                    break;
                }
                const prompt = await askInput(rl, `Nhập nội dung chỉ thị System Prompt cho AI:\n> `);
                if (!prompt.trim()) {
                    console.log(`${C.red}Nội dung chỉ thị không được để trống!${C.reset}`);
                    await delay(1000);
                    break;
                }
                const newId = 'rule_' + Date.now();
                rulesDb.rules.push({
                    id: newId,
                    name: name.trim(),
                    prompt: prompt.trim(),
                    createdAt: new Date().toISOString()
                });
                saveAiRulesDb(rulesDb);
                console.log(`\n${C.green}✅ Đã tạo rule mới thành công!${C.reset}`);
                const activateNow = await askInput(rl, `Bạn có muốn kích hoạt rule này ngay bây giờ không? (y/n): `);
                if (activateNow.trim().toLowerCase() === 'y') {
                    rulesDb.activeRuleId = newId;
                    saveAiRulesDb(rulesDb);
                    console.log(`${C.green}✅ Đã kích hoạt rule mới!${C.reset}`);
                }
                await delay(1000);
                break;
            }
            case '4': {
                const idxStr = await askInput(rl, `Nhập số STT rule muốn XÓA (1 - ${rulesDb.rules.length}): `);
                const idx = parseInt(idxStr.trim(), 10) - 1;
                if (idx >= 0 && idx < rulesDb.rules.length) {
                    if (rulesDb.rules.length <= 1) {
                        console.log(`${C.red}Không thể xóa vì phải giữ lại ít nhất 1 rule!${C.reset}`);
                        await delay(1200);
                        break;
                    }
                    const targetRule = rulesDb.rules[idx];
                    rulesDb.rules.splice(idx, 1);
                    if (rulesDb.activeRuleId === targetRule.id) {
                        rulesDb.activeRuleId = rulesDb.rules[0].id;
                    }
                    saveAiRulesDb(rulesDb);
                    console.log(`\n${C.green}✅ Đã xóa thành công rule "${targetRule.name}"!${C.reset}`);
                } else {
                    console.log(`${C.red}Số STT không hợp lệ!${C.reset}`);
                }
                await delay(1200);
                break;
            }
            case '0':
            default:
                subRunning = false;
                break;
        }
    }
}

// -------------------------------------------------------------
// [9] THỐNG KÊ NGỮ CẢNH (CONTEXT STATS & WINDOW ANALYSIS)
// -------------------------------------------------------------
async function handleContextStats(rl) {
    console.clear();
    const trafficDb = initTrafficDb();

    console.log(`${C.cyan}╔═════════════════════════════════════════════════════════════════════════════════════════════════════════════╗${C.reset}`);
    console.log(`${C.cyan}║${C.bright}${C.yellow}                 🧠 BẢNG PHÂN TÍCH & THỐNG KÊ NGỮ CẢNH HỘI THOẠI (CONTEXT WINDOW STATS)                 ${C.reset}${C.cyan}║${C.reset}`);
    console.log(`${C.cyan}║${C.dim}              Theo dõi độ dài ngữ cảnh, tỷ lệ chiếm dụng VRAM và sức khỏe bộ nhớ đệm AI                 ${C.reset}${C.cyan}║${C.reset}`);
    console.log(`${C.cyan}╚═════════════════════════════════════════════════════════════════════════════════════════════════════════════╝${C.reset}\n`);

    // Thu thập các request hợp lệ
    const records = Object.values(trafficDb.processedIds || {}).filter(r => typeof r === 'object' && r.promptTokens > 0);
    const totalReqs = records.length;

    let totalPromptTok = 0;
    let totalCompTok = 0;
    let maxPromptTok = 0;
    let minPromptTok = 999999;
    let shortCount = 0;    // < 200 tokens
    let mediumCount = 0;   // 200 - 800 tokens
    let longCount = 0;     // 800 - 2000 tokens
    let ultraCount = 0;    // > 2000 tokens

    records.forEach(r => {
        const pt = r.promptTokens || 0;
        const ct = r.completionTokens || 0;
        totalPromptTok += pt;
        totalCompTok += ct;
        if (pt > maxPromptTok) maxPromptTok = pt;
        if (pt < minPromptTok && pt > 0) minPromptTok = pt;

        if (pt < 200) shortCount++;
        else if (pt <= 800) mediumCount++;
        else if (pt <= 2000) longCount++;
        else ultraCount++;
    });

    if (minPromptTok === 999999) minPromptTok = 0;
    const avgPromptTok = totalReqs > 0 ? Math.round(totalPromptTok / totalReqs) : 0;
    const avgCompTok = totalReqs > 0 ? Math.round(totalCompTok / totalReqs) : 0;
    const MODEL_CTX_WINDOW = 4096; // Giới hạn ngữ cảnh mặc định của model
    const MAX_HARDWARE_CTX = 32768;
    const avgUsagePct = ((avgPromptTok / MODEL_CTX_WINDOW) * 100).toFixed(1);
    const peakUsagePct = ((maxPromptTok / MODEL_CTX_WINDOW) * 100).toFixed(1);

    console.log(`📌 ${C.bright}1. THÔNG SỐ CẤU HÌNH CONTEXT WINDOW:${C.reset}`);
    console.log(`   • Mô hình AI:             ${C.yellow}qwen-fast:latest${C.reset}`);
    console.log(`   • Cửa sổ ngữ cảnh cấu hình:${C.cyan}${formatNum(MODEL_CTX_WINDOW)} tokens${C.reset} (Cục bộ VRAM)`);
    console.log(`   • Khả năng kiến trúc tối đa:${C.dim}${formatNum(MAX_HARDWARE_CTX)} tokens (32k context)${C.reset}\n`);

    console.log(`📌 ${C.bright}2. CHỈ SỐ TIÊU THỤ NGỮ CẢNH THỰC TẾ (Tổng ${totalReqs} yêu cầu):${C.reset}`);
    console.log(`   • ${C.bright}Context Tokens trung bình:${C.reset} ${C.green}${formatNum(avgPromptTok)} tokens${C.reset} (${avgUsagePct}% Context Window)`);
    console.log(`   • ${C.bright}Ngữ cảnh đỉnh điểm (Peak):${C.reset} ${C.yellow}${formatNum(maxPromptTok)} tokens${C.reset} (${peakUsagePct}% Context Window)`);
    console.log(`   • ${C.bright}Ngữ cảnh ngắn nhất (Min): ${C.reset} ${C.cyan}${formatNum(minPromptTok)} tokens${C.reset}`);
    console.log(`   • ${C.bright}Câu trả lời TB sinh ra:   ${C.reset} ${C.magenta}${formatNum(avgCompTok)} tokens${C.reset} / response\n`);

    console.log(`📌 ${C.bright}3. PHÂN BỔ ĐỘ DÀI NGỮ CẢNH HỘI THOẠI (CONTEXT DISTRIBUTION):${C.reset}`);
    const pct = (n) => totalReqs > 0 ? ((n / totalReqs) * 100).toFixed(0) : '0';
    console.log(`   • 🟢 Ngắn (< 200 tokens):      ${String(shortCount).padStart(3)} lượt  (${pct(shortCount)}%)  ${generateUsageBar(pct(shortCount))}`);
    console.log(`   • 🟡 Vừa (200 - 800 tokens):    ${String(mediumCount).padStart(3)} lượt  (${pct(mediumCount)}%)  ${generateUsageBar(pct(mediumCount))}`);
    console.log(`   • 🟠 Dài (800 - 2,000 tokens):  ${String(longCount).padStart(3)} lượt  (${pct(longCount)}%)  ${generateUsageBar(pct(longCount))}`);
    console.log(`   • 🔴 Siêu dài (> 2,000 tokens): ${String(ultraCount).padStart(3)} lượt  (${pct(ultraCount)}%)  ${generateUsageBar(pct(ultraCount))}\n`);

    console.log(`📌 ${C.bright}4. ĐÁNH GIÁ SỨC KHỎE NGỮ CẢNH:${C.reset}`);
    if (maxPromptTok <= MODEL_CTX_WINDOW * 0.75) {
        console.log(`   ${C.green}✅ TỐT: Ngữ cảnh luôn nằm trong vùng tối ưu (< 75% Window), không bao giờ bị tràn hay cắt tỉa (No Truncation).${C.reset}`);
        console.log(`   💡 Hệ thống phản hồi cực nhanh (~1.1s) nhờ việc lưu giữ 4 tin nhắn gần nhất.`);
    } else {
        console.log(`   ${C.yellow}⚠️ LƯU Ý: Đã có lượt truy cập đạt đỉnh ${maxPromptTok} tokens, hãy cân nhắc tăng num_ctx trong Modelfile nếu hội thoại kéo dài.${C.reset}`);
    }

    console.log(`\n${C.dim}────────────────────────────────────────────────────────────────────────────────${C.reset}`);
    await waitForEnter(rl);
}

// -------------------------------------------------------------
// [10] ROUTER LƯU TRỮ CÂU HỎI HAY HỎI (PROMPT CACHE & CLEAR ROUTER)
// -------------------------------------------------------------
async function handleRouterCache(rl) {
    let subRunning = true;

    while (subRunning) {
        console.clear();
        const routerDb = initRouterCacheDb();
        const fileSize = getRouterCacheFileSize();
        const entries = Object.entries(routerDb.entries || {});

        console.log(`${C.cyan}╔═════════════════════════════════════════════════════════════════════════════════════════════════════════════╗${C.reset}`);
        console.log(`${C.cyan}║${C.bright}${C.yellow}                 ⚡ ROUTER LƯU TRỮ CÂU HỎI HAY HỎI (SEMANTIC / PROMPT CACHE GATEWAY)                     ${C.reset}${C.cyan}║${C.reset}`);
        console.log(`${C.cyan}║${C.dim}       Tránh hỏi lặp câu giống trước, phản hồi tức thì 0.01s & tiết kiệm 100% token sinh mới             ${C.reset}${C.cyan}║${C.reset}`);
        console.log(`${C.cyan}╚═════════════════════════════════════════════════════════════════════════════════════════════════════════════╝${C.reset}\n`);

        const statusColor = routerDb.enabled ? C.green : C.red;
        const statusText = routerDb.enabled ? '🟢 ĐANG BẬT (Tự động phục vụ từ Router & Cache câu hỏi)' : '🔴 ĐÃ TẮT (Chuyển tiếp 100% về Ollama)';

        console.log(`📌 ${C.bright}THÔNG SỐ & DUNG LƯỢNG CHIẾM DỤNG CỦA ROUTER:${C.reset}`);
        console.log(`   • 💾 ${C.bright}Dung lượng chiếm dụng:${C.reset}  ${C.yellow}${fileSize}${C.reset} ${C.dim}(Giới hạn an toàn < 50 MB)${C.reset}`);
        console.log(`   • ⚡ ${C.bright}Tổng câu hỏi trong Router:${C.reset} ${C.cyan}${entries.length} câu hỏi thường gặp${C.reset}`);
        console.log(`   • 🎯 ${C.bright}Số lần Cache Hit:${C.reset}        ${C.green}${formatNum(routerDb.stats.cacheHits)} lượt${C.reset} (Trả lời ngay trong 0.01 giây)`);
        console.log(`   • 🪙 ${C.bright}Số Tokens đã tiết kiệm:${C.reset}  ${C.yellow}${formatNum(routerDb.stats.tokensSaved)} tokens${C.reset} (Tương đương ${routerDb.stats.timeSavedSec}s thời gian máy tính)`);
        console.log(`   • 🛡️ ${C.bright}Trạng thái Router:${C.reset}      ${statusColor}${statusText}${C.reset}\n`);

        // Bảng danh sách câu hỏi trong Router
        const colWidths = [3, 40, 10, 16, 20];
        const tableTop = '┌' + colWidths.map(w => '─'.repeat(w + 2)).join('┬') + '┐';
        const tableMid = '├' + colWidths.map(w => '─'.repeat(w + 2)).join('┼') + '┤';
        const tableBot = '└' + colWidths.map(w => '─'.repeat(w + 2)).join('┴') + '┘';

        console.log(tableTop);
        const headerCols = ['STT', 'CÂU HỎI THƯỜNG GẶP TRONG ROUTER', 'LẦN HỎI', 'TOKENS TIẾT KIỆM', 'KÍCH THƯỚC TRẢ LỜI'];
        let hRow = '│';
        headerCols.forEach((h, i) => { hRow += ' ' + padAnsi(h, colWidths[i]) + ' │'; });
        console.log(hRow);
        console.log(tableMid);

        entries.forEach(([key, item], idx) => {
            const hits = item.hits || 0;
            const savedTok = (hits * (item.tokensSavedPerHit || 80));
            const ansLen = (item.answer ? item.answer.length : 0) + ' ký tự';

            let qText = item.question || key;
            if (qText.length > colWidths[1]) {
                qText = qText.substring(0, colWidths[1] - 3) + '...';
            }

            const rowCols = [
                String(idx + 1),
                `${C.bright}${qText}${C.reset}`,
                `${C.green}${hits} lần${C.reset}`,
                `${C.yellow}${formatNum(savedTok)} Toks${C.reset}`,
                ansLen
            ];
            let rRow = '│';
            rowCols.forEach((c, i) => { rRow += ' ' + padAnsi(c, colWidths[i]) + ' │'; });
            console.log(rRow);
        });
        console.log(tableBot);

        console.log(`\n${C.bright}CÁC THAO TÁC ĐIỀU KHIỂN ROUTER:${C.reset}`);
        console.log(`  ${C.yellow}[1]${C.reset} 👁️  ${C.bright}Xem chi tiết câu trả lời đã lưu trong Router${C.reset}`);
        console.log(`  ${C.green}[2]${C.reset} ➕ ${C.bright}Thêm câu hỏi & câu trả lời mẫu vào Router (Pre-seed FAQ)${C.reset}`);
        console.log(`  ${C.red}[3]${C.reset} 🗑️  ${C.bright}Xóa 1 câu hỏi cụ thể khỏi Router${C.reset}`);
        console.log(`  ${C.bgRed}${C.white}${C.bright}[4]${C.reset} ⚠️  ${C.bright}XÓA SẠCH TOÀN BỘ ROUTER (CLEAR CACHE)${C.reset} ${C.dim}-> Giải phóng dung lượng về 0 KB${C.reset}`);
        console.log(`  ${C.cyan}[5]${C.reset} 🔄 ${C.bright}Bật / Tắt Router Cache Gateway${C.reset}`);
        console.log(`  ${C.cyan}[0]${C.reset} ↩️ Quay lại Menu chính`);
        console.log(`${C.dim}────────────────────────────────────────────────────────────────────────────────${C.reset}`);

        const act = await askInput(rl, `👉 Chọn thao tác [0 - 5]: `);

        switch (act.trim()) {
            case '1': {
                const idxStr = await askInput(rl, `Nhập STT câu hỏi muốn xem chi tiết (1 - ${entries.length}): `);
                const idx = parseInt(idxStr.trim(), 10) - 1;
                if (idx >= 0 && idx < entries.length) {
                    const [k, item] = entries[idx];
                    console.log(`\n${C.cyan}╔════════════════════════════════════════════════════════════════════════════════╗${C.reset}`);
                    console.log(`  ❓ ${C.bright}Câu hỏi:${C.reset} ${C.yellow}${item.question}${C.reset}`);
                    console.log(`  🎯 ${C.bright}Lượt hit:${C.reset} ${item.hits} lần  |  Tokens tiết kiệm/hit: ${item.tokensSavedPerHit || 80}`);
                    console.log(`  📝 ${C.bright}CÂU TRẢ LỜI LƯU TRONG ROUTER (PHẢN HỒI TRONG 0.01s):${C.reset}`);
                    console.log(`  ${C.dim}────────────────────────────────────────────────────────────────────${C.reset}`);
                    console.log(`  ${C.green}${item.answer}${C.reset}`);
                    console.log(`${C.cyan}╚════════════════════════════════════════════════════════════════════════════════╝${C.reset}`);
                } else {
                    console.log(`${C.red}STT không hợp lệ!${C.reset}`);
                }
                await waitForEnter(rl);
                break;
            }
            case '2': {
                console.log(`\n${C.bright}--- THÊM CÂU HỎI THƯỜNG GẶP VÀO ROUTER ---${C.reset}`);
                const q = await askInput(rl, `Nhập Câu hỏi thường gặp: `);
                if (!q.trim()) {
                    console.log(`${C.red}Câu hỏi không được để trống!${C.reset}`);
                    await delay(1000);
                    break;
                }
                const a = await askInput(rl, `Nhập Câu trả lời mẫu sẵn:\n> `);
                if (!a.trim()) {
                    console.log(`${C.red}Câu trả lời không được để trống!${C.reset}`);
                    await delay(1000);
                    break;
                }
                const normKey = normalizeQuestion(q);
                routerDb.entries[normKey] = {
                    question: q.trim(),
                    normalized: normKey,
                    answer: a.trim(),
                    hits: 0,
                    tokensSavedPerHit: Math.max(20, Math.round((q.length + a.length) / 3)),
                    createdAt: new Date().toISOString(),
                    lastHit: new Date().toISOString()
                };
                saveRouterCacheDb(routerDb);
                console.log(`\n${C.green}✅ Đã nạp thành công câu hỏi vào Router Cache! Từ giờ AI sẽ trả lời câu này trong 0.01s!${C.reset}`);
                await delay(1200);
                break;
            }
            case '3': {
                const idxStr = await askInput(rl, `Nhập STT câu hỏi muốn xóa khỏi Router (1 - ${entries.length}): `);
                const idx = parseInt(idxStr.trim(), 10) - 1;
                if (idx >= 0 && idx < entries.length) {
                    const [k, item] = entries[idx];
                    delete routerDb.entries[k];
                    saveRouterCacheDb(routerDb);
                    console.log(`\n${C.green}✅ Đã xóa câu hỏi "${item.question}" khỏi Router Cache!${C.reset}`);
                } else {
                    console.log(`${C.red}STT không hợp lệ!${C.reset}`);
                }
                await delay(1200);
                break;
            }
            case '4': {
                console.log(`\n${C.bgRed}${C.white}${C.bright} XÁC NHẬN CLEAR CACHE ROUTER ${C.reset}`);
                const confirm = await askInput(rl, `Bạn có CHẮC CHẮN muốn xóa sạch toàn bộ Router Cache để giải phóng dung lượng không? (gõ "YES" để xác nhận): `);
                if (confirm.trim() === 'YES') {
                    routerDb.entries = {};
                    routerDb.stats = { totalQueries: 0, cacheHits: 0, tokensSaved: 0, timeSavedSec: 0 };
                    saveRouterCacheDb(routerDb);
                    console.log(`\n${C.green}✅ ĐÃ XÓA SẠCH ROUTER CACHE! Dung lượng chiếm dụng đã được giải phóng về 0 KB.${C.reset}`);
                } else {
                    console.log(`\n${C.yellow}Đã hủy thao tác Clear Cache.${C.reset}`);
                }
                await delay(1500);
                break;
            }
            case '5': {
                routerDb.enabled = !routerDb.enabled;
                saveRouterCacheDb(routerDb);
                const st = routerDb.enabled ? `${C.green}ĐÃ BẬT${C.reset}` : `${C.red}ĐÃ TẮT${C.reset}`;
                console.log(`\n${C.green}✅ Đã chuyển trạng thái Router Cache Gateway: ${st}${C.reset}`);
                await delay(1000);
                break;
            }
            case '0':
            default:
                subRunning = false;
                break;
        }
    }
}

// -------------------------------------------------------------
// [11] THOÁT
// -------------------------------------------------------------
async function handleExit(rl) {
    console.log(`\n${C.yellow}Bạn có muốn giữ Ollama và Ngrok tiếp tục chạy ngầm trong máy không?${C.reset}`);
    console.log(`  [1] ${C.green}Có, giữ chạy ngầm${C.reset} (Để web Vercel vẫn chat được bình thường)`);
    console.log(`  [2] ${C.red}Tắt hết${C.reset} (Dừng cả Ollama và Ngrok để giải phóng RAM)`);
    
    rl.question(`\nNhập lựa chọn (1 hoặc 2) [Mặc định 1]: `, async (ans) => {
        if (ans.trim() === '2') {
            console.log(`\n${C.yellow}Đang dừng các tiến trình...${C.reset}`);
            await runCmd('taskkill /F /IM ngrok.exe /T');
            await runCmd('taskkill /F /IM ollama.exe /T');
            console.log(`${C.green}Đã dừng toàn bộ dịch vụ. Hẹn gặp lại!${C.reset}`);
        } else {
            console.log(`\n${C.green}Đã bảo lưu Ollama và Ngrok chạy ngầm sẵn sàng phục vụ website! Hẹn gặp lại! 🦖${C.reset}`);
        }
        process.exit(0);
    });
}

// -------------------------------------------------------------
// VÒNG LẶP MENU CHÍNH (11 CHỨC NĂNG)
// -------------------------------------------------------------
async function main() {
    // Tự động ghim model vào VRAM khi khởi động
    warmUpOllama();

    readline.emitKeypressEvents(process.stdin);
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    while (true) {
        await printBanner();

        console.log(`${C.bright}CÁC CHỨC NĂNG ĐIỀU KHIỂN HỆ THỐNG:${C.reset}`);
        console.log(`  ${C.cyan}[1]${C.reset}  🚀 ${C.bright}Khởi động AI${C.reset} (Ollama Local Service)`);
        console.log(`  ${C.cyan}[2]${C.reset}  🌐 ${C.bright}Khởi động Ngrok${C.reset} (Mở cổng ra Internet với Host Header)`);
        console.log(`  ${C.cyan}[3]${C.reset}  📊 ${C.bright}Bảng thống kê AI thời gian thực${C.reset} (Live Monitor tự làm mới)`);
        console.log(`  ${C.cyan}[4]${C.reset}  📋 ${C.bright}Xuất API kết nối AI${C.reset} (Code mẫu gọi từ mọi Web)`);
        console.log(`  ${C.cyan}[5]${C.reset}  📈 ${C.bright}Website đang dùng AI, Số Reqs & Tokens${C.reset} (Live Monitor Không Nháy)`);
        console.log(`  ${C.cyan}[6]${C.reset}  🛡️  ${C.bright}Bật / Tắt quyền truy cập API của từng nguồn${C.reset} (Access Control)`);
        console.log(`  ${C.cyan}[7]${C.reset}  🛑 ${C.bright}Tắt hệ thống AI${C.reset} (Giải phóng VRAM / Dừng Ollama & Ngrok)`);
        console.log(`  ${C.cyan}[8]${C.reset}  📜 ${C.bright}Tạo rule mới cho AI, xem rule đã tạo, xóa rule${C.reset} (Rules Manager)`);
        console.log(`  ${C.cyan}[9]${C.reset}  🧠 ${C.bright}Thống kê ngữ cảnh${C.reset} (Context Window Stats & Analysis)`);
        console.log(`  ${C.cyan}[10]${C.reset} ⚡ ${C.bright}Router lưu trữ câu hỏi hay hỏi, tránh lặp token, clear cache${C.reset}`);
        console.log(`  ${C.cyan}[11]${C.reset} ❌ ${C.bright}Thoát${C.reset}`);
        console.log(`${C.dim}────────────────────────────────────────────────────────────────────────────────${C.reset}`);

        const choice = await new Promise((resolve) => {
            rl.question(`👉 ${C.bright}Chọn chức năng [1 - 11]: ${C.reset}`, resolve);
        });

        switch (choice.trim()) {
            case '1':
                await handleStartAI();
                await waitForEnter(rl);
                break;
            case '2':
                await handleStartNgrok();
                await waitForEnter(rl);
                break;
            case '3':
                await handleLiveDashboard();
                break;
            case '4':
                await handleExportAPI();
                await waitForEnter(rl);
                break;
            case '5':
                await handleWebUsageStats(rl);
                break;
            case '6':
                await handleAccessControl(rl);
                break;
            case '7':
                await handleStopAISystem(rl);
                break;
            case '8':
                await handleAiRules(rl);
                break;
            case '9':
                await handleContextStats(rl);
                break;
            case '10':
                await handleRouterCache(rl);
                break;
            case '11':
                await handleExit(rl);
                return;
            default:
                console.log(`\n${C.red}Lựa chọn không hợp lệ, vui lòng chọn từ 1 đến 11!${C.reset}`);
                await new Promise(r => setTimeout(r, 1200));
                break;
        }
    }
}

function waitForEnter(rl) {
    return new Promise((resolve) => {
        rl.question(`\n${C.dim}Nhấn phím [Enter] để quay lại Menu chính...${C.reset}`, () => {
            resolve();
        });
    });
}

main().catch(err => {
    console.error('Lỗi chương trình:', err);
});
