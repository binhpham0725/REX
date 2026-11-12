/**
 * API duy nhất kết nối trực tiếp 100% với Ollama
 * Nhận tin nhắn từ Web -> Gọi Ollama -> Trả vềEcâu trả lời thực tế từ Ollama
 */

import fs from 'fs';
import path from 'path';

export const config = {
    runtime: 'nodejs',
    maxDuration: 60
};

// URL Ollama mặc định (kết nối trực tiếp tới máy tính của bạn)
function getDefaultOllamaUrl() {
    try {
        const tunnelFile = path.join(process.cwd(), 'data', 'current_tunnel.txt');
        if (fs.existsSync(tunnelFile)) {
            const savedUrl = fs.readFileSync(tunnelFile, 'utf8').trim();
            if (savedUrl && savedUrl.startsWith('https://')) return savedUrl;
        }
    } catch (e) {}
    return process.env.OLLAMA_URL || 'https://be0e-2402-800-611a-fe5d-b873-1f96-d558-dae0.ngrok-free.app';
}
const DEFAULT_OLLAMA_URL = getDefaultOllamaUrl();

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
        const filePath = path.join(process.cwd(), 'data', 'access_control.json');
        if (!fs.existsSync(filePath)) return 'allowed';
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const info = data.sources?.[clientSite];
        if (info && info.status) return info.status;
        return data.defaultPolicy || 'allowed';
    } catch (e) {
        return 'allowed';
    }
}

function getActiveSystemPrompt() {
    try {
        const filePath = path.join(process.cwd(), 'data', 'ai_rules.json');
        if (!fs.existsSync(filePath)) return null;
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const rule = data.rules?.find(r => r.id === data.activeRuleId);
        return rule ? rule.prompt : null;
    } catch (e) {
        return null;
    }
}

function lookupRouterCache(question) {
    try {
        const filePath = path.join(process.cwd(), 'data', 'router_cache.json');
        if (!fs.existsSync(filePath)) return null;
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
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
        return matched;
    } catch (e) {}
    return null;
}

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

        // Xác định chính xác tên trang web đang gọi API
        let clientWebsite = req.headers['x-client-origin'] || req.headers['origin'] || '';
        if (!clientWebsite && req.headers['referer']) {
            try {
                const u = new URL(req.headers['referer']);
                clientWebsite = `${u.protocol}//${u.host}`;
            } catch (e) {
                clientWebsite = req.headers['referer'];
            }
        }
        if (!clientWebsite) {
            const host = req.headers['x-forwarded-host'] || req.headers['host'];
            clientWebsite = host ? `https://${host}` : 'Web Game Vercel';
        }

        // 1. KIềE TRA QUYỀN TRUY CẬP (ACCESS CONTROL - CHỨC NāEG 6)
        const accessStatus = getAccessStatus(clientWebsite);
        if (accessStatus === 'blocked') {
            res.write(`data: ${JSON.stringify({ error: `🚫 Nguồn "${clientWebsite}" đã bềEquản trềEviên chặn quyền gọi AI trong Controller (Chức năng 6).` })}\n\n`);
            res.write(`data: [DONE]\n\n`);
            return res.end();
        }

        // 2. KIềE TRA ROUTER CACHE CÂU HỎI THƯỜNG GẶP (CHỨC NāEG 10)
        const lastUserMsg = [...rawMessages].reverse().find(m => m.role === 'user');
        const userText = lastUserMsg ? lastUserMsg.content : '';
        const cachedAnswer = lookupRouterCache(userText);
        if (cachedAnswer) {
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
                total_duration: 10000000
            })}\n\n`);
            res.write(`data: [DONE]\n\n`);
            return res.end();
        }

        // 3. ÁP DỤNG RULE / CHềETHềEHềETHỐNG ĐANG KÍCH HOẠT (CHỨC NāEG 8)
        const activePrompt = getActiveSystemPrompt();
        const systemPromptText = activePrompt || 'Bạn là T-Rex AI - một chú khủng long vui nhộn, thông minh tích hợp trên web game T-Rex Runner. Hãy trả lời ngắn gọn, thân thiện bằng tiếng Việt, đi thẳng vào câu hỏi.';
        const systemMsg = { role: 'system', content: systemPromptText };
        const chatHistory = rawMessages.filter(m => m.role !== 'system').slice(-4);
        const messagesToSend = [systemMsg, ...chatHistory];

        // Lấy địa chềEOllama
        const ollamaBaseUrl = req.headers['x-ollama-url'] || payload.ollamaUrl || DEFAULT_OLLAMA_URL;

        // Gửi trực tiếp đến Ollama API
        const ollamaRes = await fetch(`${ollamaBaseUrl}/api/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'ngrok-skip-browser-warning': '1', // BềEqua trang cảnh báo của ngrok
                'X-Client-Origin': clientWebsite,
                'Referer': clientWebsite
            },
            body: JSON.stringify({
                model: model,
                messages: messagesToSend,
                stream: true,
                think: think,
                keep_alive: -1, // Luôn giữ model trong VRAM vĩnh viềE, không bềEnguội gây chậm/timeout
                options: {
                    num_predict: 384,
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
