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
    bgCyan: '\x1b[46m'
};

const OLLAMA_PORT = 11434;
const NGROK_API_PORT = 4040;

// Đường dẫn file lưu trữ thống kê lưu lượng lâu dài
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
            websites: {}
        };
        fs.writeFileSync(TRAFFIC_DB_FILE, JSON.stringify(initial, null, 2), 'utf8');
        return initial;
    }
    try {
        const data = fs.readFileSync(TRAFFIC_DB_FILE, 'utf8');
        const parsed = JSON.parse(data);
        if (!parsed.processedIds) parsed.processedIds = {};
        if (!parsed.websites) parsed.websites = {};
        return parsed;
    } catch (e) {
        return { processedIds: {}, websites: {} };
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
            timeout: 4000
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
                    console.log(`     -> ${C.magenta}${m.name}${C.reset} (VRAM: ${vramMB} MB, Hết hạn sau: ${m.expires_at ? new Date(m.expires_at).toLocaleTimeString() : 'N/A'})`);
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
                    const status = r.response?.status_code || '---';
                    const statusColored = status === 200 ? `${C.green}200 OK${C.reset}` : `${C.red}${status}${C.reset}`;
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
            think: false // Trả lời siêu tốc trong 1-3 giây
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
  -d "{\\"model\\":\\"qwen-fast:latest\\",\\"messages\\":[{\\"role\\":\\"user\\",\\"content\\":\\"Xin chao!\\"}],\\"stream\\":false,\\"think\\":false}"`;

    console.log(`📡 ${C.bright}LỆNH TEST TRÊN TERMINAL (cURL):${C.reset}`);
    console.log(`${C.dim}────────────────────────────────────────────────────────────────────${C.reset}`);
    console.log(curlCode);
    console.log(`${C.dim}────────────────────────────────────────────────────────────────────${C.reset}\n`);

    copyToClipboard(jsCode);
    console.log(`📋 ${C.green}Đã tự động sao chép mã nguồn JavaScript vào Clipboard của bạn!${C.reset}`);
}

// -------------------------------------------------------------
// [5] HIỂN THỊ TÊN WEB ĐANG DÙNG AI & MỨC ĐỘ SỬ DỤNG
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

// Tạo thanh đo trực quan mức độ sử dụng
function generateUsageBar(percent) {
    const totalBars = 10;
    const filled = Math.min(totalBars, Math.max(0, Math.round(percent / 10)));
    const empty = totalBars - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
}

// Đồng bộ lưu lượng mới nhất từ Ngrok vào Database
async function syncTrafficData() {
    const db = initTrafficDb();

    try {
        const reqsData = await fetchJson(`http://127.0.0.1:${NGROK_API_PORT}/api/requests/http?limit=50`);
        if (reqsData.requests && reqsData.requests.length > 0) {
            reqsData.requests.forEach(r => {
                const reqId = r.id;
                // Nếu request này chưa từng được ghi nhận -> Ghi nhận và cộng dồn
                if (!db.processedIds[reqId]) {
                    db.processedIds[reqId] = r.start;

                    const siteName = extractWebsiteIdentity(r);
                    const isSuccess = r.response?.status_code === 200;
                    const durationSec = r.duration ? r.duration / 1000000000 : 0;
                    const endpoint = r.request?.uri || '/api/chat';

                    if (!db.websites[siteName]) {
                        db.websites[siteName] = {
                            name: siteName,
                            totalRequests: 0,
                            successRequests: 0,
                            totalDuration: 0,
                            lastActive: r.start,
                            endpoints: {},
                            clientIps: []
                        };
                    }

                    const site = db.websites[siteName];
                    site.totalRequests++;
                    if (isSuccess) site.successRequests++;
                    site.totalDuration += durationSec;
                    if (new Date(r.start) > new Date(site.lastActive)) {
                        site.lastActive = r.start;
                    }
                    site.endpoints[endpoint] = (site.endpoints[endpoint] || 0) + 1;
                    if (r.remote_addr && !site.clientIps.includes(r.remote_addr)) {
                        site.clientIps.push(r.remote_addr);
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

async function handleWebUsageStats(rl) {
    while (true) {
        console.clear();
        console.log(`${C.cyan}╔════════════════════════════════════════════════════════════════════════════════════════════════╗${C.reset}`);
        console.log(`${C.cyan}║${C.bright}${C.yellow}                  📊 THỐNG KÊ DANH SÁCH WEBSITE ĐANG SỬ DỤNG AI & MỨC ĐỘ                   ${C.reset}${C.cyan}║${C.reset}`);
        console.log(`${C.cyan}╚════════════════════════════════════════════════════════════════════════════════════════════════╝${C.reset}\n`);

        const db = await syncTrafficData();
        const siteList = Object.values(db.websites);

        if (siteList.length === 0) {
            console.log(`${C.yellow}ℹ️ Hiện tại chưa có lượt gọi nào từ các trang web qua Ngrok Tunnel.${C.reset}`);
            console.log(`💡 Mọi trang web gọi vào AI qua link Ngrok (hoặc Web game Vercel) sẽ tự động hiện tại đây!\n`);
            return;
        }

        // Tính tổng lượt request toàn hệ thống
        const totalAllRequests = siteList.reduce((sum, s) => sum + s.totalRequests, 0);
        const totalSuccess = siteList.reduce((sum, s) => sum + s.successRequests, 0);
        const overallSuccessRate = totalAllRequests > 0 ? ((totalSuccess / totalAllRequests) * 100).toFixed(0) : 100;

        // Sắp xếp các website theo mức độ sử dụng (giảm dần)
        siteList.sort((a, b) => b.totalRequests - a.totalRequests);
        const topSite = siteList[0] ? siteList[0].name : 'Chưa có';

        console.log(`${C.bright}📌 TỔNG QUAN HỆ THỐNG:${C.reset}`);
        console.log(`   • Tổng số Website/Nguồn: ${C.cyan}${C.bright}${siteList.length} trang${C.reset}        • Tổng lượt gọi AI: ${C.green}${C.bright}${totalAllRequests} lượt${C.reset}`);
        console.log(`   • Website sử dụng nhiều nhất: ${C.yellow}${C.bright}${topSite}${C.reset}`);
        console.log(`   • Tỷ lệ phản hồi thành công: ${C.green}${C.bright}${overallSuccessRate}%${C.reset}\n`);

        console.log(`┌────┬──────────────────────────────────────┬────────────────────────┬──────────┬──────────┬───────────┬──────────────┐`);
        console.log(`│ ${C.bright}STT${C.reset}│ ${C.bright}TÊN WEBSITE / ỨNG DỤNG${C.reset}              │ ${C.bright}MỨC ĐỘ SỬ DỤNG${C.reset}         │ ${C.bright}SỐ LƯỢT${C.reset}  │ ${C.bright}T.CÔNG${C.reset}   │ ${C.bright}ĐỘ TRỄ TB${C.reset} │ ${C.bright}HOẠT ĐỘNG${C.reset}    │`);
        console.log(`├────┼──────────────────────────────────────┼────────────────────────┼──────────┼──────────┼───────────┼──────────────┤`);

        const now = Date.now();

        siteList.forEach((site, idx) => {
            const percent = totalAllRequests > 0 ? (site.totalRequests / totalAllRequests) * 100 : 0;
            const bar = generateUsageBar(percent);
            
            // Phân loại mức độ sử dụng
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

            const usageMeter = `[${levelColor}${bar}${C.reset}] ${percent.toFixed(1).padStart(5)}% ${levelColor}${levelTag.padEnd(4)}${C.reset}`;
            const successRate = site.totalRequests > 0 ? ((site.successRequests / site.totalRequests) * 100).toFixed(0) + '%' : '100%';
            const avgDur = site.totalRequests > 0 ? (site.totalDuration / site.totalRequests).toFixed(1) + 's' : '0.0s';
            
            const lastTime = new Date(site.lastActive);
            const isRecent = (now - lastTime.getTime()) < 5 * 60 * 1000; // trong 5 phút gần đây
            const activeStatus = isRecent ? `${C.green}🟢 ${lastTime.toLocaleTimeString('vi-VN')}${C.reset}` : `${C.dim}⚪ ${lastTime.toLocaleTimeString('vi-VN')}${C.reset}`;

            let displayName = site.name;
            if (displayName.length > 36) {
                displayName = displayName.substring(0, 33) + '...';
            }

            const sttStr = String(idx + 1).padEnd(2);
            const nameStr = displayName.padEnd(36);
            const reqStr = `${site.totalRequests} reqs`.padEnd(8);
            const succStr = successRate.padEnd(8);
            const durStr = avgDur.padEnd(9);

            console.log(`│ ${sttStr} │ ${C.bright}${nameStr}${C.reset} │ ${usageMeter} │ ${C.cyan}${reqStr}${C.reset} │ ${C.green}${succStr}${C.reset} │ ${durStr} │ ${activeStatus} │`);
        });

        console.log(`└────┴──────────────────────────────────────┴────────────────────────┴──────────┴──────────┴───────────┴──────────────┘\n`);

        console.log(`💡 ${C.dim}Giải thích mức độ: [██████████] là thanh đo phần trăm lưu lượng website đó chiếm trên tổng lượt gọi AI.${C.reset}`);
        console.log(`💡 ${C.dim}Trạng thái: 🟢 Đang gọi trong 5 phút gần nhất | ⚪ Đã nghỉ${C.reset}\n`);

        const ans = await new Promise((resolve) => {
            rl.question(`👉 Nhấn ${C.yellow}[R]${C.reset} để Làm mới dữ liệu | Nhấn ${C.green}[Enter]${C.reset} để Quay lại Menu chính: `, resolve);
        });

        if (ans.trim().toLowerCase() !== 'r') {
            break;
        }
    }
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
        console.log(`  ${C.cyan}[5]${C.reset} 📈 ${C.bright}Website đang dùng AI & Mức độ sử dụng${C.reset} (Traffic Monitor)`);
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
