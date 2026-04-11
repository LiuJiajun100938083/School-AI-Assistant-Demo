/**
 * 虚拟宠物渲染引擎
 *
 * MVP 阶段使用程序化绘制（彩色几何图形 + 表情），
 * 后期替换为像素风 sprite sheet 即可，接口不变。
 *
 * 公开 API:
 *   PetRenderer.create(canvas, petData) → renderer instance
 *   renderer.setState(animState)
 *   renderer.destroy()
 */
window.PetRenderer = (function () {
    'use strict';

    // ── 颜色调色板 ──
    const COLORS = [
        '#FF6B6B', '#FFA07A', '#FFD93D', '#6BCB77', '#4D96FF',
        '#9B59B6', '#FF85B3', '#00D2FF', '#A8E6CF', '#F8B500',
        '#E17055', '#00CEC9', '#6C5CE7', '#FDCB6E', '#E84393',
    ];

    // ── 眼睛样式 ──
    const EYE_STYLES = ['round', 'big', 'squint', 'star', 'heart', 'cool'];
    // ── 花纹样式 ──
    const PATTERNS = ['none', 'stripes', 'dots', 'stars', 'gradient', 'checker', 'wave', 'diamond'];

    // ── 动画状态 ──
    const ANIM_STATES = {
        idle:    { frames: 4, loop: true,  fps: 3 },
        happy:   { frames: 6, loop: false, fps: 8 },
        pat:     { frames: 4, loop: false, fps: 6 },
        poke:    { frames: 4, loop: false, fps: 8 },
        tickle:  { frames: 6, loop: false, fps: 10 },
        eat:     { frames: 6, loop: false, fps: 6 },
        bath:    { frames: 6, loop: false, fps: 6 },
        sad:     { frames: 4, loop: true,  fps: 2 },
        sleep:   { frames: 4, loop: true,  fps: 1.5 },
    };

    // ── Hit zones (比例坐标) ──
    const HIT_ZONES = {
        head:  { x: 0.25, y: 0.05, w: 0.5,  h: 0.3 },
        body:  { x: 0.15, y: 0.35, w: 0.7,  h: 0.35 },
        belly: { x: 0.2,  y: 0.5,  w: 0.6,  h: 0.25 },
    };

    // ── 体型参数 (宽高比, 圆角) ──
    const BODY_SHAPES = [
        { rx: 0.40, ry: 0.38, round: 1.0 },   // 0: 圆
        { rx: 0.38, ry: 0.35, round: 0.3 },   // 1: 方
        { rx: 0.30, ry: 0.42, round: 0.8 },   // 2: 长
        { rx: 0.44, ry: 0.30, round: 0.8 },   // 3: 扁
        { rx: 0.32, ry: 0.40, round: 0.5 },   // 4: 尖
        { rx: 0.36, ry: 0.40, round: 0.9 },   // 5: 流线
        { rx: 0.44, ry: 0.40, round: 1.0 },   // 6: 胖
        { rx: 0.28, ry: 0.42, round: 0.7 },   // 7: 瘦
    ];

    // ── 耳朵样式 ──
    const EAR_SHAPES = ['pointed', 'round', 'floppy', 'bunny', 'cat', 'none'];
    // ── 尾巴样式 ──
    const TAIL_SHAPES = ['long', 'short', 'fluffy', 'curly', 'striped', 'none'];

    function create(canvas, petData, options) {
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;
        const cx = w / 2;
        const cy = h / 2;

        let animState = 'idle';
        let frame = 0;
        let frameTimer = 0;
        let rafId = null;
        let lastTime = 0;
        let onAnimEnd = null;

        const color = COLORS[petData.color_id % COLORS.length];
        const bodyShape = BODY_SHAPES[petData.body_type % BODY_SHAPES.length];
        const eyeStyle = EYE_STYLES[petData.eyes_id % EYE_STYLES.length];
        const earShape = EAR_SHAPES[petData.ears_id % EAR_SHAPES.length];
        const tailShape = TAIL_SHAPES[petData.tail_id % TAIL_SHAPES.length];
        const patternStyle = PATTERNS[petData.pattern_id % PATTERNS.length];
        const stage = petData.stage || 'adult';
        const mini = options && options.mini;

        function getAnimOffset() {
            const config = ANIM_STATES[animState] || ANIM_STATES.idle;
            const t = frame / Math.max(config.frames - 1, 1);

            switch (animState) {
                case 'idle': return { y: Math.sin(t * Math.PI * 2) * 3, scale: 1, eyeMod: frame === 2 ? 'blink' : '' };
                case 'happy': return { y: -Math.abs(Math.sin(t * Math.PI)) * 20, scale: 1 + Math.sin(t * Math.PI) * 0.05, eyeMod: 'happy' };
                case 'pat': return { y: 0, scale: 1, eyeMod: 'squint' };
                case 'poke': return { y: (frame < 2 ? -15 : 0), scale: 1 + (frame < 2 ? 0.1 : 0), eyeMod: frame < 2 ? 'surprise' : '' };
                case 'tickle': return { y: Math.sin(t * Math.PI * 4) * 5, scale: 1, eyeMod: 'happy', rotate: Math.sin(t * Math.PI * 6) * 0.05 };
                case 'eat': return { y: 0, scale: 1, eyeMod: frame < 4 ? 'happy' : '', mouthOpen: frame >= 1 && frame <= 4 };
                case 'bath': return { y: 0, scale: 1, eyeMod: 'squint', bubbles: true };
                case 'sad': return { y: Math.sin(t * Math.PI * 2) * 2, scale: 0.95, eyeMod: 'sad' };
                case 'sleep': return { y: Math.sin(t * Math.PI * 2) * 2, scale: 1, eyeMod: 'closed', zzz: true };
                default: return { y: 0, scale: 1, eyeMod: '' };
            }
        }

        function drawEgg() {
            const anim = getAnimOffset();
            ctx.clearRect(0, 0, w, h);
            ctx.save();
            ctx.translate(cx, cy + anim.y);

            // Egg shape
            const eggW = w * 0.3;
            const eggH = h * 0.4;
            ctx.beginPath();
            ctx.ellipse(0, 0, eggW, eggH, 0, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
            ctx.strokeStyle = '#2c2c2c';
            ctx.lineWidth = 3;
            ctx.stroke();

            // Crack pattern
            if (petData.growth > 50) {
                ctx.beginPath();
                ctx.moveTo(-eggW * 0.3, -eggH * 0.1);
                ctx.lineTo(0, eggH * 0.05);
                ctx.lineTo(eggW * 0.2, -eggH * 0.15);
                ctx.strokeStyle = '#2c2c2c';
                ctx.lineWidth = 2;
                ctx.stroke();
            }

            ctx.restore();
        }

        function drawPet() {
            const anim = getAnimOffset();
            ctx.clearRect(0, 0, w, h);
            ctx.save();
            ctx.translate(cx, cy + 20 + anim.y);
            if (anim.scale) ctx.scale(anim.scale, anim.scale);
            if (anim.rotate) ctx.rotate(anim.rotate);

            const sizeScale = stage === 'young' ? 0.75 : 1.0;
            const bw = w * bodyShape.rx * sizeScale;
            const bh = h * bodyShape.ry * sizeScale;

            // ── Tail ──
            if (tailShape !== 'none') {
                drawTail(bw, bh, sizeScale);
            }

            // ── Ears ──
            if (earShape !== 'none') {
                drawEars(bw, bh, sizeScale);
            }

            // ── Body ──
            ctx.beginPath();
            ctx.ellipse(0, 0, bw, bh, 0, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
            ctx.strokeStyle = '#2c2c2c';
            ctx.lineWidth = 3;
            ctx.stroke();

            // ── Pattern overlay ──
            drawPattern(bw, bh);

            // ── Eyes ──
            drawEyes(bw, bh, sizeScale, anim.eyeMod);

            // ── Mouth ──
            drawMouth(bw, bh, sizeScale, anim);

            // ── Bubbles (bath) ──
            if (anim.bubbles) {
                for (let i = 0; i < 5; i++) {
                    const bx = (Math.random() - 0.5) * bw * 2;
                    const by = (Math.random() - 0.5) * bh * 2;
                    ctx.beginPath();
                    ctx.arc(bx, by, 4 + Math.random() * 6, 0, Math.PI * 2);
                    ctx.fillStyle = 'rgba(135, 206, 250, 0.5)';
                    ctx.fill();
                    ctx.strokeStyle = 'rgba(100, 180, 240, 0.7)';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                }
            }

            // ── ZZZ (sleep) ──
            if (anim.zzz) {
                ctx.font = `${14 * sizeScale}px sans-serif`;
                ctx.fillStyle = '#666';
                ctx.fillText('Z', bw * 0.6, -bh * 0.8);
                ctx.font = `${18 * sizeScale}px sans-serif`;
                ctx.fillText('Z', bw * 0.8, -bh * 1.1);
                ctx.font = `${22 * sizeScale}px sans-serif`;
                ctx.fillText('Z', bw, -bh * 1.4);
            }

            ctx.restore();
        }

        function drawEars(bw, bh, s) {
            ctx.save();
            const earSize = bw * 0.35;
            ctx.fillStyle = color;
            ctx.strokeStyle = '#2c2c2c';
            ctx.lineWidth = 2.5;

            if (earShape === 'pointed' || earShape === 'cat') {
                // Left
                ctx.beginPath();
                ctx.moveTo(-bw * 0.6, -bh * 0.4);
                ctx.lineTo(-bw * 0.3, -bh * 1.1);
                ctx.lineTo(-bw * 0.05, -bh * 0.5);
                ctx.closePath();
                ctx.fill(); ctx.stroke();
                // Right
                ctx.beginPath();
                ctx.moveTo(bw * 0.6, -bh * 0.4);
                ctx.lineTo(bw * 0.3, -bh * 1.1);
                ctx.lineTo(bw * 0.05, -bh * 0.5);
                ctx.closePath();
                ctx.fill(); ctx.stroke();
            } else if (earShape === 'round') {
                ctx.beginPath();
                ctx.arc(-bw * 0.55, -bh * 0.7, earSize * 0.6, 0, Math.PI * 2);
                ctx.fill(); ctx.stroke();
                ctx.beginPath();
                ctx.arc(bw * 0.55, -bh * 0.7, earSize * 0.6, 0, Math.PI * 2);
                ctx.fill(); ctx.stroke();
            } else if (earShape === 'floppy') {
                ctx.beginPath();
                ctx.ellipse(-bw * 0.7, -bh * 0.2, earSize * 0.35, earSize * 0.8, -0.3, 0, Math.PI * 2);
                ctx.fill(); ctx.stroke();
                ctx.beginPath();
                ctx.ellipse(bw * 0.7, -bh * 0.2, earSize * 0.35, earSize * 0.8, 0.3, 0, Math.PI * 2);
                ctx.fill(); ctx.stroke();
            } else if (earShape === 'bunny') {
                ctx.beginPath();
                ctx.ellipse(-bw * 0.3, -bh * 1.2, earSize * 0.25, earSize, 0, 0, Math.PI * 2);
                ctx.fill(); ctx.stroke();
                ctx.beginPath();
                ctx.ellipse(bw * 0.3, -bh * 1.2, earSize * 0.25, earSize, 0, 0, Math.PI * 2);
                ctx.fill(); ctx.stroke();
            }
            ctx.restore();
        }

        function drawTail(bw, bh, s) {
            ctx.save();
            ctx.strokeStyle = color;
            ctx.lineWidth = 6 * s;
            ctx.lineCap = 'round';

            const tx = bw * 0.9;
            const ty = bh * 0.2;

            if (tailShape === 'long' || tailShape === 'striped') {
                ctx.beginPath();
                ctx.moveTo(tx, ty);
                ctx.quadraticCurveTo(tx + 40 * s, ty - 30 * s, tx + 50 * s, ty + 10 * s);
                ctx.stroke();
            } else if (tailShape === 'short') {
                ctx.beginPath();
                ctx.moveTo(tx, ty);
                ctx.lineTo(tx + 20 * s, ty - 10 * s);
                ctx.stroke();
            } else if (tailShape === 'fluffy') {
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.arc(tx + 15 * s, ty, 12 * s, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#2c2c2c';
                ctx.lineWidth = 2;
                ctx.stroke();
            } else if (tailShape === 'curly') {
                ctx.beginPath();
                ctx.moveTo(tx, ty);
                ctx.bezierCurveTo(tx + 30 * s, ty - 40 * s, tx + 50 * s, ty + 20 * s, tx + 25 * s, ty + 10 * s);
                ctx.stroke();
            }
            ctx.restore();
        }

        function drawPattern(bw, bh) {
            if (patternStyle === 'none') return;
            ctx.save();
            ctx.globalAlpha = 0.2;
            ctx.fillStyle = '#000';

            if (patternStyle === 'stripes') {
                for (let i = -3; i <= 3; i++) {
                    ctx.fillRect(-bw + 10, i * bh * 0.25 - 2, bw * 2 - 20, 4);
                }
            } else if (patternStyle === 'dots') {
                for (let i = 0; i < 8; i++) {
                    const dx = (Math.sin(i * 1.7) * bw * 0.6);
                    const dy = (Math.cos(i * 2.3) * bh * 0.6);
                    ctx.beginPath();
                    ctx.arc(dx, dy, 5, 0, Math.PI * 2);
                    ctx.fill();
                }
            } else if (patternStyle === 'stars') {
                ctx.font = '14px sans-serif';
                ctx.fillStyle = 'rgba(255,255,255,0.4)';
                ctx.globalAlpha = 1;
                for (let i = 0; i < 5; i++) {
                    const sx = (Math.sin(i * 2.1) * bw * 0.5);
                    const sy = (Math.cos(i * 1.8) * bh * 0.5);
                    ctx.fillText('\u2605', sx - 5, sy + 5);
                }
            }
            ctx.restore();
        }

        function drawEyes(bw, bh, s, mod) {
            const eyeX = bw * 0.3;
            const eyeY = -bh * 0.2;
            const eyeSize = 8 * s;

            if (mod === 'closed' || mod === 'blink') {
                ctx.strokeStyle = '#2c2c2c';
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.moveTo(-eyeX - eyeSize, eyeY);
                ctx.lineTo(-eyeX + eyeSize, eyeY);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(eyeX - eyeSize, eyeY);
                ctx.lineTo(eyeX + eyeSize, eyeY);
                ctx.stroke();
                return;
            }

            if (mod === 'squint' || mod === 'happy') {
                ctx.strokeStyle = '#2c2c2c';
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.arc(-eyeX, eyeY + 3, eyeSize, Math.PI, 0);
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(eyeX, eyeY + 3, eyeSize, Math.PI, 0);
                ctx.stroke();
                return;
            }

            if (mod === 'surprise') {
                ctx.fillStyle = '#2c2c2c';
                ctx.beginPath();
                ctx.arc(-eyeX, eyeY, eyeSize * 1.3, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.arc(eyeX, eyeY, eyeSize * 1.3, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = 'white';
                ctx.beginPath();
                ctx.arc(-eyeX + 2, eyeY - 2, 3, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.arc(eyeX + 2, eyeY - 2, 3, 0, Math.PI * 2);
                ctx.fill();
                return;
            }

            if (mod === 'sad') {
                ctx.fillStyle = '#2c2c2c';
                ctx.beginPath();
                ctx.arc(-eyeX, eyeY, eyeSize * 0.8, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.arc(eyeX, eyeY, eyeSize * 0.8, 0, Math.PI * 2);
                ctx.fill();
                // Eyebrows
                ctx.strokeStyle = '#2c2c2c';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(-eyeX - eyeSize, eyeY - eyeSize * 1.5);
                ctx.lineTo(-eyeX + eyeSize, eyeY - eyeSize * 1.2);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(eyeX - eyeSize, eyeY - eyeSize * 1.2);
                ctx.lineTo(eyeX + eyeSize, eyeY - eyeSize * 1.5);
                ctx.stroke();
                return;
            }

            // Default eyes
            ctx.fillStyle = '#2c2c2c';
            ctx.beginPath();
            ctx.arc(-eyeX, eyeY, eyeSize, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(eyeX, eyeY, eyeSize, 0, Math.PI * 2);
            ctx.fill();
            // Highlights
            ctx.fillStyle = 'white';
            ctx.beginPath();
            ctx.arc(-eyeX + 2 * s, eyeY - 2 * s, 3 * s, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(eyeX + 2 * s, eyeY - 2 * s, 3 * s, 0, Math.PI * 2);
            ctx.fill();
        }

        function drawMouth(bw, bh, s, anim) {
            const my = bh * 0.15;
            ctx.strokeStyle = '#2c2c2c';
            ctx.lineWidth = 2;

            if (anim.mouthOpen) {
                ctx.beginPath();
                ctx.arc(0, my, 8 * s, 0, Math.PI);
                ctx.fillStyle = '#ff6666';
                ctx.fill();
                ctx.stroke();
            } else if (anim.eyeMod === 'happy' || animState === 'tickle') {
                ctx.beginPath();
                ctx.arc(0, my - 2, 10 * s, 0.1, Math.PI - 0.1);
                ctx.stroke();
            } else if (anim.eyeMod === 'sad') {
                ctx.beginPath();
                ctx.arc(0, my + 8, 8 * s, Math.PI + 0.3, -0.3);
                ctx.stroke();
            } else {
                ctx.beginPath();
                ctx.arc(0, my, 6 * s, 0.2, Math.PI - 0.2);
                ctx.stroke();
            }
        }

        function render() {
            if (stage === 'egg') {
                drawEgg();
            } else {
                drawPet();
            }
        }

        function tick(time) {
            if (!lastTime) lastTime = time;
            const dt = (time - lastTime) / 1000;
            lastTime = time;

            const config = ANIM_STATES[animState] || ANIM_STATES.idle;
            frameTimer += dt;
            if (frameTimer >= 1 / config.fps) {
                frameTimer = 0;
                frame++;
                if (frame >= config.frames) {
                    if (config.loop) {
                        frame = 0;
                    } else {
                        frame = config.frames - 1;
                        if (onAnimEnd) {
                            onAnimEnd();
                            onAnimEnd = null;
                        }
                        animState = 'idle';
                        frame = 0;
                    }
                }
            }

            render();
            rafId = requestAnimationFrame(tick);
        }

        function setState(state, callback) {
            if (!ANIM_STATES[state]) state = 'idle';
            animState = state;
            frame = 0;
            frameTimer = 0;
            onAnimEnd = callback || null;
        }

        function detectHitZone(offsetX, offsetY) {
            const rx = offsetX / canvas.clientWidth;
            const ry = offsetY / canvas.clientHeight;
            for (const [zone, rect] of Object.entries(HIT_ZONES)) {
                if (rx >= rect.x && rx <= rect.x + rect.w &&
                    ry >= rect.y && ry <= rect.y + rect.h) {
                    return zone;
                }
            }
            return null;
        }

        // ── Pointer interaction ──
        if (!mini) {
            canvas.addEventListener('pointerdown', function (e) {
                e.preventDefault();
                const zone = detectHitZone(e.offsetX, e.offsetY);
                switch (zone) {
                    case 'head': setState('pat'); break;
                    case 'body': setState('poke'); break;
                    case 'belly': setState('tickle'); break;
                    default: setState('happy'); break;
                }
            });
        } else {
            // Mini mode: click to navigate
            canvas.style.cursor = 'pointer';
        }

        // ── Start animation ──
        rafId = requestAnimationFrame(tick);

        // ── Auto-select state based on pet attributes ──
        if (petData.hunger < 20 || petData.hygiene < 20) {
            setState('sad');
        }

        return {
            setState: setState,
            render: render,
            destroy: function () {
                if (rafId) cancelAnimationFrame(rafId);
            },
        };
    }

    return { create: create };
})();
