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
        // Los textos flotantes son una COLA, no uno solo: al anotar en racha
        // queremos ver a la vez los puntos ("+3") y el grito ("¡ON FIRE!"), y
        // antes el segundo pisaba al primero.
        let particles = [], rimFlash = 0, floatTexts = [];

        function pushFloatText(txt, color, opts = {}) {
            const life = opts.life || (reduceMotion ? 22 : 46);
            floatTexts.push({
                x: opts.x != null ? opts.x : (rimFront + rimBack) / 2,
                y: opts.y != null ? opts.y : rimY - 14,
                txt, color, life,
                maxLife: life,
                big: !!opts.big,
                vy: opts.vy || -0.55
            });
        }
        let firstShot = false, muted = false, resetScheduled = false;
        // Récord (máximo histórico) persistido en el navegador, y total de canastas
        // para el desbloqueo del registro (ese contador NO se reinicia al fallar).
        let record = parseInt(localStorage.getItem('kphoops_hoop_record') || '0', 10) || 0;
        let totalMade = 0;
        // Toques puramente visuales (no tocan la física del tiro):
        let ballSpin = 0;   // ángulo acumulado del giro del balón en vuelo
        let netSway = 0;    // la red "vibra" un instante al anotar
        let shake = 0;      // sacudida de cámara sutil en triples/rachas
        
        // Elementos del ambiente
        let crowdSilhouettes = [];
        let stadiumLights = [];
        let lightFlickerPhase = 0;
        
        // Inicializar elementos del ambiente
        for (let i = 0; i < 8; i++) {
            crowdSilhouettes.push({
                x: 20 + i * 48,
                height: 15 + Math.random() * 12,
                swayOffset: Math.random() * Math.PI * 2
            });
        }
        
        for (let i = 0; i < 4; i++) {
            stadiumLights.push({
                x: 60 + i * 90,
                y: 20,
                intensity: 0.5 + Math.random() * 0.5,
                flickerSpeed: 0.02 + Math.random() * 0.03
            });
        }

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
            const parts = ['TU RÉCORD: ' + record];
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
            // "En racha" a partir de 3 canastas seguidas. OJO: esto vivía dentro del
            // if (!reduceMotion) de abajo y se leía fuera, así que cada canasta
            // lanzaba un ReferenceError que mataba el requestAnimationFrame: el
            // juego se quedaba congelado tras el primer enceste.
            const onFire = streak >= 3;

            if (!reduceMotion) {
                rimFlash = 26;
                netSway = 16;

                // Sacudida: el triple pega más que la canasta normal, y la racha
                // amplifica las dos (antes la racha solo contaba en los triples).
                const streakMultiplier = onFire ? 1 + (streak - 2) * 0.3 : 1;
                shake = Math.min((is3 ? 12 : 6) * streakMultiplier, 22);

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
            
            // Feedback en dos capas: los puntos salen siempre junto al aro, y
            // encima el grito que corresponda a la jugada.
            pushFloatText('+' + pts, is3 ? C.orange2 : C.cyan, { y: rimY - 12 });

            let callout = null, calloutColor = C.cyan;
            if (onFire) { callout = '¡ON FIRE!'; calloutColor = C.gold; }
            else if (is3) { callout = '¡TRIPLE!'; calloutColor = C.orange; }
            else if (streak >= 2) { callout = '¡SWISH!'; calloutColor = C.cyan; }

            if (callout) {
                pushFloatText(callout, calloutColor, {
                    y: rimY - 34, big: true, vy: -0.75,
                    life: reduceMotion ? 24 : 56
                });
            }
            swish();
            if (score > 0 && score % 10 === 0) { playCelebration(); }
        }

        function scheduleReset(made) {
                    if (resetScheduled) return;
                    resetScheduled = true;
                    if (!made) {
                        // FALLO: se acaba la partida. 
                        const lost = score;
                        
                        // --> INYECCIÓN PARA EL LEADERBOARD <--
                        if (lost > 0) {
                            saveArcadeScore(lost); 
                        }

                        streak = 0; score = 0; scoreEl.textContent = 0; updateStreak();
                        if (lost > 0) {
                            playBoo();
                            pushFloatText('¡FALLASTE!', C.pink, {
                                x: W / 2, y: H / 2, big: true,
                                life: reduceMotion ? 26 : 54, vy: -0.3
                            });
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
            
            // Calcular velocidad para efecto de estiramiento (motion blur)
            const speed = Math.hypot(ball.vx, ball.vy);
            const stretchX = state === 'flying' ? 1 + Math.min(speed * 0.03, 0.3) : 1;
            const stretchY = state === 'flying' ? 1 - Math.min(speed * 0.015, 0.15) : 1;
            
            ctx.translate(x, y);
            ctx.scale(stretchX, stretchY);
            
            ctx.shadowColor = C.orange; ctx.shadowBlur = reduceMotion ? 0 : 6;
            const grd = ctx.createRadialGradient(-4, -5, 2, 0, 0, ballR);
            grd.addColorStop(0, C.orange2); grd.addColorStop(1, C.orange);
            ctx.fillStyle = grd; circle(0, 0, ballR); ctx.fill();
            ctx.shadowBlur = 0;
            ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1.2;
            circle(0, 0, ballR); ctx.stroke();

            // Líneas del balón rotadas con su giro en vuelo (sensación de spin mejorada)
            ctx.rotate(state === 'flying' ? ballSpin : 0);
            ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.2;
            
            // Líneas horizontales y verticales del balón
            ctx.beginPath(); ctx.moveTo(-ballR, 0); ctx.lineTo(ballR, 0); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, -ballR); ctx.lineTo(0, ballR); ctx.stroke();
            
            // Líneas curvas para dar más realismo al giro
            ctx.beginPath(); ctx.arc(0, 0, ballR, -0.5, 0.5); ctx.stroke();
            ctx.beginPath(); ctx.arc(0, 0, ballR * 0.7, Math.PI - 0.4, Math.PI + 0.4); ctx.stroke();
            
            ctx.restore();
        }
        function drawEnvironment() {
            // Dibujar siluetas del público
            ctx.fillStyle = 'rgba(10, 7, 20, 0.6)';
            // Con "reducir movimiento" el ambiente se dibuja igual, pero quieto:
            // esa preferencia pide quitar el MOVIMIENTO, no vaciar el estadio.
            const time = reduceMotion ? 0 : performance.now() / 1000;

            crowdSilhouettes.forEach((silhouette, i) => {
                const sway = Math.sin(time * 0.8 + silhouette.swayOffset) * 1.5;
                ctx.beginPath();
                ctx.moveTo(silhouette.x - 8 + sway, floorY);
                ctx.lineTo(silhouette.x - 4 + sway, floorY - silhouette.height);
                ctx.lineTo(silhouette.x + 4 + sway, floorY - silhouette.height);
                ctx.lineTo(silhouette.x + 8 + sway, floorY);
                ctx.fill();
            });
            
            // Dibujar luces de estadio con parpadeo (congelado si se pide reducir
            // movimiento: quedan encendidas, sin titilar)
            if (!reduceMotion) lightFlickerPhase += 0.05;
            stadiumLights.forEach((light, i) => {
                const flicker = Math.sin(lightFlickerPhase * light.flickerSpeed * 100 + i) * 0.3 + 0.7;
                const intensity = light.intensity * flicker;
                
                // Haz de luz
                const lightGrd = ctx.createRadialGradient(light.x, light.y, 0, light.x, light.y, 40);
                lightGrd.addColorStop(0, `rgba(255, 200, 100, ${intensity * 0.4})`);
                lightGrd.addColorStop(0.5, `rgba(255, 150, 50, ${intensity * 0.2})`);
                lightGrd.addColorStop(1, 'rgba(255, 100, 0, 0)');
                
                ctx.fillStyle = lightGrd;
                ctx.beginPath();
                ctx.arc(light.x, light.y, 40, 0, Math.PI * 2);
                ctx.fill();
                
                // Punto de luz
                ctx.fillStyle = `rgba(255, 220, 150, ${intensity})`;
                ctx.beginPath();
                ctx.arc(light.x, light.y, 3, 0, Math.PI * 2);
                ctx.fill();
            });
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
            
            // Dibujar ambiente (público y luces)
            drawEnvironment();

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

            // Sombra del balón en el piso: da sensación de altura/profundidad mejorada
            const heightAboveFloor = Math.max(0, (floorY - ballR) - ball.y);
            const shadowScale = Math.max(0.2, 1 - heightAboveFloor / 180);
            const shadowAlpha = Math.max(0.1, 0.4 * shadowScale);
            const shadowBlur = Math.max(2, 8 * (1 - shadowScale));
            
            ctx.save();
            ctx.globalAlpha = shadowAlpha;
            ctx.shadowColor = '#000';
            ctx.shadowBlur = shadowBlur;
            ctx.fillStyle = '#000';
            
            // Sombra elíptica que se desplaza ligeramente según la velocidad horizontal
            const shadowOffsetX = state === 'flying' ? ball.vx * 0.5 : 0;
            ctx.beginPath();
            ctx.ellipse(ball.x + shadowOffsetX, floorY + 2, ballR * shadowScale, ballR * 0.32 * shadowScale, 0, 0, Math.PI * 2);
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

            // Textos flotantes: se desvanecen respecto a su PROPIA duración (antes
            // se dividía por un 42 fijo, así que los de vida más larga empezaban
            // con alpha > 1 y se quedaban opacos un rato antes de bajar).
            ctx.textAlign = 'center';
            for (const ft of floatTexts) {
                const t = ft.life / ft.maxLife;
                ctx.globalAlpha = Math.max(0, Math.min(1, t));
                ctx.fillStyle = ft.color;
                // Los grandes entran con un pequeño golpe de escala.
                const pop = ft.big && !reduceMotion ? 1 + Math.max(0, (t - 0.82)) * 1.6 : 1;
                ctx.font = `bold ${Math.round((ft.big ? 20 : 15) * pop)}px 'Outfit', sans-serif`;
                ctx.shadowColor = ft.color; ctx.shadowBlur = reduceMotion ? 0 : 12;
                ctx.fillText(ft.txt, ft.x, ft.y);
            }
            ctx.shadowBlur = 0; ctx.textAlign = 'left'; ctx.globalAlpha = 1;

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
            for (let i = particles.length - 1; i >= 0; i--) {
                const p = particles[i];
                p.vy += 0.12; // Gravedad
                p.x += p.vx;
                p.y += p.vy;

                // Rebote en el suelo de la cancha, perdiendo energía en cada bote.
                if (p.y >= floorY) {
                    p.y = floorY;
                    p.vx *= 0.7;           // fricción horizontal
                    // Por debajo de cierta energía deja de botar y se queda
                    // apagándose en el piso, en vez de vibrar indefinidamente.
                    p.vy = Math.abs(p.vy) < 0.6 ? 0 : p.vy * -0.5;
                }

                if (--p.life <= 0) particles.splice(i, 1);
            }
            if (rimFlash > 0) rimFlash--;
            if (netSway > 0) netSway--;
            if (shake > 0) { shake *= 0.8; if (shake < 0.3) shake = 0; }
            for (let i = floatTexts.length - 1; i >= 0; i--) {
                const ft = floatTexts[i];
                ft.y += ft.vy;
                ft.vy *= 0.985; // sube frenando, como un globo
                if (--ft.life <= 0) floatTexts.splice(i, 1);
            }
            draw();
            raf = requestAnimationFrame(frame);
        }
        function start() { if (running) return; running = true; raf = requestAnimationFrame(frame); }
        function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = null; }
        
        // ---- SISTEMA DE RÉCORDS (LEADERBOARD) ----
        function escapeHtml(str) {
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        }

        function renderLeaderboard(scores, highlightScore) {
            const container = document.getElementById('arcade-leaderboard-list');
            if (!container) return;

            const myInitials = (localStorage.getItem('kphoops_initials') || '').toUpperCase();

            if (!scores || scores.length === 0) {
                container.innerHTML = `
                <li class="arcade-hiscore__row arcade-hiscore__row--empty">
                    Sin récords aún.<br><span>¡Pierde una partida para entrar al ranking!</span>
                </li>`;
                return;
            }

            container.innerHTML = scores.map((s, i) => {
                const isYou = myInitials && s.initials === myInitials;
                const isNew = highlightScore != null && s.score === highlightScore && isYou;
                return `
                <li class="arcade-hiscore__row${isYou ? ' is-you' : ''}${isNew ? ' is-new' : ''}">
                    <span class="arcade-hiscore__rank">#${i + 1}</span>
                    <span class="arcade-hiscore__name">${escapeHtml(s.initials)}</span>
                    <span class="arcade-hiscore__pts">${s.score} PTS</span>
                </li>`;
            }).join('');
        }

        function renderLeaderboardError(message) {
            const container = document.getElementById('arcade-leaderboard-list');
            if (!container) return;
            container.innerHTML = `
                <li class="arcade-hiscore__row arcade-hiscore__row--error">
                    ${escapeHtml(message || 'No se pudieron cargar los récords.')}
                </li>`;
        }

        async function fetchTopScores(highlightScore) {
            const container = document.getElementById('arcade-leaderboard-list');
            if (!container) return;

            // Sin límite de tiempo, un servidor dormido (el plan free de Render
            // tarda ~50s en despertar) dejaba el panel clavado en "Cargando…"
            // para siempre. Con abort se falla rápido y con un mensaje real.
            const ctrl = new AbortController();
            const timeout = setTimeout(() => ctrl.abort(), 8000);

            try {
                const res = await fetch('/api/arcade-scores', { signal: ctrl.signal });

                // Un 404 aquí significa que el endpoint no existe en el servidor
                // que está sirviendo la página (típico: el código del minijuego aún
                // no está desplegado). Merece un aviso distinto de "falló la red".
                if (res.status === 404) {
                    console.warn('El endpoint /api/arcade-scores no existe en este servidor. ¿Está desplegada la última versión?');
                    renderLeaderboardError('Ranking no disponible todavía.');
                    return;
                }
                if (!res.ok) throw new Error('HTTP ' + res.status);

                const scores = await res.json();
                if (!Array.isArray(scores)) throw new Error('Respuesta inválida');
                renderLeaderboard(scores, highlightScore);
            } catch (e) {
                if (e.name === 'AbortError') {
                    console.warn('El Top 3 tardó demasiado en responder.');
                    renderLeaderboardError('El ranking tardó demasiado. Recarga para reintentar.');
                } else {
                    console.warn('Error obteniendo el Top 3:', e);
                    renderLeaderboardError();
                }
            } finally {
                clearTimeout(timeout);
            }
        }

        // Envía el récord ya con las iniciales confirmadas.
        async function postArcadeScore(initials, finalScore) {
            try {
                const res = await fetch('/api/arcade-scores', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ initials, score: finalScore })
                });
                if (!res.ok) throw new Error('HTTP ' + res.status);
                await fetchTopScores(finalScore);
            } catch (e) {
                console.warn('Error guardando el récord arcade:', e);
                await fetchTopScores();
            }
        }

        let modalOpen = false;

        // Pide las iniciales al perder. Antes solo preguntaba la PRIMERA vez (si no
        // había iniciales en localStorage) y el resto de partidas se guardaban en
        // silencio con las viejas; ahora el Game Over siempre se ve y las
        // iniciales recordadas solo vienen precargadas.
        function saveArcadeScore(finalScore) {
            const modal = document.getElementById('arcade-modal');
            const modalScore = document.getElementById('modal-score');
            const modalInitials = document.getElementById('modal-initials');
            const modalSave = document.getElementById('modal-save');
            const modalCancel = document.getElementById('modal-cancel');

            // Sin modal en el DOM no se pierde el récord: se manda con lo que haya.
            // 'AAA' y no 'ANON': el servidor y el propio input limitan a 3 caracteres
            // (maxlength="3"), así que un relleno de 4 quedaría truncado en silencio
            // al guardar.
            if (!modal || !modalInitials || !modalSave || !modalCancel) {
                const fallback = (localStorage.getItem('kphoops_initials') || 'AAA').toUpperCase();
                postArcadeScore(fallback, finalScore);
                return;
            }
            if (modalOpen) return;
            modalOpen = true;

            // El juego se congela mientras el modal está abierto: si no, el balón
            // sigue volando detrás y se puede lanzar sin ver la cancha.
            stop();

            if (modalScore) modalScore.textContent = finalScore;
            modalInitials.value = (localStorage.getItem('kphoops_initials') || '').toUpperCase();
            modal.setAttribute('aria-hidden', 'false');
            // El autofocus tiene que esperar a que el modal sea visible.
            requestAnimationFrame(() => { modalInitials.focus(); modalInitials.select(); });

            const close = () => {
                modal.setAttribute('aria-hidden', 'true');
                modalSave.removeEventListener('click', handleSave);
                modalCancel.removeEventListener('click', handleCancel);
                modalInitials.removeEventListener('keydown', handleKeydown);
                modal.removeEventListener('keydown', handleTrap);
                modalOpen = false;
                // Solo se reanuda si el canvas sigue a la vista.
                if (!document.hidden) start();
            };

            const handleSave = () => {
                // Solo letras y números, 3 caracteres, estilo marcador arcade.
                const raw = modalInitials.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 3).toUpperCase();
                const initials = raw || 'AAA';
                localStorage.setItem('kphoops_initials', initials);
                close();
                postArcadeScore(initials, finalScore);
            };

            const handleCancel = () => { close(); };

            const handleKeydown = (e) => {
                if (e.key === 'Enter') { e.preventDefault(); handleSave(); }
            };

            // Escape cierra, y el Tab no se escapa del modal mientras está abierto.
            const handleTrap = (e) => {
                if (e.key === 'Escape') { e.preventDefault(); handleCancel(); return; }
                if (e.key !== 'Tab') return;
                const focusables = [modalInitials, modalCancel, modalSave];
                const i = focusables.indexOf(document.activeElement);
                const next = e.shiftKey
                    ? focusables[(i <= 0 ? focusables.length : i) - 1]
                    : focusables[(i + 1) % focusables.length];
                e.preventDefault();
                next.focus();
            };

            modalSave.addEventListener('click', handleSave);
            modalCancel.addEventListener('click', handleCancel);
            modalInitials.addEventListener('keydown', handleKeydown);
            modal.addEventListener('keydown', handleTrap);
        }

        fetchTopScores();

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
