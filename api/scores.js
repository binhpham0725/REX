/**
 * Vercel Serverless Function: GET/POST /api/scores & /api/player/rename
 */

// Lưu trữ in-memory cho Vercel serverless (fallback)
let cachedScores = [
    { id: 'p_1', name: 'T-Rex Master', score: 3500, updatedAt: Date.now() },
    { id: 'p_2', name: 'Speed Runner', score: 2800, updatedAt: Date.now() },
    { id: 'p_3', name: 'Dino Jump', score: 2100, updatedAt: Date.now() }
];

export default function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    if (req.method === 'GET') {
        const limit = parseInt(req.query.limit, 10) || 5;
        cachedScores.sort((a, b) => b.score - a.score);
        return res.status(200).json({
            success: true,
            total: cachedScores.length,
            top: cachedScores.slice(0, limit),
            scores: cachedScores
        });
    }

    if (req.method === 'POST') {
        try {
            const { id, name, score } = req.body || {};
            if (id) {
                const cleanedName = (name || 'Người chơi ẩn danh').trim().substring(0, 20);
                const numScore = parseInt(score, 10) || 0;
                const existing = cachedScores.find(s => s.id === id);

                if (existing) {
                    existing.name = cleanedName;
                    if (numScore > existing.score) existing.score = numScore;
                } else if (numScore > 0) {
                    cachedScores.push({ id, name: cleanedName, score: numScore, updatedAt: Date.now() });
                }
                cachedScores.sort((a, b) => b.score - a.score);
            }
            return res.status(200).json({
                success: true,
                top: cachedScores.slice(0, 5),
                scores: cachedScores
            });
        } catch (e) {
            return res.status(400).json({ success: false, error: e.message });
        }
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
}
