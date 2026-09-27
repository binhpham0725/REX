/**
 * Rex Runner - Online Leaderboard & Database Module
 * Thiết kế kiến trúc module hóa với Data Provider riêng biệt,
 * dễ dàng chuyển đổi sang Firebase Firestore / Realtime Database.
 */

// ==========================================
// 1. CẤU HÌNH & ADAPTER FIREBASE (SẴN SÀNG KÍCH HOẠT)
// ==========================================
/*
 * HƯỚNG DẪN ĐẨY LÊN FIREBASE (FIRESTORE):
 * 1. Thêm Firebase SDK vào index.html:
 *    <script src="https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js"></script>
 *    <script src="https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore-compat.js"></script>
 * 2. Điền config bên dưới và đổi config `USE_FIREBASE = true`.
 */
const FIREBASE_CONFIG = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// ==========================================
// 2. DATA PROVIDER: CƠ SỞ DỮ LIỆU ĐỘC LẬP
// ==========================================

class LocalStorageDBProvider {
    constructor() {
        this.STORAGE_KEY = 'rex_online_leaderboard_db';
        this.initDatabase();
    }

    initDatabase() {
        const existingData = localStorage.getItem(this.STORAGE_KEY);
        if (!existingData) {
            // Database hoàn toàn sạch, không chứa dữ liệu demo
            this.saveAll([]);
        } else {
            // Tự động dọn sạch mọi dữ liệu bot demo cũ nếu từng tồn tại
            const records = this.getAll();
            const cleaned = records.filter(r => r.id && !r.id.startsWith('bot_'));
            if (cleaned.length !== records.length) {
                this.saveAll(cleaned);
            }
        }
    }

    getAll() {
        try {
            const data = localStorage.getItem(this.STORAGE_KEY);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            console.error('Lỗi đọc database bảng xếp hạng:', e);
            return [];
        }
    }

    saveAll(records) {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(records));
        } catch (e) {
            console.error('Lỗi lưu database bảng xếp hạng:', e);
        }
    }

    async getTopScores(limitCount = 5) {
        const records = this.getAll();
        // Sắp xếp điểm cao nhất trước, cùng điểm thì ai đạt trước xếp trên
        records.sort((a, b) => b.score - a.score || a.updatedAt - b.updatedAt);
        return records.slice(0, limitCount);
    }

    async saveScore(playerId, playerName, score) {
        const records = this.getAll();
        const existingIndex = records.findIndex(r => r.id === playerId);

        if (existingIndex >= 0) {
            // Cập nhật tên nếu có thay đổi và chỉ cập nhật điểm nếu cao hơn
            records[existingIndex].name = playerName;
            if (score > records[existingIndex].score) {
                records[existingIndex].score = score;
                records[existingIndex].updatedAt = Date.now();
            }
        } else {
            records.push({
                id: playerId,
                name: playerName,
                score: score,
                updatedAt: Date.now()
            });
        }

        this.saveAll(records);
        return true;
    }

    async updatePlayerName(playerId, newName) {
        const records = this.getAll();
        const existingIndex = records.findIndex(r => r.id === playerId);
        if (existingIndex >= 0) {
            records[existingIndex].name = newName;
            this.saveAll(records);
            return true;
        }
        return false;
    }

    async getPlayerRank(playerId) {
        const records = this.getAll();
        records.sort((a, b) => b.score - a.score || a.updatedAt - b.updatedAt);
        const index = records.findIndex(r => r.id === playerId);
        if (index >= 0) {
            return {
                rank: index + 1,
                record: records[index],
                total: records.length
            };
        }
        return null;
    }
}

// Lớp Provider cho Firebase (khi người dùng đưa Firebase Config vào)
class FirebaseDBProvider {
    constructor(config) {
        this.config = config;
        this.db = null;
        this.collectionName = 'rex_leaderboard';
        this.initFirebase();
    }

    initFirebase() {
        if (window.firebase && !firebase.apps.length) {
            firebase.initializeApp(this.config);
            this.db = firebase.firestore();
        } else if (window.firebase) {
            this.db = firebase.firestore();
        }
    }

    async getTopScores(limitCount = 5) {
        if (!this.db) return [];
        const snapshot = await this.db.collection(this.collectionName)
            .orderBy('score', 'desc')
            .limit(limitCount)
            .get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    async saveScore(playerId, playerName, score) {
        if (!this.db) return false;
        const ref = this.db.collection(this.collectionName).doc(playerId);
        const doc = await ref.get();
        if (doc.exists) {
            const currentScore = doc.data().score || 0;
            if (score > currentScore) {
                await ref.set({ name: playerName, score: score, updatedAt: Date.now() }, { merge: true });
            } else {
                await ref.set({ name: playerName }, { merge: true });
            }
        } else {
            await ref.set({ name: playerName, score: score, updatedAt: Date.now() });
        }
        return true;
    }

    async updatePlayerName(playerId, newName) {
        if (!this.db) return false;
        const ref = this.db.collection(this.collectionName).doc(playerId);
        await ref.set({ name: newName }, { merge: true });
        return true;
    }

    async getPlayerRank(playerId) {
        // Có thể lấy top 100 hoặc query rank
        return null;
    }
}

// Lớp Provider kết nối REST API Server Cục bộ (Đồng bộ nhiều trình duyệt & thiết bị cùng lúc)
class ServerDBProvider {
    constructor() {
        this.apiBase = '/api';
        this.localFallback = new LocalStorageDBProvider();
        this.lastTotal = 0;
    }

    async getTopScores(limitCount = 5) {
        try {
            const res = await fetch(`${this.apiBase}/scores?limit=${limitCount}`, {
                cache: 'no-store'
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            this.lastTotal = data.total || 0;
            return data.top || [];
        } catch (err) {
            console.warn('[ServerDB] Không kết nối được Server API, chuyển sang LocalStorage:', err);
            return this.localFallback.getTopScores(limitCount);
        }
    }

    async saveScore(playerId, playerName, score) {
        // Lưu backup tại local của trình duyệt
        this.localFallback.saveScore(playerId, playerName, score);

        try {
            const res = await fetch(`${this.apiBase}/scores`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: playerId, name: playerName, score: score })
            });
            return res.ok;
        } catch (err) {
            console.warn('[ServerDB] Lỗi gửi điểm lên Server API:', err);
            return false;
        }
    }

    async updatePlayerName(playerId, newName) {
        this.localFallback.updatePlayerName(playerId, newName);

        try {
            const res = await fetch(`${this.apiBase}/player/rename`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: playerId, name: newName })
            });
            return res.ok;
        } catch (err) {
            console.warn('[ServerDB] Lỗi đổi tên trên Server API:', err);
            return false;
        }
    }

    async getPlayerRank(playerId) {
        try {
            const res = await fetch(`${this.apiBase}/scores?limit=100`, { cache: 'no-store' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const scores = data.scores || [];
            const index = scores.findIndex(s => s.id === playerId);
            if (index >= 0) {
                return {
                    rank: index + 1,
                    record: scores[index],
                    total: scores.length
                };
            }
            return null;
        } catch (err) {
            return this.localFallback.getPlayerRank(playerId);
        }
    }
}

// ==========================================
// 3. QUẢN LÝ THÔNG TIN NGƯỜI CHƠI (PROFILE)
// ==========================================

class PlayerManager {
    constructor() {
        this.ID_KEY = 'rex_player_id';
        this.NAME_KEY = 'rex_player_name';
        this.SCORE_KEY = 'rex_high_score';
        this.id = this.getOrGenerateId();
        this.name = localStorage.getItem(this.NAME_KEY) || '';
        this.highScore = parseInt(localStorage.getItem(this.SCORE_KEY) || '0', 10);
    }

    getOrGenerateId() {
        let currentId = localStorage.getItem(this.ID_KEY);
        if (!currentId) {
            currentId = 'rex_user_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7);
            localStorage.setItem(this.ID_KEY, currentId);
        }
        return currentId;
    }

    hasName() {
        return Boolean(this.name && this.name.trim().length > 0);
    }

    setName(newName) {
        const cleaned = (newName || '').trim();
        if (cleaned.length === 0) return false;
        this.name = cleaned;
        localStorage.setItem(this.NAME_KEY, this.name);
        return true;
    }

    setHighScore(score) {
        if (score > this.highScore) {
            this.highScore = score;
            localStorage.setItem(this.SCORE_KEY, String(this.highScore));
            return true;
        }
        return false;
    }
}

// ==========================================
// 4. LEADERBOARD MANAGER & UI CONTROLLER
// ==========================================

class LeaderboardManager {
    constructor() {
        this.player = new PlayerManager();
        
        // Tự động nhận diện: Nếu chạy qua HTTP Server thì dùng ServerDBProvider để chia sẻ điểm giữa mọi trình duyệt
        if (typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('http')) {
            this.db = new ServerDBProvider();
        } else {
            this.db = new LocalStorageDBProvider();
        }

        this.initDOMElements();
        this.bindEvents();
        this.checkInitialPlayer();
        this.refreshLeaderboard();
        this.updateProfileDisplay();
        this.startAutoSync(2500); // Tự động đồng bộ điểm mới nhất từ server mỗi 2.5 giây
    }

    startAutoSync(intervalMs = 2500) {
        if (this.syncTimer) clearInterval(this.syncTimer);
        this.syncTimer = setInterval(() => {
            // Chỉ làm mới ngầm khi không đang mở modal nhập tên
            const isModalOpen = this.nameModal && this.nameModal.classList.contains('active');
            if (!isModalOpen) {
                this.refreshLeaderboard(false);
            }
        }, intervalMs);
    }

    initDOMElements() {
        // Modal elements
        this.nameModal = document.getElementById('playerNameModal');
        this.nameInput = document.getElementById('playerNameInput');
        this.modalTitle = document.getElementById('nameModalTitle');
        this.modalSubtitle = document.getElementById('nameModalSubtitle');
        this.saveNameBtn = document.getElementById('saveNameBtn');
        this.cancelNameBtn = document.getElementById('cancelNameBtn');

        // Leaderboard UI
        this.leaderboardBody = document.getElementById('leaderboardList');
        this.refreshBtn = document.getElementById('refreshLeaderboardBtn');
        this.editNameBtn = document.getElementById('editNameBtn');
        this.profilePlayerName = document.getElementById('profilePlayerName');
        this.profilePlayerBest = document.getElementById('profilePlayerBest');
        this.playerRankNotice = document.getElementById('playerRankNotice');
    }

    bindEvents() {
        // Khi bấm nút "Sửa tên" / "Đổi tên"
        if (this.editNameBtn) {
            this.editNameBtn.addEventListener('click', () => {
                this.openNameModal(true);
            });
        }

        // Khi bấm nút "Lưu" trong modal
        if (this.saveNameBtn) {
            this.saveNameBtn.addEventListener('click', () => {
                this.handleSaveName();
            });
        }

        // Khi bấm nút "Hủy" trong modal
        if (this.cancelNameBtn) {
            this.cancelNameBtn.addEventListener('click', () => {
                this.closeNameModal();
            });
        }

        // Khi ấn Enter trong input tên
        if (this.nameInput) {
            this.nameInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.handleSaveName();
                } else if (e.key === 'Escape' && this.player.hasName()) {
                    e.preventDefault();
                    this.closeNameModal();
                }
            });
        }

        // Nút làm mới bảng xếp hạng
        if (this.refreshBtn) {
            this.refreshBtn.addEventListener('click', () => {
                this.refreshLeaderboard();
            });
        }
    }

    checkInitialPlayer() {
        // Nếu người chơi chưa có tên trong trình duyệt, hiển thị popup yêu cầu nhập tên
        if (!this.player.hasName()) {
            this.openNameModal(false);
        } else if (this.player.highScore > 0) {
            // Đã có tên và điểm kỷ lục, đồng bộ vào DB
            this.db.saveScore(this.player.id, this.player.name, this.player.highScore);
        }
    }

    openNameModal(isEditing = false) {
        if (!this.nameModal) return;

        if (isEditing) {
            if (this.modalTitle) this.modalTitle.textContent = '✏️ ĐỔI TÊN NGƯỜI CHƠI';
            if (this.modalSubtitle) this.modalSubtitle.textContent = 'Cập nhật biệt danh của bạn trên bảng xếp hạng';
            if (this.cancelNameBtn) this.cancelNameBtn.style.display = 'inline-flex';
        } else {
            if (this.modalTitle) this.modalTitle.textContent = '🦖 CHÀO MỪNG DINO RUNNER!';
            if (this.modalSubtitle) this.modalSubtitle.textContent = 'Nhập tên của bạn để lưu điểm kỷ lục và thi đua trên bảng xếp hạng';
            if (this.cancelNameBtn) this.cancelNameBtn.style.display = 'none';
        }

        if (this.nameInput) {
            this.nameInput.value = this.player.name || '';
            this.nameInput.placeholder = 'Ví dụ: Khủng Long Đỏ';
        }

        this.nameModal.classList.add('active');

        // Focus vào input sau hiệu ứng mở
        setTimeout(() => {
            if (this.nameInput) {
                this.nameInput.focus();
                this.nameInput.select();
            }
        }, 150);
    }

    closeNameModal() {
        if (this.nameModal) {
            this.nameModal.classList.remove('active');
        }
    }

    async handleSaveName() {
        const inputVal = this.nameInput ? this.nameInput.value : '';
        const cleanedName = inputVal.trim();

        if (!cleanedName) {
            if (this.nameInput) {
                this.nameInput.classList.add('input-error');
                setTimeout(() => this.nameInput.classList.remove('input-error'), 800);
                this.nameInput.focus();
            }
            return;
        }

        this.player.setName(cleanedName);
        // Cập nhật lên DB nếu đã có điểm kỷ lục
        if (this.player.highScore > 0) {
            await this.db.saveScore(this.player.id, this.player.name, this.player.highScore);
        } else {
            await this.db.updatePlayerName(this.player.id, this.player.name);
        }

        this.updateProfileDisplay();
        await this.refreshLeaderboard();
        this.closeNameModal();
    }

    updateProfileDisplay() {
        if (this.profilePlayerName) {
            this.profilePlayerName.textContent = this.player.name || 'Khách';
        }
        if (this.profilePlayerBest) {
            const pad = (num) => String(Math.floor(num)).padStart(5, '0');
            this.profilePlayerBest.textContent = pad(this.player.highScore);
        }
    }

    async submitNewScore(score) {
        const isNewBest = this.player.setHighScore(score);
        // Lưu vào DB
        const pName = this.player.name || 'Người chơi ẩn danh';
        await this.db.saveScore(this.player.id, pName, this.player.highScore);

        this.updateProfileDisplay();
        await this.refreshLeaderboard();

        return isNewBest;
    }

    async refreshLeaderboard(animate = true) {
        if (!this.leaderboardBody) return;

        // Hiệu ứng xoay nút refresh chỉ khi người dùng bấm
        if (animate && this.refreshBtn) {
            this.refreshBtn.classList.add('rotating');
            setTimeout(() => this.refreshBtn.classList.remove('rotating'), 500);
        }

        const topPlayers = await this.db.getTopScores(5);
        this.renderTopPlayers(topPlayers);

        // Hiển thị vị trí người chơi nếu chưa lọt top 5
        const userRankInfo = await this.db.getPlayerRank(this.player.id);
        this.renderUserRankNotice(userRankInfo, topPlayers);
    }

    renderTopPlayers(topPlayers) {
        if (!this.leaderboardBody) return;

        const pad = (num) => String(Math.floor(num)).padStart(5, '0');
        const medals = ['🥇', '🥈', '🥉', '4', '5'];
        const currentId = this.player.id;
        const safePlayers = Array.isArray(topPlayers) ? topPlayers : [];

        let rowsHtml = '';
        for (let i = 0; i < 5; i++) {
            const item = safePlayers[i];
            const rankBadge = i < 3 
                ? `<span class="medal-badge medal-${i + 1}">${medals[i]}</span>`
                : `<span class="rank-number">#${i + 1}</span>`;

            if (item) {
                const isCurrentPlayer = item.id === currentId;
                const youTag = isCurrentPlayer ? '<span class="you-badge">BẠN</span>' : '';
                rowsHtml += `
                    <div class="leaderboard-item ${isCurrentPlayer ? 'is-current-user' : ''} rank-${i + 1}">
                        <div class="rank-col">${rankBadge}</div>
                        <div class="name-col">
                            <span class="player-name" title="${this.escapeHtml(item.name)}">${this.escapeHtml(item.name)}</span>
                            ${youTag}
                        </div>
                        <div class="score-col">
                            <span class="score-value">${pad(item.score)}</span>
                        </div>
                    </div>
                `;
            } else {
                rowsHtml += `
                    <div class="leaderboard-item is-empty rank-${i + 1}">
                        <div class="rank-col">${rankBadge}</div>
                        <div class="name-col">
                            <span class="empty-slot">Chưa có người chơi...</span>
                        </div>
                        <div class="score-col">
                            <span class="empty-score">-----</span>
                        </div>
                    </div>
                `;
            }
        }

        this.leaderboardBody.innerHTML = rowsHtml;
    }

    renderUserRankNotice(userRankInfo, top5List) {
        if (!this.playerRankNotice) return;

        if (!this.player.hasName() || this.player.highScore <= 0 || !userRankInfo) {
            this.playerRankNotice.style.display = 'block';
            this.playerRankNotice.innerHTML = `💡 Hãy bấm <strong>Space</strong> hoặc chạm để chơi và ghi danh vào Top 5!`;
            this.playerRankNotice.className = 'player-rank-notice';
            return;
        }

        const isInTop5 = top5List.some(p => p.id === this.player.id);
        if (isInTop5) {
            this.playerRankNotice.style.display = 'block';
            this.playerRankNotice.innerHTML = `🎉 Bạn đang nằm trong <strong>TOP 5</strong> bảng xếp hạng!`;
            this.playerRankNotice.className = 'player-rank-notice in-top';
        } else {
            const pad = (num) => String(Math.floor(num)).padStart(5, '0');
            this.playerRankNotice.style.display = 'block';
            this.playerRankNotice.innerHTML = `
                <span>Vị trí của bạn: <strong>#${userRankInfo.rank}</strong> (${userRankInfo.total} người chơi)</span>
                <span>Điểm kỷ lục: <strong>${pad(this.player.highScore)}</strong></span>
            `;
            this.playerRankNotice.className = 'player-rank-notice';
        }
    }

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str || '';
        return div.innerHTML;
    }
}

// Khởi tạo và đính kèm vào window khi ở môi trường trình duyệt
if (typeof document !== 'undefined') {
    window.leaderboardManager = new LeaderboardManager();
}
