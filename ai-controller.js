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
                    db.processedIds[reqId] = r.start;

                    const siteName = extractWebsiteIdentity(r);
                    const isSuccess = r.response.status_code === 200;
                    const durationSec = r.duration ? r.duration / 1000000000 : 0;
                    const endpoint = r.request?.uri || '/api/chat';
                    const tokens = extractTokensFromResponse(r);

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

    // Định nghĩa độ rộng cột chuẩn xác (Tổng chiều rộng: 101 ký tự)
    const colWidths = [3, 21, 14, 6, 14, 5, 5, 8];

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

        out += `${C.cyan}╔═══════════════════════════════════════════════════════════════════════════════════════════════════════════╗${C.reset}\x1b[K\n`;
        out += `${C.cyan}║${C.bright}${C.yellow}                 🦖 T-REX AI - REAL-TIME WEB USAGE & TOKEN MONITOR (TỰ ĐỘNG CẬP NHẬT 1.0s)                 ${C.reset}${C.cyan}║${C.reset}\x1b[K\n`;
        out += `${C.cyan}║${C.dim}                                Bấm [Q] hoặc [ESC] hoặc [Enter] để quay lại Menu                            ${C.reset}${C.cyan}║${C.reset}\x1b[K\n`;
        out += `${C.cyan}╚═══════════════════════════════════════════════════════════════════════════════════════════════════════════╝${C.reset}\x1b[K\n`;

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

// -------------------------------------------------------------
// [6] THOÁT
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
// VÒNG LẶP MENU CHÍNH
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

        console.log(`${C.bright}CÁC CHỨC NĂNG ĐIỀU KHIỂN:${C.reset}`);
        console.log(`  ${C.cyan}[1]${C.reset} 🚀 ${C.bright}Khởi động AI${C.reset} (Ollama Local Service)`);
        console.log(`  ${C.cyan}[2]${C.reset} 🌐 ${C.bright}Khởi động Ngrok${C.reset} (Mở cổng ra Internet với Host Header)`);
        console.log(`  ${C.cyan}[3]${C.reset} 📊 ${C.bright}Bảng thống kê AI thời gian thực${C.reset} (Live Monitor tự làm mới)`);
        console.log(`  ${C.cyan}[4]${C.reset} 📋 ${C.bright}Xuất API kết nối AI${C.reset} (Code mẫu gọi từ mọi Web)`);
        console.log(`  ${C.cyan}[5]${C.reset} 📈 ${C.bright}Website đang dùng AI, Số Reqs & Tokens${C.reset} (Live Monitor Không Nháy)`);
        console.log(`  ${C.cyan}[6]${C.reset} ❌ ${C.bright}Thoát${C.reset}`);
        console.log(`${C.dim}────────────────────────────────────────────────────────────────────────────────${C.reset}`);

        const choice = await new Promise((resolve) => {
            rl.question(`👉 ${C.bright}Chọn chức năng [1 - 6]: ${C.reset}`, resolve);
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
                await handleExit(rl);
                return;
            default:
                console.log(`\n${C.red}Lựa chọn không hợp lệ, vui lòng chọn từ 1 đến 6!${C.reset}`);
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
