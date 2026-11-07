import fs from 'fs';
import path from 'path';

export const config = {
    runtime: 'nodejs'
};

export default function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    try {
        const filePath = path.join(process.cwd(), 'data', 'current_tunnel.txt');
        if (fs.existsSync(filePath)) {
            const url = fs.readFileSync(filePath, 'utf8').trim();
            if (url) {
                return res.status(200).json({ success: true, url: url });
            }
        }
    } catch (e) {}

    return res.status(200).json({
        success: true,
        url: process.env.OLLAMA_URL || 'https://43e9-116-99-255-211.ngrok-free.app'
    });
}
