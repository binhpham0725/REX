/**
 * API lấy danh sách mô hình trực tiếp từ Ollama
 */

import fs from 'fs';
import path from 'path';

function getDefaultOllamaUrl() {
    try {
        const tunnelFile = path.join(process.cwd(), 'data', 'current_tunnel.txt');
        if (fs.existsSync(tunnelFile)) {
            const savedUrl = fs.readFileSync(tunnelFile, 'utf8').trim();
            if (savedUrl && savedUrl.startsWith('https://')) return savedUrl;
        }
    } catch (e) {}
    return process.env.OLLAMA_URL || 'https://43e9-116-99-255-211.ngrok-free.app';
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-ollama-url');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    const customUrl = req.headers['x-ollama-url'] || req.query.url;
    const ollamaBaseUrl = customUrl || getDefaultOllamaUrl();

    // Xác định tên trang web đang gọi
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

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);

        const ollamaRes = await fetch(`${ollamaBaseUrl}/api/tags`, {
            method: 'GET',
            headers: {
                'ngrok-skip-browser-warning': '1',
                'X-Client-Origin': clientWebsite,
                'Referer': clientWebsite
            },
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (ollamaRes.ok) {
            const data = await ollamaRes.json();
            return res.status(200).json({
                success: true,
                online: true,
                source: ollamaBaseUrl,
                models: data.models || []
            });
        }
    } catch (err) {
        console.error('[Models Error]', err);
    }

    return res.status(200).json({
        success: true,
        online: false,
        source: ollamaBaseUrl,
        models: [
            { name: 'qwen-fast:latest' },
            { name: 'qwen3.5:4b' }
        ]
    });
}
