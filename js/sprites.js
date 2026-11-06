// Retro Pixel Art Sprite Generator for Dino Runner
// Pre-renders all assets into high-performance offscreen canvases for 60fps rendering

class SpriteManager {
    constructor() {
        this.cache = {};
        this.colors = {
            day: '#535353',
            night: '#e0e0e0',
            deadEye: '#ffffff',
            groundDay: '#757575',
            groundNight: '#9e9e9e'
        };
        this.initSprites();
    }

    createOffscreen(w, h, drawFn) {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        drawFn(ctx);
        return canvas;
    }

    // Helper to render pixel matrix where '#' = color, '.' = white/eye, ' ' = transparent
    renderMatrix(matrix, color, eyeColor, scale = 2) {
        const rows = matrix.length;
        const cols = matrix[0].length;
        return this.createOffscreen(cols * scale, rows * scale, (ctx) => {
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const char = matrix[r][c];
                    if (char === '#') {
                        ctx.fillStyle = color;
                        ctx.fillRect(c * scale, r * scale, scale, scale);
                    } else if (char === '.') {
                        ctx.fillStyle = eyeColor;
                        ctx.fillRect(c * scale, r * scale, scale, scale);
                    }
                }
            }
        });
    }

    initSprites() {
        // T-Rex Normal / Run Matrix (22 cols x 24 rows) -> scaled x2 = 44x48
        const dinoBase = [
            "            ##########",
            "           ###########",
            "           ##.########",
            "           ###########",
            "           ###########",
            "           #####      ",
            "           #########  ",
            "#         ##########  ",
            "##       ###########  ",
            "###     ############  ",
            "###### #############  ",
            "###################   ",
            " #################    ",
            "  ###############     ",
            "   #############      ",
            "    ###########       ",
            "     #########        ",
            "      #######         ",
            "       #####          "
        ];

        // Legs for Run 1
        const dinoRun1 = [
            ...dinoBase,
            "       ##   #         ",
            "       #    #         ",
            "       #              ",
            "       ##             ",
            "       ###            "
        ];

        // Legs for Run 2
        const dinoRun2 = [
            ...dinoBase,
            "       #    ##        ",
            "       #    #         ",
            "            #         ",
            "            ##        ",
            "            ###       "
        ];

        // Legs for Jump
        const dinoJump = [
            ...dinoBase,
            "       #    #         ",
            "       #    #         ",
            "       #    #         ",
            "       ##   ##        ",
            "       ###  ###       "
        ];

        // Dead Dino (eye open wide / with hollow center)
        const dinoDead = [
            "            ##########",
            "           ###########",
            "           #...#######",
            "           #...#######",
            "           ###########",
            "           #####      ",
            "           #########  ",
            "#         ##########  ",
            "##       ###########  ",
            "###     ############  ",
            "###### #############  ",
            "###################   ",
            " #################    ",
            "  ###############     ",
            "   #############      ",
            "    ###########       ",
            "     #########        ",
            "      #######         ",
            "       #####          ",
            "       ##   ##        ",
            "       #    #         ",
            "       #    #         ",
            "       ##   ##        ",
            "       ###  ###       "
        ];

        // Ducking Dino (30 cols x 15 rows) -> scaled x2 = 60x30
        const dinoDuckBase = [
            "                         #############",
            "                        ##############",
            "                        ##.###########",
            "                        ##############",
            "                        ##############",
            "#                       #######       ",
            "##                     ###############",
            "###                   ################",
            "######################################",
            " #####################################",
            "  ################################### ",
            "   #################################  ",
            "    ###############################   "
        ];

        const dinoDuck1 = [
            ...dinoDuckBase,
            "       ###             ##             ",
            "       #                #             "
        ];

        const dinoDuck2 = [
            ...dinoDuckBase,
            "        ##            ###             ",
            "         #              #             "
        ];

        // Small Cactus (9 cols x 18 rows) -> 18x36
        const cactusSmall = [
            "   ###   ",
            "   ###   ",
            " # ###   ",
            " # ### # ",
            " # ### # ",
            " # ### # ",
            " ##### # ",
            "   ##### ",
            "   ###   ",
            "   ###   ",
            "   ###   ",
            "   ###   ",
            "   ###   ",
            "   ###   ",
            "   ###   ",
            "   ###   ",
            "   ###   ",
            "   ###   "
        ];

        // Large Cactus (13 cols x 25 rows) -> 26x50
        const cactusLarge = [
            "    #####    ",
            "    #####    ",
            "    #####    ",
            " ## #####    ",
            " ## ##### ## ",
            " ## ##### ## ",
            " ## ##### ## ",
            " ## ##### ## ",
            " #######  ## ",
            "    ######## ",
            "    #####    ",
            "    #####    ",
            "    #####    ",
            "    #####    ",
            "    #####    ",
            "    #####    ",
            "    #####    ",
            "    #####    ",
            "    #####    ",
            "    #####    ",
            "    #####    ",
            "    #####    ",
            "    #####    ",
            "    #####    ",
            "    #####    "
        ];

        // Pterodactyl Bird (23 cols x 18 rows) -> 46x36 px chuẩn mực Chrome Dino
        const birdWingUp = [
            "                 ##    ",
            "                ####   ",
            "               ######  ",
            "              #######  ",
            "             ########  ",
            "            #########  ",
            "  ##       ##########  ",
            " ####     ###########  ",
            "#######. ############  ",
            "###################### ",
            " ###################   ",
            "  ######  ##########   ",
            "   ####     #######    ",
            "    ##       ####      ",
            "              ##       ",
            "                       ",
            "                       ",
            "                       "
        ];

        const birdWingDown = [
            "                       ",
            "                       ",
            "                       ",
            "                       ",
            "                       ",
            "                       ",
            "  ##                   ",
            " ####                  ",
            "#######.               ",
            "###################### ",
            " ###################   ",
            "  ######  ##########   ",
            "   ####  ############  ",
            "    ##   ###########   ",
            "         ##########    ",
            "          ########     ",
            "           ######      ",
            "            ####       "
        ];

        // Cloud (24 cols x 7 rows) -> 48x14
        const cloud = [
            "       ######           ",
            "     ##########         ",
            "   ##############  ###  ",
            "  ##################### ",
            " ###################### ",
            "########################",
            " ###################### "
        ];

        // Star (5x5)
        const star = [
            "  #  ",
            " ### ",
            "#####",
            " ### ",
            "  #  "
        ];

        // Moon (10x15)
        const moon = [
            "   ###### ",
            "  ########",
            " ####  ###",
            "####      ",
            "###       ",
            "###       ",
            "###       ",
            "###       ",
            "###       ",
            "###       ",
            "####      ",
            " ####  ###",
            "  ########",
            "   ###### ",
            "     ###  "
        ];

        // Pre-render into 'day' and 'night' sprite variants
        ['day', 'night'].forEach(theme => {
            const color = this.colors[theme];
            const eyeColor = theme === 'day' ? '#ffffff' : '#202124';

            this.cache[`dino_stand_${theme}`] = this.renderMatrix(dinoJump, color, eyeColor);
            this.cache[`dino_run1_${theme}`] = this.renderMatrix(dinoRun1, color, eyeColor);
            this.cache[`dino_run2_${theme}`] = this.renderMatrix(dinoRun2, color, eyeColor);
            this.cache[`dino_jump_${theme}`] = this.renderMatrix(dinoJump, color, eyeColor);
            this.cache[`dino_dead_${theme}`] = this.renderMatrix(dinoDead, color, eyeColor);
            this.cache[`dino_duck1_${theme}`] = this.renderMatrix(dinoDuck1, color, eyeColor);
            this.cache[`dino_duck2_${theme}`] = this.renderMatrix(dinoDuck2, color, eyeColor);

            this.cache[`cactus_small_${theme}`] = this.renderMatrix(cactusSmall, color, eyeColor);
            this.cache[`cactus_large_${theme}`] = this.renderMatrix(cactusLarge, color, eyeColor);

            this.cache[`bird_up_${theme}`] = this.renderMatrix(birdWingUp, color, eyeColor);
            this.cache[`bird_down_${theme}`] = this.renderMatrix(birdWingDown, color, eyeColor);

            this.cache[`cloud_${theme}`] = this.renderMatrix(cloud, theme === 'day' ? '#c8c8c8' : '#606060', eyeColor);
            this.cache[`star_${theme}`] = this.renderMatrix(star, '#ffd700', eyeColor, 2);
            this.cache[`moon_${theme}`] = this.renderMatrix(moon, '#f5f5f5', eyeColor, 2);
        });
    }

    get(name, theme = 'day') {
        return this.cache[`${name}_${theme}`];
    }
}

window.spriteManager = new SpriteManager();
