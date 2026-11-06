// T-Rex Runner Main Game Engine

class DinoGame {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.ctx.imageSmoothingEnabled = false;

        // Constants
        this.CANVAS_WIDTH = 1000;
        this.CANVAS_HEIGHT = 300;
        this.GROUND_Y = 250;
        this.GRAVITY = 0.65;
        this.FAST_DROP_GRAVITY = 1.5;
        this.INITIAL_SPEED = 7;
        this.MAX_SPEED = 14;
        this.JUMP_FORCE = -12.5;

        // State
        this.state = 'IDLE'; // IDLE, PLAYING, PAUSED, GAMEOVER
        this.speed = this.INITIAL_SPEED;
        this.score = 0;
        this.highScore = (window.leaderboardManager && window.leaderboardManager.player)
            ? window.leaderboardManager.player.highScore
            : parseInt(localStorage.getItem('rex_high_score') || '0', 10);
        this.lastMilestone = 0;
        this.milestoneFlashTimer = 0;
        this.isNight = false;
        this.nightFade = 0; // 0 (day) to 1 (night)

        // Dino properties
        this.dino = {
            x: 60,
            y: this.GROUND_Y - 48,
            width: 44,
            height: 48,
            vy: 0,
            isJumping: false,
            isDucking: false,
            animTimer: 0,
            animFrame: 0
        };

        // Entities
        this.obstacles = [];
        this.clouds = [];
        this.stars = [];
        this.groundBumps = [];
        this.obstacleTimer = 0;

        // Key states
        this.keys = {
            up: false,
            down: false
        };

        // Secret Transformer Cheat Mode
        this.isTransformerCheat = false;
        this.cheatInputHistory = [];
        this.lastCheatActionTime = 0;
        this.lastJumpTimeInCheat = 0;
        this.transformerParticles = [];
        this.wingAnimFrame = 0;
        this.wingAnimTimer = 0;

        this.initEnvironment();
        this.bindEvents();
        this.updateScoreDisplay();
        this.updateHUD();

        // Game loop timing
        this.lastTime = performance.now();
        requestAnimationFrame((t) => this.loop(t));
    }

    initEnvironment() {
        // Init clouds
        this.clouds = [];
        for (let i = 0; i < 4; i++) {
            this.clouds.push({
                x: Math.random() * this.CANVAS_WIDTH,
                y: 35 + Math.random() * 80,
                speed: 0.8 + Math.random() * 0.4
            });
        }

        // Init stars
        this.stars = [];
        for (let i = 0; i < 15; i++) {
            this.stars.push({
                x: Math.random() * this.CANVAS_WIDTH,
                y: 20 + Math.random() * 120,
                brightness: Math.random()
            });
        }

        // Init ground texture bumps
        this.groundBumps = [];
        for (let x = 0; x < this.CANVAS_WIDTH; x += 15 + Math.random() * 40) {
            this.groundBumps.push({
                x: x,
                length: 2 + Math.floor(Math.random() * 8),
                offsetY: Math.floor(Math.random() * 4)
            });
        }
    }

    reset() {
        this.speed = this.INITIAL_SPEED;
        this.score = 0;
        this.lastMilestone = 0;
        this.milestoneFlashTimer = 0;
        this.isNight = false;
        this.nightFade = 0;
        this.obstacles = [];
        this.obstacleTimer = 80;

        this.dino.y = this.GROUND_Y - 48;
        this.dino.vy = 0;
        this.dino.isJumping = false;
        this.dino.isDucking = false;
        this.dino.animTimer = 0;
        this.dino.animFrame = 0;

        // Reset cheat
        this.isTransformerCheat = false;
        this.cheatInputHistory = [];
        this.transformerParticles = [];
        this.lastJumpTimeInCheat = 0;

        this.state = 'PLAYING';
        this.updateThemeDOM();
        this.updateScoreDisplay();
        this.updateHUD();
    }

    bindEvents() {
        // Keyboard controls
        window.addEventListener('keydown', (e) => {
            // Không nhận phím điều khiển game khi đang nhập tên trong ô input hoặc khi modal mở
            const isInputActive = document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName);
            const isModalOpen = document.getElementById('playerNameModal')?.classList.contains('active');
            if (isInputActive || isModalOpen) {
                return;
            }

            if (['Space', 'ArrowUp', 'KeyW'].includes(e.code)) {
                e.preventDefault();
                this.handleJumpPress();
            } else if (['ArrowDown', 'KeyS'].includes(e.code)) {
                e.preventDefault();
                this.handleDuck(true);
            } else if (e.code === 'KeyP') {
                e.preventDefault();
                this.togglePause();
            } else if (e.code === 'KeyM') {
                e.preventDefault();
                this.toggleMute();
            } else if (e.code === 'Enter' && this.state === 'GAMEOVER') {
                e.preventDefault();
                this.reset();
            }
        });

        window.addEventListener('keyup', (e) => {
            const isInputActive = document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName);
            if (isInputActive) return;

            if (['ArrowDown', 'KeyS'].includes(e.code)) {
                this.handleDuck(false);
            }
        });

        // Touch & Mouse on Canvas / Container
        const container = document.getElementById('gameContainer');

        // Touch Controls
        let touchStartY = 0;
        container.addEventListener('touchstart', (e) => {
            touchStartY = e.touches[0].clientY;
            if (this.state === 'IDLE' || this.state === 'GAMEOVER') {
                this.handleJumpPress();
                return;
            }
            // Check if touched bottom third -> Duck, else Jump
            const rect = container.getBoundingClientRect();
            const relY = (touchStartY - rect.top) / rect.height;
            if (relY > 0.65) {
                this.handleDuck(true);
            } else {
                this.handleJumpPress();
            }
        }, { passive: false });

        container.addEventListener('touchend', () => {
            this.handleDuck(false);
        });

        // Click to play / jump on desktop
        this.canvas.addEventListener('mousedown', (e) => {
            const isModalOpen = document.getElementById('playerNameModal')?.classList.contains('active');
            if (isModalOpen) return;

            if (e.button === 0) {
                this.handleJumpPress();
            }
        });

        // On-screen UI buttons
        const restartBtn = document.getElementById('restartBtn');
        if (restartBtn) {
            restartBtn.addEventListener('click', () => this.reset());
        }

        const muteBtn = document.getElementById('muteBtn');
        if (muteBtn) {
            if (window.soundManager.muted) {
                muteBtn.innerHTML = '🔇 <span class="btn-text">Bật tiếng</span>';
                muteBtn.classList.add('muted');
            }
            muteBtn.addEventListener('click', () => this.toggleMute());
        }

        const pauseBtn = document.getElementById('pauseBtn');
        if (pauseBtn) {
            pauseBtn.addEventListener('click', () => this.togglePause());
        }

        // On-screen touch buttons for mobile
        const btnJumpMobile = document.getElementById('btnJumpMobile');
        const btnDuckMobile = document.getElementById('btnDuckMobile');

        if (btnJumpMobile) {
            btnJumpMobile.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.handleJumpPress();
            });
            btnJumpMobile.addEventListener('mousedown', (e) => {
                e.preventDefault();
                this.handleJumpPress();
            });
        }

        if (btnDuckMobile) {
            btnDuckMobile.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.handleDuck(true);
            });
            btnDuckMobile.addEventListener('touchend', (e) => {
                e.preventDefault();
                this.handleDuck(false);
            });
            btnDuckMobile.addEventListener('mousedown', (e) => {
                e.preventDefault();
                this.handleDuck(true);
            });
            btnDuckMobile.addEventListener('mouseup', (e) => {
                e.preventDefault();
                this.handleDuck(false);
            });
        }
    }

    registerCheatAction(type) {
        if (this.state !== 'PLAYING') return;
        const now = performance.now();

        // 1. Khi đang ở chế độ Transformer: ấn 2 lần nhảy tiếp sẽ đóng cheat code
        if (this.isTransformerCheat) {
            if (type === 'JUMP') {
                if (this.lastJumpTimeInCheat > 0 && (now - this.lastJumpTimeInCheat) < 650) {
                    this.deactivateTransformerCheat();
                    this.lastJumpTimeInCheat = 0;
                    return;
                }
                this.lastJumpTimeInCheat = now;
            }
            return;
        }

        // 2. Khi chưa bật: chuỗi [Nhảy -> Cúi -> Nhảy -> Cúi]
        if (now - this.lastCheatActionTime > 2000) {
            this.cheatInputHistory = [];
        }
        this.lastCheatActionTime = now;
        this.cheatInputHistory.push(type);

        if (this.cheatInputHistory.length > 4) {
            this.cheatInputHistory.shift();
        }

        if (this.cheatInputHistory.length === 4) {
            const [a, b, c, d] = this.cheatInputHistory;
            if (a === 'JUMP' && b === 'DUCK' && c === 'JUMP' && d === 'DUCK') {
                this.activateTransformerCheat();
                this.cheatInputHistory = [];
                this.lastJumpTimeInCheat = 0;
            }
        }
    }

    activateTransformerCheat() {
        this.isTransformerCheat = true;
        this.dino.isJumping = false;
        this.dino.isDucking = false;
        this.dino.vy = 0;
        this.transformerParticles = [];
        this.lastJumpTimeInCheat = 0;
        this.wingAnimFrame = 0;
        this.wingAnimTimer = 0;

        if (window.soundManager && window.soundManager.playTransformer) {
            window.soundManager.playTransformer();
        }
    }

    deactivateTransformerCheat() {
        this.isTransformerCheat = false;
        this.dino.isJumping = true;
        this.dino.vy = 2; // Rơi xuống nhẹ nhàng

        if (window.soundManager && window.soundManager.playPowerDown) {
            window.soundManager.playPowerDown();
        }
    }

    handleJumpPress() {
        if (this.state === 'IDLE') {
            this.reset();
            this.dinoJump();
            return;
        }

        if (this.state === 'GAMEOVER') {
            this.reset();
            return;
        }

        if (this.state === 'PAUSED') {
            this.togglePause();
            return;
        }

        if (this.state === 'PLAYING') {
            this.registerCheatAction('JUMP');
            if (!this.isTransformerCheat) {
                this.dinoJump();
            }
        }
    }

    dinoJump() {
        if (!this.dino.isJumping) {
            this.dino.vy = this.JUMP_FORCE;
            this.dino.isJumping = true;
            this.dino.isDucking = false;
            window.soundManager.playJump();
        }
    }

    handleDuck(isDown) {
        if (this.state !== 'PLAYING') return;

        if (isDown) {
            this.registerCheatAction('DUCK');
        }

        if (this.isTransformerCheat) {
            return; // Khi bay phản lực không cúi dưới đất
        }

        this.dino.isDucking = isDown;
        if (isDown) {
            // Fast drop if in the air
            if (this.dino.isJumping) {
                this.dino.vy += 3.5;
            }
        }
    }

    togglePause() {
        if (this.state === 'PLAYING') {
            this.state = 'PAUSED';
            this.updateHUD();
        } else if (this.state === 'PAUSED') {
            this.state = 'PLAYING';
            this.lastTime = performance.now();
            this.updateHUD();
        }
    }

    toggleMute() {
        const isMuted = window.soundManager.toggleMute();
        const muteBtn = document.getElementById('muteBtn');
        if (muteBtn) {
            muteBtn.innerHTML = isMuted ? '🔇 <span class="btn-text">Bật tiếng</span>' : '🔊 <span class="btn-text">Tắt tiếng</span>';
            muteBtn.classList.toggle('muted', isMuted);
        }
    }

    spawnObstacle() {
        // Wait until minimum distance satisfied
        if (this.obstacleTimer > 0) {
            this.obstacleTimer--;
            return;
        }

        // Difficulty gating: Birds appear after 250 points
        const canSpawnBird = this.score >= 250;
        const typeRoll = Math.random();

        if (canSpawnBird && typeRoll < 0.35) {
            // Pterodactyl Bird with 3 altitude levels
            const altitudes = [
                this.GROUND_Y - 32, // Low: must jump
                this.GROUND_Y - 58, // Mid: duck or jump
                this.GROUND_Y - 82  // High: run under safely
            ];
            const chosenY = altitudes[Math.floor(Math.random() * altitudes.length)];

            this.obstacles.push({
                type: 'BIRD',
                x: this.CANVAS_WIDTH + 20,
                y: chosenY,
                width: 46,
                height: 36,
                animTimer: 0,
                animFrame: 0
            });
        } else {
            // Cacti
            const isLarge = Math.random() > 0.55;
            const clusterSize = Math.random() < 0.65 ? 1 : (Math.random() < 0.85 ? 2 : 3);

            if (isLarge) {
                const count = Math.min(clusterSize, 2); // Max 2 large cacti
                this.obstacles.push({
                    type: 'CACTUS_LARGE',
                    x: this.CANVAS_WIDTH + 20,
                    y: this.GROUND_Y - 50,
                    width: 26 * count,
                    height: 50,
                    count: count
                });
            } else {
                this.obstacles.push({
                    type: 'CACTUS_SMALL',
                    x: this.CANVAS_WIDTH + 20,
                    y: this.GROUND_Y - 36,
                    width: 18 * clusterSize,
                    height: 36,
                    count: clusterSize
                });
            }
        }

        // Distance to next obstacle decreases slightly as speed increases, but keeps jump feasible
        const minGap = 200 + this.speed * 18;
        const randomGap = Math.random() * 220;
        this.obstacleTimer = Math.floor((minGap + randomGap) / this.speed);
    }

    update(delta) {
        if (this.state !== 'PLAYING') return;

        // Update score and speed
        this.score += 0.15;
        this.speed = Math.min(this.MAX_SPEED, this.INITIAL_SPEED + (this.score / 280));

        // Milestone beep & flash every 100 points
        const currentMilestone = Math.floor(this.score / 100);
        if (currentMilestone > this.lastMilestone) {
            this.lastMilestone = currentMilestone;
            this.milestoneFlashTimer = 60; // flash score for ~1s
            window.soundManager.playScore();
        }
        if (this.milestoneFlashTimer > 0) {
            this.milestoneFlashTimer--;
        }

        // Day / Night cycle toggle every 700 points
        const cycle = Math.floor(this.score / 700);
        const shouldBeNight = cycle % 2 === 1;
        if (shouldBeNight !== this.isNight) {
            this.isNight = shouldBeNight;
            this.updateThemeDOM();
        }

        // Smooth night transition
        if (this.isNight && this.nightFade < 1) {
            this.nightFade = Math.min(1, this.nightFade + 0.02);
        } else if (!this.isNight && this.nightFade > 0) {
            this.nightFade = Math.max(0, this.nightFade - 0.02);
        }

        // Dino Physics
        if (this.isTransformerCheat) {
            // Bay lơ lửng phản lực ở độ cao an toàn (y = 110 - 130)
            const targetY = 120 + Math.sin(performance.now() * 0.007) * 7;
            this.dino.y += (targetY - this.dino.y) * 0.12;
            this.dino.vy = 0;
            this.dino.isJumping = false;
            this.dino.isDucking = false;
            this.dino.height = 48;
            this.dino.width = 44;

            // Vỗ cánh
            this.wingAnimTimer += 0.22;
            if (this.wingAnimTimer >= 1) {
                this.wingAnimTimer = 0;
                this.wingAnimFrame = (this.wingAnimFrame + 1) % 2;
            }

            // Sinh hạt khói & lửa phụt ra từ tên lửa ở mông
            const rocketX = this.dino.x - 14;
            const rocketY = this.dino.y + 26;
            for (let k = 0; k < 3; k++) {
                this.transformerParticles.push({
                    x: rocketX,
                    y: rocketY + (Math.random() - 0.5) * 6,
                    vx: -(this.speed * 1.2 + Math.random() * 4),
                    vy: (Math.random() - 0.5) * 2.5,
                    size: Math.random() * 5 + 3,
                    color: ['#ff1744', '#ff9100', '#ffd600', '#00e5ff', '#ffffff'][Math.floor(Math.random() * 5)],
                    life: 1.0
                });
            }
        } else {
            const currentHeight = this.dino.isDucking ? 30 : 48;
            const currentWidth = this.dino.isDucking ? 76 : 44;
            const targetGroundY = this.GROUND_Y - currentHeight;

            if (this.dino.isJumping) {
                const currentGravity = this.dino.isDucking ? this.FAST_DROP_GRAVITY : this.GRAVITY;
                this.dino.vy += currentGravity;
                this.dino.y += this.dino.vy;

                if (this.dino.y >= targetGroundY) {
                    this.dino.y = targetGroundY;
                    this.dino.vy = 0;
                    this.dino.isJumping = false;
                }
            } else {
                this.dino.y = targetGroundY;
                this.dino.vy = 0;
            }

            this.dino.width = currentWidth;
            this.dino.height = currentHeight;
        }

        // Cập nhật các hạt phản lực tên lửa
        for (let i = this.transformerParticles.length - 1; i >= 0; i--) {
            const p = this.transformerParticles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life -= 0.04;
            p.size = Math.max(0.5, p.size * 0.95);
            if (p.life <= 0 || p.x < -30) {
                this.transformerParticles.splice(i, 1);
            }
        }

        // Dino Animation timer
        this.dino.animTimer += this.speed * 0.1;
        if (this.dino.animTimer >= 1) {
            this.dino.animTimer = 0;
            this.dino.animFrame = (this.dino.animFrame + 1) % 2;
        }

        // Update Ground Bumps
        for (let bump of this.groundBumps) {
            bump.x -= this.speed;
            if (bump.x + bump.length * 3 < 0) {
                bump.x = this.CANVAS_WIDTH + Math.random() * 50;
            }
        }

        // Update Clouds
        for (let cloud of this.clouds) {
            cloud.x -= cloud.speed * (this.speed / 6);
            if (cloud.x < -60) {
                cloud.x = this.CANVAS_WIDTH + Math.random() * 100;
                cloud.y = 30 + Math.random() * 80;
            }
        }

        // Update Stars
        if (this.nightFade > 0) {
            for (let star of this.stars) {
                star.x -= 0.2;
                if (star.x < -10) {
                    star.x = this.CANVAS_WIDTH + 10;
                    star.y = 20 + Math.random() * 120;
                }
            }
        }

        // Spawn & Update Obstacles
        this.spawnObstacle();

        for (let i = this.obstacles.length - 1; i >= 0; i--) {
            const obs = this.obstacles[i];
            obs.x -= this.speed;

            if (obs.type === 'BIRD') {
                obs.animTimer += 0.15;
                if (obs.animTimer >= 1) {
                    obs.animTimer = 0;
                    obs.animFrame = (obs.animFrame + 1) % 2;
                }
            }

            // Check collision with Dino
            if (this.checkCollision(this.dino, obs)) {
                this.gameOver();
                return;
            }

            // Remove out-of-screen obstacles
            if (obs.x + obs.width < -30) {
                this.obstacles.splice(i, 1);
            }
        }

        // Update High Score
        if (Math.floor(this.score) > this.highScore) {
            this.highScore = Math.floor(this.score);
            localStorage.setItem('rex_high_score', this.highScore);
        }

        this.updateScoreDisplay();
    }

    checkCollision(dino, obs) {
        // Khi kích hoạt Transformer cheat mode: hoàn toàn bất tử khi bay
        if (this.isTransformerCheat) {
            return false;
        }

        // Accurate hitbox with inset padding to prevent unfair collisions
        let dinoBox = {
            x: dino.x + 6,
            y: dino.y + 6,
            w: dino.width - 12,
            h: dino.height - 10
        };

        if (dino.isDucking) {
            dinoBox = {
                x: dino.x + 8,
                y: dino.y + 6,
                w: dino.width - 16,
                h: dino.height - 8
            };
        }

        let obsBox = {
            x: obs.x + 4,
            y: obs.y + 4,
            w: obs.width - 8,
            h: obs.height - 6
        };

        if (obs.type === 'BIRD') {
            obsBox = {
                x: obs.x + 6,
                y: obs.y + 8,
                w: obs.width - 12,
                h: obs.height - 14
            };
        }

        return (
            dinoBox.x < obsBox.x + obsBox.w &&
            dinoBox.x + dinoBox.w > obsBox.x &&
            dinoBox.y < obsBox.y + obsBox.h &&
            dinoBox.y + dinoBox.h > obsBox.y
        );
    }

    gameOver() {
        this.state = 'GAMEOVER';
        window.soundManager.playHit();
        this.updateHUD();

        // Gửi điểm lên cơ sở dữ liệu Bảng xếp hạng trực tuyến
        const finalScore = Math.floor(this.score);
        if (window.leaderboardManager) {
            window.leaderboardManager.submitNewScore(finalScore).then(() => {
                this.highScore = window.leaderboardManager.player.highScore;
                this.updateScoreDisplay();
            });
        }
    }

    updateThemeDOM() {
        const body = document.body;
        if (this.isNight) {
            body.classList.add('night-theme');
        } else {
            body.classList.remove('night-theme');
        }
    }

    updateScoreDisplay() {
        const scoreElem = document.getElementById('currentScore');
        const hiScoreElem = document.getElementById('highScore');

        const pad = (num) => String(Math.floor(num)).padStart(5, '0');

        if (scoreElem) {
            // Flash on milestone
            if (this.milestoneFlashTimer > 0 && Math.floor(this.milestoneFlashTimer / 8) % 2 === 0) {
                scoreElem.style.visibility = 'hidden';
            } else {
                scoreElem.style.visibility = 'visible';
            }
            scoreElem.textContent = pad(this.score);
        }

        if (hiScoreElem) {
            hiScoreElem.textContent = `HI ${pad(this.highScore)}`;
        }
    }

    updateHUD() {
        const gameOverModal = document.getElementById('gameOverModal');
        const pauseModal = document.getElementById('pauseModal');
        const startPrompt = document.getElementById('startPrompt');

        if (gameOverModal) {
            gameOverModal.style.display = this.state === 'GAMEOVER' ? 'flex' : 'none';
        }
        if (pauseModal) {
            pauseModal.style.display = this.state === 'PAUSED' ? 'flex' : 'none';
        }
        if (startPrompt) {
            startPrompt.style.display = this.state === 'IDLE' ? 'block' : 'none';
        }
    }

    render() {
        const theme = this.nightFade > 0.5 ? 'night' : 'day';
        const ctx = this.ctx;

        // Clear canvas
        ctx.clearRect(0, 0, this.CANVAS_WIDTH, this.CANVAS_HEIGHT);

        // Background color
        if (this.nightFade > 0) {
            ctx.fillStyle = `rgba(32, 33, 36, ${this.nightFade})`;
            ctx.fillRect(0, 0, this.CANVAS_WIDTH, this.CANVAS_HEIGHT);
        }

        // Draw Moon & Stars in night
        if (this.nightFade > 0) {
            ctx.globalAlpha = this.nightFade;
            const moonSprite = window.spriteManager.get('moon', 'night');
            if (moonSprite) {
                ctx.drawImage(moonSprite, this.CANVAS_WIDTH - 120, 35);
            }

            const starSprite = window.spriteManager.get('star', 'night');
            if (starSprite) {
                for (let star of this.stars) {
                    ctx.drawImage(starSprite, star.x, star.y);
                }
            }
            ctx.globalAlpha = 1.0;
        }

        // Draw Clouds
        const cloudSprite = window.spriteManager.get('cloud', theme);
        if (cloudSprite) {
            for (let cloud of this.clouds) {
                ctx.drawImage(cloudSprite, cloud.x, cloud.y);
            }
        }

        // Draw Ground Line
        ctx.strokeStyle = theme === 'day' ? '#535353' : '#a0a0a0';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, this.GROUND_Y);
        ctx.lineTo(this.CANVAS_WIDTH, this.GROUND_Y);
        ctx.stroke();

        // Draw ground bumps / bumps texture
        ctx.fillStyle = theme === 'day' ? '#757575' : '#888888';
        for (let bump of this.groundBumps) {
            ctx.fillRect(bump.x, this.GROUND_Y + 3 + bump.offsetY, bump.length * 2, 2);
        }

        // Draw Obstacles
        for (let obs of this.obstacles) {
            if (obs.type === 'CACTUS_SMALL') {
                const sprite = window.spriteManager.get('cactus_small', theme);
                if (sprite) {
                    for (let c = 0; c < obs.count; c++) {
                        ctx.drawImage(sprite, obs.x + c * 18, obs.y);
                    }
                }
            } else if (obs.type === 'CACTUS_LARGE') {
                const sprite = window.spriteManager.get('cactus_large', theme);
                if (sprite) {
                    for (let c = 0; c < obs.count; c++) {
                        ctx.drawImage(sprite, obs.x + c * 26, obs.y);
                    }
                }
            } else if (obs.type === 'BIRD') {
                const spriteKey = obs.animFrame === 0 ? 'bird_up' : 'bird_down';
                const sprite = window.spriteManager.get(spriteKey, theme);
                if (sprite) {
                    ctx.drawImage(sprite, obs.x, obs.y);
                }
            }
        }

        // Draw Transformer Rocket particles
        for (let p of this.transformerParticles) {
            ctx.save();
            ctx.globalAlpha = Math.max(0, p.life);
            ctx.fillStyle = p.color;
            ctx.fillRect(Math.floor(p.x), Math.floor(p.y), Math.ceil(p.size), Math.ceil(p.size));
            ctx.restore();
        }

        // Draw Dino
        let dinoSpriteKey = 'dino_stand';
        if (this.state === 'GAMEOVER') {
            dinoSpriteKey = 'dino_dead';
        } else if (this.isTransformerCheat) {
            // Khi bay phản lực dùng dáng bay ngầu
            dinoSpriteKey = 'dino_jump';
        } else if (this.dino.isJumping) {
            dinoSpriteKey = 'dino_jump';
        } else if (this.dino.isDucking) {
            dinoSpriteKey = this.dino.animFrame === 0 ? 'dino_duck1' : 'dino_duck2';
        } else if (this.state === 'PLAYING') {
            dinoSpriteKey = this.dino.animFrame === 0 ? 'dino_run1' : 'dino_run2';
        }

        const dinoSprite = window.spriteManager.get(dinoSpriteKey, theme);
        if (dinoSprite) {
            ctx.drawImage(dinoSprite, this.dino.x, this.dino.y);
        }

        // Vẽ Tên lửa ở mông & Đôi cánh Transformer ở lưng khi Cheat Active
        if (this.isTransformerCheat && this.state !== 'GAMEOVER') {
            this.renderTransformerAttachments(ctx, this.dino.x, this.dino.y, theme);
        }
    }

    renderTransformerAttachments(ctx, dx, dy, theme) {
        ctx.save();

        // 1. TÊN LỬA PHẢN LỰC Ở MÔNG (Rocket Booster)
        const rx = dx - 16;
        const ry = dy + 22;

        // Thân ống tên lửa
        ctx.fillStyle = '#37474f';
        ctx.fillRect(rx, ry, 16, 12);
        // Vạch sơn cảnh báo Transformer
        ctx.fillStyle = '#ff1744';
        ctx.fillRect(rx + 4, ry, 3, 12);
        ctx.fillStyle = '#ffea00';
        ctx.fillRect(rx + 9, ry, 3, 12);
        // Vòi phun (Nozzle)
        ctx.fillStyle = '#212121';
        ctx.fillRect(rx - 4, ry + 2, 4, 8);

        // Chùm lửa phản lực nhấp nháy 3 tầng
        const flameLen = 16 + Math.random() * 14;
        // Tầng 1: Đỏ cam ngoài
        ctx.fillStyle = '#ff3d00';
        ctx.beginPath();
        ctx.moveTo(rx - 4, ry + 1);
        ctx.lineTo(rx - 4 - flameLen, ry + 6);
        ctx.lineTo(rx - 4, ry + 11);
        ctx.closePath();
        ctx.fill();

        // Tầng 2: Vàng rực giữa
        ctx.fillStyle = '#ffd600';
        ctx.beginPath();
        ctx.moveTo(rx - 4, ry + 3);
        ctx.lineTo(rx - 4 - flameLen * 0.65, ry + 6);
        ctx.lineTo(rx - 4, ry + 9);
        ctx.closePath();
        ctx.fill();

        // Tầng 3: Lõi plasma xanh cyan
        ctx.fillStyle = '#00e5ff';
        ctx.fillRect(rx - 6, ry + 4, 3, 4);

        // 2. ĐÔI CÁNH ROBOT TRANSFORMER Ở LƯNG (Mechanical Wings)
        const wx = dx + 12;
        const wy = dy + 6;

        if (this.wingAnimFrame === 0) {
            // Frame 0: Cánh giương cao lên trời
            // Khớp nối cơ khí
            ctx.fillStyle = '#546e7a';
            ctx.fillRect(wx + 2, wy + 2, 6, 6);
            // Xương cánh kim loại
            ctx.fillStyle = '#cfd8dc';
            ctx.fillRect(wx - 2, wy - 4, 8, 4);
            ctx.fillRect(wx - 6, wy - 10, 8, 4);
            ctx.fillRect(wx - 10, wy - 16, 8, 4);
            // Lông cánh năng lượng neon
            ctx.fillStyle = '#00e5ff';
            ctx.fillRect(wx - 16, wy - 18, 6, 4);
            ctx.fillRect(wx - 12, wy - 12, 6, 4);
            ctx.fillRect(wx - 8, wy - 6, 6, 4);
            // Viền ánh sáng
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(wx - 14, wy - 16, 2, 2);
            ctx.fillRect(wx - 10, wy - 10, 2, 2);
        } else {
            // Frame 1: Cánh đập ngang đẩy phản lực
            // Khớp nối cơ khí
            ctx.fillStyle = '#546e7a';
            ctx.fillRect(wx + 2, wy + 4, 6, 6);
            // Xương cánh kim loại
            ctx.fillStyle = '#cfd8dc';
            ctx.fillRect(wx - 4, wy + 4, 8, 4);
            ctx.fillRect(wx - 10, wy + 2, 8, 4);
            ctx.fillRect(wx - 16, wy, 8, 4);
            // Lông cánh năng lượng neon
            ctx.fillStyle = '#00e5ff';
            ctx.fillRect(wx - 22, wy + 2, 6, 4);
            ctx.fillRect(wx - 16, wy + 6, 6, 4);
            ctx.fillRect(wx - 10, wy + 8, 6, 4);
            // Viền ánh sáng
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(wx - 20, wy + 4, 2, 2);
        }

        // 3. KÍNH RÂM CYBER NGẦU TRÊN MẮT KHỦNG LONG
        ctx.fillStyle = '#111111';
        ctx.fillRect(dx + 22, dy + 5, 12, 5); // Gọng kính đen
        ctx.fillRect(dx + 33, dy + 6, 3, 3);
        ctx.fillStyle = '#00e5ff'; // Vệt sáng phản quang kính
        ctx.fillRect(dx + 24, dy + 6, 3, 2);
        ctx.fillRect(dx + 29, dy + 6, 3, 2);

        ctx.restore();
    }

    loop(currentTime) {
        const delta = Math.min((currentTime - this.lastTime) / 1000, 0.1);
        this.lastTime = currentTime;

        if (this.state === 'PLAYING') {
            this.update(delta);
        }

        this.render();

        requestAnimationFrame((t) => this.loop(t));
    }
}

// Start game when page loads
window.addEventListener('DOMContentLoaded', () => {
    window.dinoGame = new DinoGame();
});
