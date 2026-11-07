/**
 * 🦖 T-REX AI CONTROLLER & API GATEWAY CLI DASHBOARD
 * Công cụ điều khiển và giám sát AI Local (Ollama) + Ngrok Tunnel trên Windows
 */

const http = require('http');
const https = require('https');
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
    bgGreen: '\x1b[42m'
};

const OLLAMA_PORT = 11434;
const NGROK_API_PORT = 4040;

// Bộ nhớ đệm thống kê traffic theo domain
const trafficStats = new Map();

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
        console.log(`  🤖 ${C.bright}Ollama AI:${C.reset}  ${C.green}● ONLINE (Port ${OLLAMA_PORT})${C.reset} | Models: ${C.yellow}${modelNames}${C.reset}`);
    } else {
        console.log(`  🤖 ${C.bright}Ollama AI:${C.reset}  ${C.red}○ OFFLINE${C.reset} (Chưa bật service)`);
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
    console.log(`   • Chat Completion API: ${C.yellow}${apiUrl}/api/chat${C.reset}`);
    console.log(`   • Models List API:     ${C.yellow}${apiUrl}/api/tags${C.reset}`);
    console.log(`   • Text Generation API: ${C.yellow}${apiUrl}/api/generate${C.reset}\n`);

    console.log(`📌 ${C.bright}HEADERS BẮT BUỘC:${C.reset}`);
    console.log(`   • Content-Type: ${C.cyan}application/json${C.reset}`);
    console.log(`   • ngrok-skip-browser-warning: ${C.cyan}1${C.reset}  (Bỏ qua màn hình bảo vệ của ngrok)\n`);

    const jsCode = `// 1. Mã nguồn JavaScript (Dùng trên mọi Web / React / Vue / HTML)
async function askAI(prompt) {
    const response = await fetch("${apiUrl}/api/chat", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "1"
        },
        body: JSON.stringify({
            model: "qwen-fast:latest",
            messages: [{ role: "user", content: prompt }],
            stream: false,
            think: false // trả lời siêu tốc trong vài giây
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
async function handleWebUsageStats() {
    console.log(`\n${C.yellow}⏳ Đang quét và phân tích nhật ký lưu lượng truy cập từ các trang web...${C.reset}\n`);

    try {
        const reqsData = await fetchJson(`http://127.0.0.1:${NGROK_API_PORT}/api/requests/http?limit=50`);

        if (!reqsData.requests || reqsData.requests.length === 0) {
            console.log(`${C.yellow}ℹ️ Hiện tại chưa có yêu cầu truy cập nào qua Ngrok Tunnel.${C.reset}`);
            console.log(`💡 Khi bạn bè hoặc website (như Vercel) gọi AI, tên website sẽ tự động xuất hiện tại đây!\n`);
            return;
        }

        // Cập nhật thống kê từ ngrok logs
        reqsData.requests.forEach(r => {
            const headers = r.request?.headers || {};
            
            // Tìm nguồn gốc website
            let origin = (headers['Origin']?.[0] || headers['Referer']?.[0] || '').trim();
            if (!origin) {
                if (headers['X-Vercel-Id']) {
                    origin = 'https://rex-runner.vercel.app (Vercel Cloud)';
                } else if (headers['User-Agent']?.[0]?.includes('curl')) {
                    origin = 'cURL / Terminal Direct Client';
                } else if (headers['User-Agent']?.[0]?.includes('node')) {
                    origin = 'Node.js Backend / Server API';
                } else {
                    origin = headers['Host']?.[0] ? `Direct (${headers['Host'][0]})` : 'Direct API Call';
                }
            }

            // Làm sạch origin
            try {
                if (origin.startsWith('http')) {
                    const u = new URL(origin);
                    origin = `${u.protocol}//${u.host}`;
                }
            } catch (e) {}

            const durationSec = r.duration ? r.duration / 1000000000 : 0;
            const isSuccess = r.response?.status_code === 200;

            if (!trafficStats.has(origin)) {
                trafficStats.set(origin, {
                    totalRequests: 0,
                    successRequests: 0,
                    totalDuration: 0,
                    lastActive: new Date(r.start),
                    clientIps: new Set()
                });
            }

            const stat = trafficStats.get(origin);
            stat.totalRequests++;
            if (isSuccess) stat.successRequests++;
            stat.totalDuration += durationSec;
            if (new Date(r.start) > stat.lastActive) {
                stat.lastActive = new Date(r.start);
            }
            if (r.remote_addr) stat.clientIps.add(r.remote_addr);
        });

        // In bảng thống kê
        console.log(`${C.cyan}╔════════════════════════════════════════════════════════════════════════════════════════════╗${C.reset}`);
        console.log(`${C.cyan}║${C.bright}                    DANH SÁCH WEBSITE ĐANG SỬ DỤNG AI & LƯU LƯỢNG                   ${C.reset}${C.cyan}║${C.reset}`);
        console.log(`${C.cyan}╚════════════════════════════════════════════════════════════════════════════════════════════╝${C.reset}\n`);

        console.log(` ${'STT'.padEnd(4)} | ${'TÊN WEBSITE / NGUỒN TRUY CẬP'.padEnd(38)} | ${'SỐ LƯỢT'.padEnd(8)} | ${'THÀNH CÔNG'.padEnd(10)} | ${'ĐỘ TRỄ TB'.padEnd(10)} | ${'LẦN CUỐI'}`);
        console.log(` ${C.dim}────────────────────────────────────────────────────────────────────────────────────────────${C.reset}`);

        let idx = 1;
        trafficStats.forEach((val, key) => {
            const avgDur = val.totalRequests > 0 ? (val.totalDuration / val.totalRequests).toFixed(1) + 's' : '0s';
            const rate = ((val.successRequests / val.totalRequests) * 100).toFixed(0) + '%';
            const lastTime = val.lastActive.toLocaleTimeString('vi-VN');
            const websiteName = key.length > 36 ? key.substring(0, 33) + '...' : key;

            console.log(` ${String(idx++).padEnd(4)} | ${C.bright}${C.yellow}${websiteName.padEnd(38)}${C.reset} | ${C.cyan}${String(val.totalRequests).padEnd(8)}${C.reset} | ${C.green}${rate.padEnd(10)}${C.reset} | ${avgDur.padEnd(10)} | ${lastTime}`);
        });

        console.log(` ${C.dim}────────────────────────────────────────────────────────────────────────────────────────────${C.reset}`);
        console.log(`💡 ${C.dim}Mẹo: Mọi website nhúng API của bạn đều sẽ được tự động ghi nhận và phân tích tại đây!${C.reset}\n`);

    } catch (e) {
        console.log(`${C.red}⚠️ Không thể lấy thông tin lưu lượng từ Ngrok. Hãy chắc chắn Ngrok đang chạy!${C.reset}\n`);
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
                await handleWebUsageStats();
                await waitForEnter(rl);
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
