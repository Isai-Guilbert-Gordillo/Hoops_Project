// RETRO HOOPS · index — lógica de página (concatenación de los 3 <script> inline en orden).

// ---- bloque inline #1 ----
    (function () {
        const root = document.getElementById('hoops-arcade');
        if (!root) return;
        const canvas = document.getElementById('ag-canvas');
        if (!canvas || !canvas.getContext) return;
        const ctx = canvas.getContext('2d');
        const scoreEl = document.getElementById('ag-score');
        const streakEl = document.getElementById('ag-streak');
        const hintEl = document.getElementById('ag-hint');
        const muteBtn = document.getElementById('ag-mute');

        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        // Mundo lógico fijo (400x300, apaisado 4:3). El canvas se escala por CSS.
        const W = 400, H = 300;
        let dpr = Math.min(window.devicePixelRatio || 1, 2);
        function setupCanvas() {
            canvas.width = W * dpr;
            canvas.height = H * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
        setupCanvas();
        window.addEventListener('resize', () => {
            const d = Math.min(window.devicePixelRatio || 1, 2);
            if (d !== dpr) { dpr = d; setupCanvas(); }
        });

        // Paleta del juego (literales; alineados a la paleta del theme.css).
        const C = { orange:'#ff6a00', orange2:'#ff8c1a', pink:'#ff2e9f', cyan:'#00f0ff', gold:'#ffd700', purple:'#7b2ff7', purpleDeep:'#190a2e' };

        // ---- Geometría del aro (vista lateral; tablero a la derecha) ----
        const rimFront = 248, rimBack = 292, backboardX = 292;
        // Posición base del aro/tablero. rimY/bbTop/bbBottom son MUTABLES porque el
        // aro oscila verticalmente conforme sube la dificultad (ver updateHoop()).
        const rimYBase = 112, bbTopBase = 28, bbBottomBase = 115;
        let rimY = rimYBase, bbTop = bbTopBase, bbBottom = bbBottomBase;
        let hoopPhase = 0;
        const ballR = 13, floorY = H - 6;

        const threeLineX = 50;
        // Spots ordenados de CERCA (x grande) a LEJOS (x chica). La dificultad
        // escala corriendo la ventana de selección hacia los lejanos según el
        // puntaje (ver difficultyLevel/nextSpot).
        const spots = [200, 160, 140, 120, 90, 45, 32].map(x => ({ x, three: x < threeLineX }));

        // ---- Estado del juego (todo en memoria) ----
        const ball = { x:0, y:0, vx:0, vy:0, scored:false, wasThree:false };
        let state = 'ready';
        let curSpot = spots[0], spotIdx = 0;
        let score = 0, streak = 0;
        let aimStart = null, aimNow = null;
        let particles = [], rimFlash = 0, floatText = null;
        let firstShot = false, muted = false, resetScheduled = false;
        // Récord (máximo histórico) persistido en el navegador, y total de canastas
        // para el desbloqueo del registro (ese contador NO se reinicia al fallar).
        let record = parseInt(localStorage.getItem('kphoops_hoop_record') || '0', 10) || 0;
        let totalMade = 0;
        // Toques puramente visuales (no tocan la física del tiro):
        let ballSpin = 0;   // ángulo acumulado del giro del balón en vuelo
        let netSway = 0;    // la red "vibra" un instante al anotar
        let shake = 0;      // sacudida de cámara sutil en triples/rachas

        const g = 0.35, K = 0.14, MAXV = 15, MINV = 3;

        function placeBall() {
            curSpot = spots[spotIdx % spots.length];
            ball.x = curSpot.x; ball.y = floorY - ballR; ball.vx = 0; ball.vy = 0;
            ball.scored = false; state = 'ready';
        }
        // Nivel de dificultad: sube un escalón cada 3 puntos del marcador actual
        // (que se reinicia al fallar), así cada partida se endurece rápido.
        function difficultyLevel() { return Math.floor(score / 3); }

        function nextSpot() {
            // La ventana de spots posibles se desplaza hacia los tiros lejanos
            // conforme sube el nivel: nivel 0 = tiros cercanos; niveles altos =
            // solo triples desde el fondo.
            const lvl = difficultyLevel();
            const minIdx = Math.min(lvl, spots.length - 2);
            const maxIdx = Math.min(minIdx + 2, spots.length - 1);
            let idx = spotIdx;
            for (let t = 0; t < 8 && idx === spotIdx; t++) {
                idx = minIdx + Math.floor(Math.random() * (maxIdx - minIdx + 1));
            }
            spotIdx = idx;
            placeBall();
        }
        placeBall();
        updateStreak(); // muestra "RÉCORD: N" desde el inicio

        // ---- Sonido retro ----
        function swish() {
            if (muted) return;
            const audioSwish = new Audio('/sounds/swish.mp3');
            audioSwish.volume = 0.5;
            audioSwish.play().catch(e => console.log("Error al reproducir:", e));
        }
        function clank() {
            if (muted) return;
            const audioClank = new Audio('/sounds/clank.mp3');
            audioClank.volume = 0.5;
            audioClank.play().catch(e => console.log("Error al reproducir:", e));
        }
        function playCelebration() {
            if (muted) return;
            const audioCelebrate = new Audio('/sounds/celebracion.mp3');
            audioCelebrate.volume = 0.7;
            audioCelebrate.play().catch(e => console.log("Error al reproducir:", e));
        }
        function playBoo() {
            if (muted) return;
            const audioBoo = new Audio('/sounds/abucheo.mp3');
            audioBoo.volume = 0.7;
            audioBoo.play().catch(e => console.log("Error al reproducir:", e));
        }

        const ICON_SND  = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a9 9 0 0 1 0 14"/></svg>';
        const ICON_MUTE = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M22 9l-6 6"/><path d="M16 9l6 6"/></svg>';
        function paintMute() { muteBtn.innerHTML = muted ? ICON_MUTE : ICON_SND; muteBtn.setAttribute('aria-pressed', String(muted)); }
        muteBtn.addEventListener('click', () => { muted = !muted; paintMute(); });
        paintMute();

        // ---- Puntería (arrastrar y soltar) ----
        function toWorld(e) {
            const r = canvas.getBoundingClientRect();
            return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
        }
        function launchVec() {
            let vx = (aimNow.x - aimStart.x) * K, vy = (aimNow.y - aimStart.y) * K;
            const m = Math.hypot(vx, vy);
            if (m > MAXV) { vx *= MAXV / m; vy *= MAXV / m; return { vx, vy, mag: MAXV }; }
            return { vx, vy, mag: m };
        }
        canvas.addEventListener('pointerdown', (e) => {
            if (state !== 'ready') return;
            aimStart = { x: ball.x, y: ball.y }; aimNow = toWorld(e); state = 'aiming';
            try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
            e.preventDefault();
        });
        canvas.addEventListener('pointermove', (e) => { if (state === 'aiming') { aimNow = toWorld(e); e.preventDefault(); } });
        canvas.addEventListener('pointercancel', () => { if (state === 'aiming') { state = 'ready'; aimStart = aimNow = null; } });
        window.addEventListener('pointerup', (e) => {
            if (state !== 'aiming') return;
            const v = launchVec();
            if (v.mag < MINV) { state = 'ready'; aimStart = aimNow = null; return; }
            ball.vx = v.vx; ball.vy = v.vy; ball.scored = false; ball.wasThree = curSpot.three;
            state = 'flying'; aimStart = aimNow = null;
            if (!firstShot) { firstShot = true; hintEl.classList.add('gone'); }
        });

        // ---- Física ----
        function reflect(nx, ny, damp) {
            const dot = ball.vx * nx + ball.vy * ny;
            ball.vx = (ball.vx - 2 * dot * nx) * damp;
            ball.vy = (ball.vy - 2 * dot * ny) * damp;
        }
        function updateStreak() {
            const parts = ['RÉCORD: ' + record];
            if (streak >= 2) parts.push('¡RACHA x' + streak + '!');
            streakEl.textContent = parts.join('   ·   ');
        }
        function onScore(is3) {
            const pts = is3 ? 3 : 2;
            score += pts; streak++; totalMade++;
            scoreEl.textContent = score;
            if (score > record) {
                record = score;
                try { localStorage.setItem('kphoops_hoop_record', String(record)); } catch (e) {}
            }
            updateStreak();
            window.dispatchEvent(new CustomEvent('hoops:score', { detail: { score: score, total: totalMade } }));
            if (!reduceMotion) {
                rimFlash = 26;
                netSway = 16;
                shake = is3 ? 7 : 4;
                const onFire = streak >= 3;
                const palette = is3 ? [C.orange, C.orange2, C.gold] : [C.cyan, C.pink];
                const burst = is3 ? 26 : 18;
                for (let i = 0; i < burst; i++) {
                    const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * (is3 ? 4 : 3);
                    particles.push({
                        x: (rimFront + rimBack) / 2, y: rimY,
                        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.4,
                        life: 30 + Math.random() * 22,
                        color: onFire ? C.gold : palette[i % palette.length],
                        size: 1.4 + Math.random() * 1.6,
                        spin: (Math.random() - 0.5) * 0.4,
                        shape: Math.random() < 0.35 ? 'spark' : 'dot'
                    });
                }
            }
            floatText = {
                x: (rimFront + rimBack) / 2, y: rimY - 14, txt: '+' + pts,
                life: reduceMotion ? 20 : 42, color: is3 ? C.orange : C.cyan,
                big: is3
            };
            swish();
            if (score > 0 && score % 10 === 0) { playCelebration(); }
        }
        function scheduleReset(made) {
            if (resetScheduled) return;
            resetScheduled = true;
            if (!made) {
                // FALLO: se acaba la partida. El marcador vuelve a 0 (el récord ya
                // quedó guardado). Lo divertido es superar tu propio récord.
                const lost = score;
                streak = 0; score = 0; scoreEl.textContent = 0; updateStreak();
                if (lost > 0) {
                    playBoo();
                    // Centrado en la cancha (al fallar, el balón ya salió de pantalla).
                    floatText = {
                        x: W / 2, y: H / 2, txt: '¡FALLASTE!',
                        life: reduceMotion ? 26 : 54, color: C.pink, big: true
                    };
                }
            }
            setTimeout(() => { resetScheduled = false; nextSpot(); }, made ? 700 : 550);
        }
        function step() {
            if (state !== 'flying') return;
            const prevY = ball.y;
            ball.vy += g; ball.x += ball.vx; ball.y += ball.vy;
            ballSpin += ball.vx * 0.08;

            if (ball.vx > 0 && ball.x + ballR >= backboardX && ball.y >= bbTop && ball.y <= bbBottom) {
                ball.x = backboardX - ballR; ball.vx = -Math.abs(ball.vx) * 0.6; if (!ball.scored) clank();
            }
            // No se puede colar desde abajo: si el balón SUBE y cruza la boca del
            // aro, rebota contra la parte inferior del aro (como en la realidad).
            // Solo cuenta canasta al bajar (vy > 0) entrando desde arriba.
            if (ball.vy < 0 && prevY >= rimY && ball.y < rimY && ball.x > rimFront + 3 && ball.x < rimBack - 3) {
                ball.y = rimY; ball.vy = Math.abs(ball.vy) * 0.5; if (!ball.scored) clank();
            }
            if (!ball.scored && ball.vy > 0 && prevY < rimY && ball.y >= rimY && ball.x > rimFront + 3 && ball.x < rimBack - 3) {
                ball.scored = true; onScore(ball.wasThree);
            }
            [[rimFront, rimY], [rimBack, rimY]].forEach(([px, py]) => {
                const dx = ball.x - px, dy = ball.y - py, dist = Math.hypot(dx, dy);
                if (dist < ballR + 2 && dist > 0.01) {
                    const nx = dx / dist, ny = dy / dist;
                    reflect(nx, ny, 0.55);
                    ball.x = px + nx * (ballR + 2); ball.y = py + ny * (ballR + 2);
                    if (!ball.scored) clank();
                }
            });
            if (ball.y > H + 40 || ball.x < -40 || ball.x > W + 40) scheduleReset(ball.scored);
        }

        // ---- Dibujo ----
        function circle(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); }
        function drawHoop() {
            // Tablero: vidrio con leve tinte + brillo diagonal (reflejo)
            ctx.save();
            ctx.shadowColor = C.cyan; ctx.shadowBlur = reduceMotion ? 0 : 8;
            const bbGrd = ctx.createLinearGradient(backboardX, bbTop, backboardX + 12, bbBottom);
            bbGrd.addColorStop(0, 'rgba(0,240,255,0.18)');
            bbGrd.addColorStop(0.45, 'rgba(10,7,20,0.92)');
            bbGrd.addColorStop(1, 'rgba(10,7,20,0.92)');
            ctx.fillStyle = bbGrd;
            ctx.strokeStyle = C.cyan; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.rect(backboardX, bbTop, 12, bbBottom - bbTop); ctx.fill(); ctx.stroke();
            ctx.shadowBlur = 0; ctx.strokeStyle = 'rgba(0,240,255,0.6)'; ctx.lineWidth = 1.5;
            ctx.strokeRect(backboardX - 0, bbBottom - 44, 12, 26);
            ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(backboardX + 2, bbTop + 4); ctx.lineTo(backboardX + 8, bbTop + 16); ctx.stroke();
            ctx.restore();

            // Aro: brilla más fuerte un instante al anotar
            ctx.save();
            const flash = rimFlash > 0 ? 1 : 0;
            ctx.shadowColor = C.orange; ctx.shadowBlur = reduceMotion ? 0 : (flash ? 16 : 6);
            ctx.strokeStyle = flash ? C.orange2 : C.orange; ctx.lineWidth = flash ? 5 : 3.5;
            ctx.beginPath(); ctx.moveTo(rimFront, rimY); ctx.lineTo(rimBack, rimY); ctx.stroke();
            ctx.fillStyle = C.orange; circle(rimFront, rimY, 3); ctx.fill();
            ctx.restore();

            // Onda expansiva dorada al anotar (el "impacto" del swish)
            if (rimFlash > 0 && !reduceMotion) {
                const p = 1 - rimFlash / 26;
                ctx.save();
                ctx.globalAlpha = (1 - p) * 0.65;
                ctx.strokeStyle = C.gold; ctx.lineWidth = 2;
                circle((rimFront + rimBack) / 2, rimY, 6 + p * 24);
                ctx.stroke();
                ctx.restore();
            }

            // Red: ondula un instante tras anotar (netSway) en vez de quedarse rígida
            const swayAmt = netSway > 0 ? Math.sin(netSway * 0.9) * (netSway / 16) * 4 : 0;
            ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
            const netH = 26, seg = 6;
            for (let i = 0; i <= seg; i++) {
                const t = i / seg, topX = rimFront + (rimBack - rimFront) * t;
                const botX = rimFront + 6 + (rimBack - 6 - (rimFront + 6)) * t + swayAmt * Math.sin(t * Math.PI);
                ctx.beginPath(); ctx.moveTo(topX, rimY); ctx.lineTo(botX, rimY + netH); ctx.stroke();
            }
            for (let j = 1; j <= 2; j++) {
                const yy = rimY + (netH * j) / 3, shrink = (netH * j) / 3 * 0.25;
                ctx.beginPath();
                ctx.moveTo(rimFront + shrink + swayAmt * 0.4, yy);
                ctx.lineTo(rimBack - shrink + swayAmt * 0.4, yy);
                ctx.stroke();
            }
        }
        function drawBall(x, y) {
            ctx.save();
            ctx.shadowColor = C.orange; ctx.shadowBlur = reduceMotion ? 0 : 6;
            const grd = ctx.createRadialGradient(x - 4, y - 5, 2, x, y, ballR);
            grd.addColorStop(0, C.orange2); grd.addColorStop(1, C.orange);
            ctx.fillStyle = grd; circle(x, y, ballR); ctx.fill();
            ctx.shadowBlur = 0;
            ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1.2;
            circle(x, y, ballR); ctx.stroke();

            // Líneas del balón rotadas con su giro en vuelo (sensación de spin)
            ctx.save();
            ctx.translate(x, y); ctx.rotate(state === 'flying' ? ballSpin : 0);
            ctx.beginPath(); ctx.moveTo(-ballR, 0); ctx.lineTo(ballR, 0);
            ctx.moveTo(0, -ballR); ctx.lineTo(0, ballR); ctx.stroke();
            ctx.beginPath(); ctx.arc(0, 0, ballR, -0.5, 0.5); ctx.stroke();
            ctx.restore();

            ctx.restore();
        }
        function draw() {
            ctx.save();
            // Sacudida de cámara sutil en triples/rachas (nunca con reduce-motion)
            if (shake > 0.3 && !reduceMotion) {
                ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
            }

            // Fondo: atmósfera synthwave (violeta profundo → resplandor cálido abajo)
            const grd = ctx.createLinearGradient(0, 0, 0, H);
            grd.addColorStop(0, '#150f24');
            grd.addColorStop(0.55, '#1b1330');
            grd.addColorStop(0.85, '#2a1240');
            grd.addColorStop(1, '#170a20');
            ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);

            // "Sol" retro detrás del tablero — la firma visual synthwave del resto del sitio
            const sunX = backboardX - 4, sunY = (bbTop + bbBottom) / 2 + 4, sunR = 50;
            const sunGrd = ctx.createRadialGradient(sunX, sunY, 2, sunX, sunY, sunR);
            sunGrd.addColorStop(0, 'rgba(255,140,26,0.32)');
            sunGrd.addColorStop(0.55, 'rgba(255,46,159,0.14)');
            sunGrd.addColorStop(1, 'rgba(255,46,159,0)');
            ctx.fillStyle = sunGrd; circle(sunX, sunY, sunR); ctx.fill();

            // Resplandor de "luz de cancha" subiendo desde el piso
            const floorGlow = ctx.createLinearGradient(0, floorY - 34, 0, floorY);
            floorGlow.addColorStop(0, 'rgba(0,240,255,0)');
            floorGlow.addColorStop(1, 'rgba(0,240,255,0.07)');
            ctx.fillStyle = floorGlow; ctx.fillRect(0, floorY - 34, W, 34);

            ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(0, floorY); ctx.lineTo(W, floorY); ctx.stroke();
            ctx.strokeStyle = 'rgba(0,240,255,0.4)'; ctx.setLineDash([4, 4]);
            ctx.beginPath(); ctx.moveTo(threeLineX, floorY); ctx.lineTo(threeLineX, floorY - 18); ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = 'rgba(0,240,255,0.55)'; ctx.font = "7px 'Press Start 2P', monospace";
            ctx.fillText('3', threeLineX - 8, floorY - 22);

            drawHoop();

            if (curSpot.three && state !== 'flying') {
                const pulse = reduceMotion ? 1 : 0.7 + Math.sin(performance.now() / 220) * 0.3;
                ctx.save();
                ctx.shadowColor = C.orange; ctx.shadowBlur = reduceMotion ? 0 : 8 * pulse;
                ctx.fillStyle = C.orange; ctx.font = "7px 'Press Start 2P', monospace"; ctx.textAlign = 'center';
                ctx.fillText('3PT', ball.x, ball.y - ballR - 8); ctx.textAlign = 'left';
                ctx.restore();
            }

            if (state === 'aiming' && aimNow) {
                const v = launchVec();
                let sx = ball.x, sy = ball.y, svx = v.vx, svy = v.vy;
                ctx.fillStyle = 'rgba(255,255,255,0.5)';
                for (let i = 0; i < 26; i++) { svy += g; sx += svx; sy += svy; if (sy > floorY || sx > W || sx < 0) break; if (i % 2 === 0) { circle(sx, sy, 1.6); ctx.fill(); } }
                ctx.strokeStyle = 'rgba(255,106,0,0.6)'; ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.moveTo(ball.x, ball.y); ctx.lineTo(aimNow.x, aimNow.y); ctx.stroke();
                const p = v.mag / MAXV, bx = W - 14, by = floorY - 90, bh = 80;
                ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.strokeRect(bx, by, 7, bh);
                ctx.fillStyle = p > 0.75 ? C.orange : C.cyan; ctx.fillRect(bx, by + bh * (1 - p), 7, bh * p);
            }

            // Sombra del balón en el piso: da sensación de altura/profundidad
            const heightAboveFloor = Math.max(0, (floorY - ballR) - ball.y);
            const shadowScale = Math.max(0.25, 1 - heightAboveFloor / 160);
            ctx.save();
            ctx.globalAlpha = 0.35 * shadowScale;
            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.ellipse(ball.x, floorY + 2, ballR * shadowScale, ballR * 0.32 * shadowScale, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            drawBall(ball.x, ball.y);

            for (const pt of particles) {
                ctx.globalAlpha = Math.max(0, pt.life / 45);
                ctx.fillStyle = pt.color;
                ctx.shadowColor = pt.color; ctx.shadowBlur = reduceMotion ? 0 : 5;
                if (pt.shape === 'spark') {
                    ctx.save();
                    ctx.translate(pt.x, pt.y);
                    ctx.rotate((pt.spin || 0) * pt.life);
                    ctx.fillRect(-pt.size, -pt.size * 0.35, pt.size * 2, pt.size * 0.7);
                    ctx.restore();
                } else {
                    circle(pt.x, pt.y, pt.size || 2); ctx.fill();
                }
            }
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 1;

            if (floatText) {
                ctx.globalAlpha = Math.max(0, floatText.life / 42);
                ctx.fillStyle = floatText.color;
                ctx.font = (floatText.big ? "bold 20px" : "bold 15px") + " 'Outfit', sans-serif";
                ctx.textAlign = 'center';
                ctx.shadowColor = floatText.color; ctx.shadowBlur = reduceMotion ? 0 : 10;
                ctx.fillText(floatText.txt, floatText.x, floatText.y);
                ctx.shadowBlur = 0; ctx.textAlign = 'left'; ctx.globalAlpha = 1;
            }

            ctx.restore(); // shake
        }

        // El aro oscila en vertical y la dificultad crece con el nivel: al inicio
        // (nivel 0) está QUIETO —fácil, para desbloquear el registro— y va tomando
        // más amplitud y velocidad conforme anotas. NO se desactiva con movimiento
        // reducido: es mecánica de juego (dificultad), no decoración, y el balón
        // ya se mueve igual.
        function updateHoop() {
            const lvl = difficultyLevel();
            if (lvl === 0) {
                rimY = rimYBase; bbTop = bbTopBase; bbBottom = bbBottomBase;
                return;
            }
            const amp = Math.min(10 + lvl * 5, 24);           // amplitud (px), tope 24
            const spd = 0.03 + Math.min(lvl * 0.01, 0.06);    // velocidad angular
            hoopPhase += spd;
            const dy = Math.sin(hoopPhase) * amp;
            rimY = rimYBase + dy;
            bbTop = bbTopBase + dy;
            bbBottom = bbBottomBase + dy;
        }

        // ---- Loop con pausa por visibilidad ----
        let raf = null, running = false;
        function frame() {
            updateHoop();
            step();
            for (let i = particles.length - 1; i >= 0; i--) { const p = particles[i]; p.vy += 0.12; p.x += p.vx; p.y += p.vy; if (--p.life <= 0) particles.splice(i, 1); }
            if (rimFlash > 0) rimFlash--;
            if (netSway > 0) netSway--;
            if (shake > 0) { shake *= 0.8; if (shake < 0.3) shake = 0; }
            if (floatText) { floatText.y -= 0.5; if (--floatText.life <= 0) floatText = null; }
            draw();
            raf = requestAnimationFrame(frame);
        }
        function start() { if (running) return; running = true; raf = requestAnimationFrame(frame); }
        function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = null; }

        const io = new IntersectionObserver((ents) => {
            ents.forEach((en) => { if (en.isIntersecting && !document.hidden) start(); else stop(); });
        }, { threshold: 0.15 });
        io.observe(canvas);
        document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
    })();

// ---- bloque inline #2 ----
    (function () {
        const GOAL = 3;
        const btn = document.getElementById('cta-register');
        const txt = document.getElementById('cta-text');
        const lock = document.getElementById('cta-lock');
        const note = document.getElementById('cta-note');
        const code = document.getElementById('cta-code');
        if (!btn) return;
        let unlocked = false;
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        // Desbloqueo: única recompensa real de la página (registro + código),
        // hasta ahora un simple swap de estado. El pulso dorado, la salida
        // del candado y la aparición del código son un solo momento autoral.
        function unlock() {
            if (unlocked) return;
            unlocked = true;
            btn.classList.remove('is-locked');
            btn.setAttribute('aria-disabled', 'false');
            btn.href = '/registro.html';
            txt.textContent = 'Registrarme ahora';

            if (lock) {
                if (reduceMotion) {
                    lock.remove();
                } else {
                    lock.classList.add('is-leaving');
                    lock.addEventListener('animationend', () => lock.remove(), { once: true });
                }
            }

            btn.classList.add('is-unlocking');
            btn.addEventListener('animationend', function onBtnAnim(e) {
                if (e.target !== btn) return; // animationend burbujea desde el candado (hijo, animación más corta); ignorar
                btn.classList.remove('is-unlocking');
                btn.removeEventListener('animationend', onBtnAnim);
            });

            note.classList.add('is-success');
            note.innerHTML = '<span class="ok">✓</span>¡Canasta! <b>Registro desbloqueado.</b>';
            const c = 'RH-' + Math.random().toString(36).slice(2, 6).toUpperCase();
            code.textContent = 'Tu código: ' + c;
            code.style.display = 'inline-block';
            code.classList.add('is-revealed');
        }

        window.addEventListener('hoops:score', (e) => {
            // Se usa el TOTAL de canastas (no el marcador, que se reinicia al
            // fallar) para desbloquear: basta con hacer 3 canastas en total,
            // aunque falles entre medias.
            const total = (e.detail && e.detail.total) || 0;
            if (total >= GOAL) { unlock(); return; }
            note.innerHTML = 'Vas <b>' + total + '/' + GOAL + '</b> — encesta en la cancha para desbloquear tu registro.';
        });

        btn.addEventListener('click', (e) => { if (btn.classList.contains('is-locked')) e.preventDefault(); });
    })();

// ---- bloque inline #3 ----
    (function () {
        const rm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        // (2) Revelado al scroll: filas [data-stagger] entran L→R con 110ms de desfase.
        const handled = new Set();
        document.querySelectorAll('[data-stagger]').forEach((row) => {
            const items = Array.from(row.querySelectorAll('.rise'));
            items.forEach((i) => handled.add(i));
            const io = new IntersectionObserver((ents, ob) => {
                ents.forEach((en) => {
                    if (!en.isIntersecting) return;
                    items.forEach((it, idx) => {
                        it.style.transitionDelay = rm ? '0ms' : (idx * 110) + 'ms';
                        it.classList.add('is-in');
                    });
                    ob.disconnect();
                });
            }, { threshold: 0.15 });
            io.observe(row);
        });
        // Reveals sueltos (titulares de sección, board): sin desfase.
        document.querySelectorAll('.rise').forEach((el) => {
            if (handled.has(el)) return;
            const io = new IntersectionObserver((ents, ob) => {
                ents.forEach((en) => { if (en.isIntersecting) { el.classList.add('is-in'); ob.disconnect(); } });
            }, { threshold: 0.15 });
            io.observe(el);
        });

        // (4) Contadores del marcador: 0→valor con easeOutCubic en 1400ms, una vez.
        function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
        document.querySelectorAll('[data-count]').forEach((el) => {
            const target = parseFloat(el.dataset.count);
            const dec = ((String(el.dataset.count).split('.')[1]) || '').length;
            const io = new IntersectionObserver((ents, ob) => {
                ents.forEach((en) => {
                    if (!en.isIntersecting) return;
                    ob.disconnect();
                    if (rm) { el.textContent = target.toFixed(dec); return; }
                    const dur = 1400, t0 = performance.now();
                    (function tick(now) {
                        const p = Math.min((now - t0) / dur, 1);
                        el.textContent = (target * easeOutCubic(p)).toFixed(dec);
                        if (p < 1) requestAnimationFrame(tick);
                        else el.textContent = target.toFixed(dec);
                    })(t0);
                });
            }, { threshold: 0.3 });
            io.observe(el);
        });
    })();
