// --- APRENDIZADO POR REFORÇO ---
        const motorReforco = {
            acoes: { perseguir: 10, esquivar: 10, atacarLonge: 10, atacarCorpo: 10, recuar: 10 },

            ajustarPontuacao: function (acao, delta) {
                this.acoes[acao] = Math.max(1, this.acoes[acao] + delta);
            },

            escolherAcao: function () {
                if (Math.random() < 0.1) {
                    let chaves = Object.keys(this.acoes);
                    return chaves[Math.floor(Math.random() * chaves.length)];
                }
                return Object.keys(this.acoes).reduce((a, b) => this.acoes[a] > this.acoes[b] ? a : b);
            },

            processarResultadoAcao: function (acao, sucesso) {
                this.ajustarPontuacao(acao, sucesso ? 2 : -1);
            }
        };

        const canvas = document.getElementById("gameCanvas");
        const ctx = canvas.getContext("2d");
        const radarCanvas = document.getElementById("radarCanvas");
        const radarCtx = radarCanvas.getContext("2d");
        function redimensionar() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
        window.addEventListener('resize', redimensionar); redimensionar();

        // --- SISTEMA DE SAVE ---
        let moedas = parseInt(localStorage.getItem("br_moedas")) || 0;
        let diamantes = parseInt(localStorage.getItem("br_diamantes")) || 0;
        let nivelChefeProgresso = parseInt(localStorage.getItem("br_nivel_chefe")) || 1;

        let inventarioPadrao = { rifle: false, colete: false, ninja: false, espada: false, granada: false, regen: false, botas: false, tita: false, vampiro: false, skins: { padrao: true, deserto: false, neon: false, fantasma: false, realeza: false, dourada: false, ciborgue: false }, skinEquipada: 'padrao' };
        let inventario = JSON.parse(localStorage.getItem("br_inventario"));
        if (!inventario) inventario = inventarioPadrao;
        if (!inventario.skins) { inventario.skins = inventarioPadrao.skins; inventario.skinEquipada = 'padrao'; }

        let passePadrao = { vip: false, resgatadosFree: [], resgatadosVip: [], missoes: [{ id: 0, desc: "Jogar Partidas", meta: 3, atual: 0, premio: 50 }, { id: 1, desc: "Eliminar Inimigos", meta: 10, atual: 0, premio: 50 }, { id: 2, desc: "Causar Dano", meta: 1000, atual: 0, premio: 50 }, { id: 3, desc: "Vencer Partidas (Top 5 / Derrotar Boss)", meta: 1, atual: 0, premio: 100 }] };
        let passe = JSON.parse(localStorage.getItem("br_passe")) || passePadrao;

        const coresSkins = { padrao: "#2196F3", deserto: "#C2B280", neon: "#39FF14", fantasma: "#FFFFFF", realeza: "#9C27B0", dourada: "#FFD700", ciborgue: "#B0BEC5" };
        let basucaDesbloqueada = nivelChefeProgresso > 10;

        function salvarProgresso() {
            localStorage.setItem("br_moedas", moedas); localStorage.setItem("br_diamantes", diamantes);
            localStorage.setItem("br_inventario", JSON.stringify(inventario));
            localStorage.setItem("br_nivel_chefe", nivelChefeProgresso);
            localStorage.setItem("br_passe", JSON.stringify(passe));
        }

        // --- LÓGICA E CONSTRUÇÃO DO PASSE DE BATALHA ---
        function getCustoPatamar() { return passe.vip ? 50 : 100; }
        function getPatamarAtual() { return Math.min(30, Math.floor(diamantes / getCustoPatamar())); }

        function progressoMissao(id, valor) { passe.missoes[id].atual += valor; salvarProgresso(); }

        function resgatarMissao(id) {
            let m = passe.missoes[id];
            if (m.atual >= m.meta) {
                diamantes += m.premio;
                m.atual = 0;
                m.meta = Math.floor(m.meta * 1.5);
                m.premio = Math.floor(m.premio * 1.2);
                salvarProgresso(); gerarPasseHTML(); atualizarMenus(); tocarSom("powerup");
            }
        }

        function comprarVip() {
            if (moedas >= 10000 && !passe.vip) { moedas -= 10000; passe.vip = true; salvarProgresso(); gerarPasseHTML(); atualizarMenus(); tocarSom("compra"); }
        }

        function resgatarPasse(tier, isVip) {
            let patamarAtual = getPatamarAtual();
            if (tier > patamarAtual) return;
            if (isVip && !passe.vip) return;

            let resgatados = isVip ? passe.resgatadosVip : passe.resgatadosFree;
            if (resgatados.includes(tier)) return;

            if (isVip) {
                if (tier === 30) { inventario.skins.ciborgue = true; inventario.skinEquipada = 'ciborgue'; }
                else { moedas += (tier * 100); }
            } else {
                if (tier === 30) { moedas += 2000; }
                else if (tier % 2 === 0) { moedas += (tier * 20); }
            }

            resgatados.push(tier); salvarProgresso(); gerarPasseHTML(); atualizarMenus(); tocarSom("powerup");
        }

        // AGORA SIM, A FUNÇÃO QUE DESENHA O PASSE NA TELA
        function gerarPasseHTML() {
            let patamarAtual = getPatamarAtual();
            let proximoFalta = getCustoPatamar() - (diamantes % getCustoPatamar());
            if (patamarAtual >= 30) proximoFalta = 0;

            document.getElementById("textoPatamar").innerText = `Patamar Atual: ${patamarAtual}/30`;
            document.getElementById("textoCustoPasse").innerText = `1 Patamar = ${getCustoPatamar()} 💎 (Próximo em ${proximoFalta}💎)`;

            let btnVip = document.getElementById("btnComprarVip");
            if (passe.vip) { btnVip.innerText = "⭐ PASSE VIP ATIVADO ⭐"; btnVip.style.background = "#555"; btnVip.disabled = true; }
            else { btnVip.innerText = "⭐ COMPRAR PASSE VIP (10.000 💰)"; btnVip.style.background = "#9C27B0"; btnVip.disabled = moedas < 10000; }

            // Desenha Missões
            let missoesHTML = "";
            passe.missoes.forEach((m, index) => {
                let perc = Math.min(100, (m.atual / m.meta) * 100);
                let pronto = m.atual >= m.meta;
                missoesHTML += `<div class="missao-box">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div><b style="font-size:18px;color:#fff;">${m.desc}</b><br><span style="font-size:14px; color:#aaa;">Progresso: ${Math.floor(m.atual)} / ${m.meta}</span></div>
                        <button class="btn" style="background: ${pronto ? '#4CAF50' : '#555'}; margin:0; padding:10px 15px;" ${pronto ? '' : 'disabled'} onclick="resgatarMissao(${index})">Pegar ${m.premio} 💎</button>
                    </div>
                    <div class="progresso-bar"><div class="progresso-fill" style="width: ${perc}%;"></div></div>
                </div>`;
            });
            document.getElementById("listaMissoes").innerHTML = missoesHTML;

            // Desenha Patamares (Nível 1 a 30)
            let passHTML = "";
            for (let i = 1; i <= 30; i++) {
                let liberado = i <= patamarAtual;

                let freePremio = (i === 30) ? '2000 💰' : ((i % 2 === 0) ? `${i * 20} 💰` : '---');
                let freeResgatado = passe.resgatadosFree.includes(i);
                let btnFree = freePremio === '---' ? `<button disabled style="background:#333;color:#555;border:none;">Vazio</button>` :
                    (freeResgatado ? `<button disabled style="background:#555;border:none;">Resgatado</button>` :
                        `<button class="btn" style="background:${liberado ? '#4CAF50' : '#555'}" ${liberado ? '' : 'disabled'} onclick="resgatarPasse(${i}, false)">Pegar</button>`);

                let vipPremio = (i === 30) ? '🤖 Skin CIBORGUE' : `${i * 100} 💰`;
                let vipResgatado = passe.resgatadosVip.includes(i);
                let btnVip = vipResgatado ? `<button disabled style="background:#555;border:none;">Resgatado</button>` :
                    `<button class="btn" style="background:${(liberado && passe.vip) ? '#9C27B0' : '#555'}" ${(liberado && passe.vip) ? '' : 'disabled'} onclick="resgatarPasse(${i}, true)">Pegar</button>`;

                passHTML += `<div class="passe-tier">
                    <div class="passe-header"><span>NÍVEL ${i}</span> <span style="color:#00BCD4; font-size:14px;">(Requer ${i * getCustoPatamar()} 💎)</span></div>
                    <div class="passe-recompensas">
                        <div class="passe-lado"> <span style="font-size:12px;color:#aaa;font-weight:bold;">GRÁTIS</span> <b style="font-size:16px; margin:10px 0; color:#fff;">${freePremio}</b> ${btnFree} </div>
                        <div class="passe-lado vip"> <span style="font-size:12px;color:gold;font-weight:bold;">PASSE VIP</span> <b style="font-size:16px; margin:10px 0; color:gold;">${vipPremio}</b> ${btnVip} </div>
                    </div>
                </div>`;
            }
            document.getElementById("listaPatamares").innerHTML = passHTML;
        }

        // --- SISTEMAS DE MENU ---
        function atualizarMenuModo() { let modo = document.getElementById("selectModo").value; if (modo === "boss") { document.getElementById("menuDificuldade").style.display = "none"; document.getElementById("menuBoss").style.display = "block"; document.getElementById("textoNivelBoss").innerText = Math.min(10, nivelChefeProgresso); } else { document.getElementById("menuDificuldade").style.display = "block"; document.getElementById("menuBoss").style.display = "none"; } }

        function atualizarMenus() {
            document.getElementById("menuMoedas").innerText = moedas; document.getElementById("lojaMoedas").innerText = moedas; document.getElementById("passeMoedas").innerText = moedas;
            document.getElementById("menuDiamantes").innerText = diamantes; document.getElementById("lojaDiamantes").innerText = diamantes; document.getElementById("passeDiamantes").innerText = diamantes;

            let itens = ['rifle', 'colete', 'ninja', 'espada', 'granada', 'regen', 'botas', 'tita', 'vampiro']; let precos = [300, 200, 500, 600, 800, 1000, 1200, 1500, 2000];
            for (let i = 0; i < itens.length; i++) { let btn = document.getElementById('btnComprar' + itens[i].charAt(0).toUpperCase() + itens[i].slice(1)); if (btn) { if (inventario[itens[i]]) { btn.innerText = "EQUIPADO"; btn.disabled = true; btn.style.background = "#555"; } else { btn.innerText = precos[i] + " 💰"; btn.disabled = moedas < precos[i]; btn.style.background = moedas < precos[i] ? "#888" : "#4CAF50"; } } }

            let skinsLista = ['padrao', 'deserto', 'neon', 'fantasma', 'realeza', 'dourada', 'ciborgue']; let skinsPrecos = [0, 150, 300, 500, 800, 1000, 0];
            document.getElementById("divSkinCiborgue").style.display = inventario.skins.ciborgue ? "flex" : "none";

            for (let i = 0; i < skinsLista.length; i++) { let skinKey = skinsLista[i]; let btn = document.getElementById('btnSkin' + skinKey.charAt(0).toUpperCase() + skinKey.slice(1)); if (btn) { if (inventario.skinEquipada === skinKey) { btn.innerText = "USANDO"; btn.disabled = true; btn.style.background = "#555"; btn.className = "btn"; } else if (inventario.skins[skinKey]) { btn.innerText = "EQUIPAR"; btn.disabled = false; btn.className = "btn btn-equipar"; } else { btn.innerText = skinsPrecos[i] + " 💰"; btn.disabled = moedas < skinsPrecos[i]; btn.style.background = moedas < skinsPrecos[i] ? "#888" : "#4CAF50"; btn.className = "btn"; } } }
        }

        function comprarItem(item, preco) {
            if (inventario[item] || moedas < preco) return;
            moedas -= preco;
            inventario[item] = true;
            salvarProgresso();
            atualizarMenus();
            tocarSom("compra");
        }

        function comprarOuEquiparSkin(skin, preco) {
            if (skin === "ciborgue" && !inventario.skins.ciborgue) return;
            if (!inventario.skins[skin]) {
                if (moedas < preco) return;
                moedas -= preco;
                inventario.skins[skin] = true;
            }
            inventario.skinEquipada = skin;
            salvarProgresso();
            atualizarMenus();
            tocarSom("compra");
        }

        function mostrarTela(telaId) {
            ["menuPrincipal", "menuLoja", "menuGameOver", "menuPasse", "ui", "radarPanel", "abilityDeck"].forEach(id => document.getElementById(id).style.display = "none");
            if (telaId === "ui") {
                document.getElementById("ui").style.display = "block";
                document.getElementById("radarPanel").style.display = "block";
                document.getElementById("abilityDeck").style.display = "grid";
                return;
            }
            if (telaId) document.getElementById(telaId).style.display = "block";
        }
        function abrirLoja() { atualizarMenus(); mostrarTela("menuLoja"); }
        function fecharLoja() { mostrarTela("menuPrincipal"); atualizarMenuModo(); }
        function abrirPasse() { mostrarTela("menuPasse"); gerarPasseHTML(); atualizarMenus(); }
        function fecharPasse() { mostrarTela("menuPrincipal"); atualizarMenuModo(); }
        function voltarAoMenu() { gameState = "MENU"; mostrarTela("menuPrincipal"); atualizarMenus(); atualizarMenuModo(); }

        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        let bgmInterval;
        function tocarNota(frequencia, tipo = 'sine', duracao = 0.2, volume = 0.08) { if (audioCtx.state === 'suspended') audioCtx.resume(); const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain(); osc.type = tipo; osc.frequency.setValueAtTime(frequencia, audioCtx.currentTime); osc.connect(gain); gain.connect(audioCtx.destination); gain.gain.setValueAtTime(volume, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duracao); osc.start(); osc.stop(audioCtx.currentTime + duracao); }
        function tocarSom(tipo) { if (audioCtx.state === 'suspended') audioCtx.resume(); const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain(); osc.connect(gain); gain.connect(audioCtx.destination); if (tipo === "tiroJ") { osc.type = 'square'; osc.frequency.setValueAtTime(600, audioCtx.currentTime); osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.1); gain.gain.setValueAtTime(0.05, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1); osc.start(); osc.stop(audioCtx.currentTime + 0.1); } else if (tipo === "tiroB") { osc.type = 'square'; osc.frequency.setValueAtTime(400, audioCtx.currentTime); osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.1); gain.gain.setValueAtTime(0.05, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1); osc.start(); osc.stop(audioCtx.currentTime + 0.1); } else if (tipo === "headshot") { osc.type = 'triangle'; osc.frequency.setValueAtTime(800, audioCtx.currentTime); osc.frequency.linearRampToValueAtTime(1200, audioCtx.currentTime + 0.1); gain.gain.setValueAtTime(0.1, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1); osc.start(); osc.stop(audioCtx.currentTime + 0.1); } else if (tipo === "powerup") { osc.type = 'sine'; osc.frequency.setValueAtTime(300, audioCtx.currentTime); osc.frequency.linearRampToValueAtTime(800, audioCtx.currentTime + 0.2); gain.gain.setValueAtTime(0.1, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2); osc.start(); osc.stop(audioCtx.currentTime + 0.2); } else if (tipo === "espada") { osc.type = 'sawtooth'; osc.frequency.setValueAtTime(800, audioCtx.currentTime); osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.15); gain.gain.setValueAtTime(0.1, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15); osc.start(); osc.stop(audioCtx.currentTime + 0.15); } else if (tipo === "bomba" || tipo === "basuca") { osc.type = 'square'; osc.frequency.setValueAtTime(tipo === "basuca" ? 50 : 100, audioCtx.currentTime); osc.frequency.exponentialRampToValueAtTime(20, audioCtx.currentTime + 0.4); gain.gain.setValueAtTime(0.2, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4); osc.start(); osc.stop(audioCtx.currentTime + 0.4); } else if (tipo === "compra") { osc.type = 'sine'; osc.frequency.setValueAtTime(800, audioCtx.currentTime); osc.frequency.linearRampToValueAtTime(1200, audioCtx.currentTime + 0.1); gain.gain.setValueAtTime(0.1, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1); osc.start(); osc.stop(audioCtx.currentTime + 0.1); } }
        function tocarMusicaFundo(isBoss = false) { if (bgmInterval) clearInterval(bgmInterval); let passo = 0; bgmInterval = setInterval(() => { if (audioCtx.state === 'suspended') audioCtx.resume(); const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain(); osc.type = isBoss ? 'sawtooth' : 'sine'; osc.frequency.value = isBoss ? ((passo % 4 === 0) ? 80 : 100) : ((passo % 4 === 0) ? 120 : 180); osc.connect(gain); gain.connect(audioCtx.destination); gain.gain.setValueAtTime(isBoss ? 0.05 : 0.03, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2); osc.start(); osc.stop(audioCtx.currentTime + 0.2); passo++; }, isBoss ? 350 : 500); }
        function pararMusica() { if (bgmInterval) clearInterval(bgmInterval); }

        const keys = {};
        const mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2, worldX: 750, worldY: 750, isDown: false };
        function registrarTecla(e, pressionada) {
            let key = e.key.toLowerCase();
            keys[e.key] = pressionada;
            keys[key] = pressionada;
            if (["w", "a", "s", "d", " ", "1", "2", "3"].includes(key)) e.preventDefault();
        }
        function atualizarMouse(e) { let rect = canvas.getBoundingClientRect(); mouse.x = e.clientX - rect.left; mouse.y = e.clientY - rect.top; }
        window.addEventListener("keydown", (e) => registrarTecla(e, true));
        window.addEventListener("keyup", (e) => registrarTecla(e, false));
        window.addEventListener("mousemove", atualizarMouse);
        canvas.addEventListener("mousedown", (e) => { if (e.button === 0) { atualizarMouse(e); mouse.isDown = true; if (gameState === "PLAYING" && player && player.hp > 0) { atualizarMiraJogador(); atirarJogador(Date.now()); } e.preventDefault(); } });
        window.addEventListener("mouseup", (e) => { if (e.button === 0) mouse.isDown = false; });
        canvas.addEventListener("contextmenu", (e) => e.preventDefault());
        const arena = { x: 0, y: 0, width: 1500, height: 1500 };
        const walls = [{ x: 650, y: 650, width: 200, height: 40 }, { x: 730, y: 550, width: 40, height: 200 }, { x: 300, y: 300, width: 150, height: 30 }, { x: 300, y: 330, width: 30, height: 100 }, { x: 500, y: 200, width: 30, height: 150 }, { x: 1000, y: 300, width: 150, height: 30 }, { x: 1120, y: 330, width: 30, height: 100 }, { x: 900, y: 200, width: 30, height: 150 }, { x: 300, y: 1100, width: 150, height: 30 }, { x: 300, y: 970, width: 30, height: 130 }, { x: 500, y: 1050, width: 30, height: 150 }, { x: 1000, y: 1100, width: 150, height: 30 }, { x: 1120, y: 970, width: 30, height: 130 }, { x: 900, y: 1050, width: 30, height: 150 }, { x: 100, y: 700, width: 50, height: 100 }, { x: 1350, y: 700, width: 50, height: 100 }];

        let gameStartTime = 0; let gameState = "MENU"; let dificuldade = 1; let modoJogo = "solo";
        let player, bots, bullets, caixas, particles, damageTexts, bombs = [], explosions = [], slashes = [], basucas = [];
        let camX = 0, camY = 0; let safeZone = { radius: 1100 };

        function criarParticulas(x, y, color = "orange") { for (let i = 0; i < 8; i++) { particles.push({ x: x, y: y, vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 0.5) * 6, life: 1.0, size: Math.random() * 3 + 1, color: color }); } }
        function mostrarDanoText(x, y, valor, isCritical, isHeal = false) { let color = isCritical ? "#ff0000" : "#ffffff"; if (isHeal) color = "#00ff00"; damageTexts.push({ x: x + (Math.random() * 20 - 10), y: y - 10, text: valor, life: 1.0, color: color, size: isCritical ? 24 : 16 }); }
        function checkCollision(circle, rect) { let closestX = Math.max(rect.x, Math.min(circle.x, rect.x + rect.width)); let closestY = Math.max(rect.y, Math.min(circle.y, rect.y + rect.height)); let dX = circle.x - closestX; let dY = circle.y - closestY; return (dX * dX + dY * dY) < (circle.radius * circle.radius); }
        function temParede(x1, y1, x2, y2) { let dist = Math.hypot(x2 - x1, y2 - y1); let steps = Math.max(5, Math.ceil(dist / 20)); for (let i = 0; i <= steps; i++) { let px = x1 + (x2 - x1) * (i / steps); let py = y1 + (y2 - y1) * (i / steps); for (let w of walls) { if (px > w.x && px < w.x + w.width && py > w.y && py < w.y + w.height) return true; } } return false; }
        function getValidSpawn(isPlayer = false, keepDistanceFromCenter = true, reqRad = 30) { let valid = false; let sx, sy; let attempts = 0; while (!valid && attempts < 150) { sx = Math.random() * 1300 + 100; sy = Math.random() * 1300 + 100; if (!isPlayer && keepDistanceFromCenter && Math.hypot(sx - 750, sy - 750) < 400) { attempts++; continue; } let hitWall = false; for (let w of walls) { if (sx > w.x - reqRad && sx < w.x + w.width + reqRad && sy > w.y - reqRad && sy < w.y + w.height + reqRad) { hitWall = true; break; } } if (!hitWall) valid = true; attempts++; } return { x: sx || 200, y: sy || 200 }; }
        function getEquipesVivas() { let equipes = new Set(); if (player && player.hp > 0) equipes.add(player.teamId); bots.forEach(b => equipes.add(b.teamId)); return equipes.size; }
        function atualizarMiraJogador() { if (!player) return; let viewCamX = canvas.width / 2 - player.x; let viewCamY = canvas.height / 2 - player.y; mouse.worldX = mouse.x - viewCamX; mouse.worldY = mouse.y - viewCamY; player.angle = Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x); }
        function atirarJogador(now) { if (!player || player.hp <= 0 || now - player.lastShot <= 300) return; bullets.push({ ownerId: player.id, teamId: player.teamId, x: player.x + Math.cos(player.angle) * 20, y: player.y + Math.sin(player.angle) * 20, angle: player.angle, speed: 10, damage: player.damage, skin: player.skin }); player.lastShot = now; tocarSom("tiroJ"); }
        function caminhoArredondado(x, y, w, h, r) { let rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2); ctx.beginPath(); ctx.moveTo(x + rr, y); ctx.lineTo(x + w - rr, y); ctx.quadraticCurveTo(x + w, y, x + w, y + rr); ctx.lineTo(x + w, y + h - rr); ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h); ctx.lineTo(x + rr, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - rr); ctx.lineTo(x, y + rr); ctx.quadraticCurveTo(x, y, x + rr, y); ctx.closePath(); }
        function preencherRetanguloArredondado(x, y, w, h, r, fillStyle, strokeStyle = null, lineWidth = 1) { caminhoArredondado(x, y, w, h, r); ctx.fillStyle = fillStyle; ctx.fill(); if (strokeStyle) { ctx.strokeStyle = strokeStyle; ctx.lineWidth = lineWidth; ctx.stroke(); } }
        function desenharMira() { if (!player || player.hp <= 0 || gameState !== "PLAYING") return; ctx.save(); ctx.translate(mouse.x, mouse.y); ctx.strokeStyle = "rgba(54,216,255,0.92)"; ctx.lineWidth = 2; ctx.shadowColor = "rgba(54,216,255,0.65)"; ctx.shadowBlur = 12; ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.moveTo(-18, 0); ctx.lineTo(-7, 0); ctx.moveTo(7, 0); ctx.lineTo(18, 0); ctx.moveTo(0, -18); ctx.lineTo(0, -7); ctx.moveTo(0, 7); ctx.lineTo(0, 18); ctx.stroke(); ctx.restore(); }
        function desenharMinimapa() {
            if (!radarCtx || !player || gameState === "MENU" || gameState === "GAMEOVER") return;
            let w = radarCanvas.width, h = radarCanvas.height, pad = 10;
            let escala = (w - pad * 2) / arena.width;
            radarCtx.clearRect(0, 0, w, h);
            radarCtx.fillStyle = "rgba(2,6,12,0.92)";
            radarCtx.fillRect(0, 0, w, h);
            radarCtx.strokeStyle = "rgba(54,216,255,0.18)";
            radarCtx.lineWidth = 1;
            for (let i = 0; i <= arena.width; i += 300) { let x = pad + i * escala; radarCtx.beginPath(); radarCtx.moveTo(x, pad); radarCtx.lineTo(x, h - pad); radarCtx.stroke(); }
            for (let i = 0; i <= arena.height; i += 300) { let y = pad + i * escala; radarCtx.beginPath(); radarCtx.moveTo(pad, y); radarCtx.lineTo(w - pad, y); radarCtx.stroke(); }
            radarCtx.strokeStyle = "rgba(255,255,255,0.24)";
            radarCtx.strokeRect(pad, pad, arena.width * escala, arena.height * escala);
            if (modoJogo !== "boss") {
                radarCtx.strokeStyle = "rgba(255,77,109,0.78)";
                radarCtx.lineWidth = 2;
                radarCtx.beginPath();
                radarCtx.arc(pad + 750 * escala, pad + 750 * escala, Math.max(0, safeZone.radius) * escala, 0, Math.PI * 2);
                radarCtx.stroke();
            }
            radarCtx.fillStyle = "rgba(255,255,255,0.16)";
            walls.forEach(wall => radarCtx.fillRect(pad + wall.x * escala, pad + wall.y * escala, wall.width * escala, wall.height * escala));
            caixas.forEach(cx => { radarCtx.fillStyle = cx.tipo === "vida" ? "#ff4d6d" : (cx.tipo === "arma" ? "#ffd166" : (cx.tipo === "escudo" ? "#36d8ff" : "#63f0a0")); radarCtx.fillRect(pad + cx.x * escala - 2, pad + cx.y * escala - 2, 4, 4); });
            bots.forEach(bot => { radarCtx.fillStyle = bot.teamId === player.teamId ? "#36d8ff" : (bot.isBoss ? "#ff4d6d" : "#ff8a3d"); radarCtx.beginPath(); radarCtx.arc(pad + bot.x * escala, pad + bot.y * escala, bot.isBoss ? 4 : 2.5, 0, Math.PI * 2); radarCtx.fill(); });
            radarCtx.fillStyle = "#63f0a0";
            radarCtx.beginPath(); radarCtx.arc(pad + player.x * escala, pad + player.y * escala, 4, 0, Math.PI * 2); radarCtx.fill();
            radarCtx.strokeStyle = "rgba(99,240,160,0.82)";
            radarCtx.beginPath(); radarCtx.moveTo(pad + player.x * escala, pad + player.y * escala); radarCtx.lineTo(pad + (player.x + Math.cos(player.angle) * 90) * escala, pad + (player.y + Math.sin(player.angle) * 90) * escala); radarCtx.stroke();
        }

        function atualizarUI() {
            if (!player) return;
            let maxHpUI = inventario.tita ? 150 : 100;
            let hpAtual = Math.max(0, player.hp);
            document.getElementById("hp").innerText = player.hp > 0 ? `${hpAtual}/${maxHpUI}` : "MORTO";
            document.getElementById("escudo").innerText = player.armor;
            document.getElementById("hpBar").style.width = `${Math.max(0, Math.min(100, (hpAtual / maxHpUI) * 100))}%`;
            document.getElementById("escudoBar").style.width = `${Math.max(0, Math.min(100, (player.armor / 50) * 100))}%`;
            document.getElementById("dano").innerText = player.damage;
            document.getElementById("vel").innerText = player.speed > 4.5 ? "Relâmpago" : (player.speed > 3.5 ? "Rápido" : "Normal");
            if (modoJogo === 'boss') { let boss = bots.find(b => b.isBoss); document.getElementById("infoModoTexto").innerText = "HP Chefão:"; document.getElementById("botsText").innerText = boss ? boss.hp : "0"; } else { let numEquipes = getEquipesVivas(); if (modoJogo === 'solo') { document.getElementById("infoModoTexto").innerText = "Inimigos Vivos:"; document.getElementById("botsText").innerText = numEquipes - (player.hp > 0 ? 1 : 0); } else { document.getElementById("infoModoTexto").innerText = "Equipes Vivas:"; document.getElementById("botsText").innerText = numEquipes; } }
            if (basucaDesbloqueada) { document.getElementById("uiBasuca").style.display = "block"; document.getElementById("municaoBasuca").innerText = player.bazookaAmmo; } else { document.getElementById("uiBasuca").style.display = "none"; }
            document.getElementById("skillSword").classList.toggle("locked", !inventario.espada);
            document.getElementById("skillBomb").classList.toggle("locked", !inventario.granada);
            document.getElementById("skillBazooka").classList.toggle("locked", !basucaDesbloqueada);
        }

        // --- SISTEMA DE FIM DE JOGO E ANIMAÇÃO ---
        function finalizarPartida(colocacao, bossVencido = false) {
            if (gameState === "GAMEOVER" || gameState === "ANIMATING_END") return;
            gameState = "ANIMATING_END"; pararMusica(); document.getElementById("instructions").style.display = "none";

            progressoMissao(0, 1); // Missão Jogar

            let moedasBase = 0; let vitoria = false; let txtPrincipal = "", txtSub = "";
            if (modoJogo === 'boss') {
                vitoria = bossVencido;
                if (bossVencido) { moedasBase = 150; txtPrincipal = "TITÃ DERROTADO!"; txtSub = `Você concluiu o Nível ${nivelChefeProgresso}!`; nivelChefeProgresso++; if (nivelChefeProgresso > 10) basucaDesbloqueada = true; progressoMissao(3, 1); }
                else { moedasBase = 10; txtPrincipal = "O TITÃ VENCEU"; txtSub = "Sua equipe foi massacrada."; }
            } else {
                if (modoJogo === 'duo') { vitoria = colocacao <= 2; if (colocacao === 1) { moedasBase = 100; progressoMissao(3, 1); } else if (colocacao === 2) moedasBase = 50; else if (colocacao === 3) moedasBase = 25; else moedasBase = 10; }
                else { vitoria = colocacao <= 5; if (colocacao === 1) { moedasBase = 100; progressoMissao(3, 1); } else if (colocacao === 2) moedasBase = 50; else if (colocacao === 3) moedasBase = 25; else if (colocacao <= 5) moedasBase = 10; else moedasBase = 5; }
                txtPrincipal = colocacao === 1 ? "VITÓRIA!" : (vitoria ? "MUITO BEM!" : "DERROTA");
                txtSub = modoJogo === 'solo' ? `Você ficou em ${colocacao}º Lugar!` : `Sua equipe ficou em ${colocacao}º Lugar!`;
            }

            let moedasFinais = moedasBase * dificuldade; moedas += moedasFinais; salvarProgresso();

            document.getElementById("tituloFim").innerText = txtPrincipal; document.getElementById("tituloFim").style.color = vitoria ? "gold" : "red";
            document.getElementById("colocacaoTexto").innerText = txtSub; document.getElementById("moedasGanhasTexto").innerText = `+${moedasFinais} Moedas`;

            const overlay = document.getElementById("animacaoFim");
            document.getElementById("textoAnimado").innerText = txtPrincipal; document.getElementById("textoAnimado").className = vitoria ? "texto-vitoria" : "texto-derrota";
            document.getElementById("subTextoAnimado").innerText = txtSub; document.getElementById("subTextoAnimado").style.color = vitoria ? "gold" : "white";

            overlay.style.display = "flex"; overlay.style.background = vitoria ? "rgba(0,50,100,0.6)" : "rgba(100,0,0,0.8)";

            if (vitoria) {
                tocarNota(600, 'triangle', 0.5, 0.1); setTimeout(() => tocarNota(800, 'triangle', 0.6, 0.1), 120);
                let camTarget = player.hp > 0 ? player : (bots.find(b => b.teamId === player.teamId) || player);
                for (let i = 0; i < 80; i++) { particles.push({ x: camTarget.x + (Math.random() * 1200 - 600), y: camTarget.y - 400 + Math.random() * 200, vx: (Math.random() - 0.5) * 6, vy: Math.random() * 5 + 3, life: 3.0, size: Math.random() * 8 + 4, color: `hsl(${Math.random() * 360}, 100%, 50%)` }); }
            } else { tocarNota(100, 'sawtooth', 0.8, 0.2); }

            setTimeout(() => { overlay.style.display = "none"; gameState = "GAMEOVER"; mostrarTela("menuGameOver"); }, 3500);
        }


        function iniciarJogoBoss() { modoJogo = "boss"; dificuldade = nivelChefeProgresso; iniciarJogo(dificuldade); }

        let bossHp = 1000;

        function iniciarJogo(nivelSelecionado) {
            if (audioCtx.state === 'suspended') audioCtx.resume(); tocarMusicaFundo(modoJogo === 'boss');
            dificuldade = nivelSelecionado; if (modoJogo !== 'boss') modoJogo = document.getElementById("selectModo").value; mouse.isDown = false;
            mostrarTela("ui"); document.getElementById("instructions").style.display = "block"; document.getElementById("nivelText").innerText = dificuldade; safeZone.radius = modoJogo === 'boss' ? 2000 : 1100;

            let maxHp = inventario.tita ? 150 : 100; let pSpeed = 3.5; if (inventario.ninja) pSpeed += 1.0; if (inventario.botas) pSpeed += 1.0;
            let pSkin = inventario.skinEquipada; if (inventario.ninja && pSkin === 'padrao') pSkin = 'ninja';
            let pColor = pSkin === 'ninja' ? "#222" : coresSkins[pSkin];

            let pSpawn = getValidSpawn(true, false, 30);
            player = { id: "player", teamId: 1, x: pSpawn.x, y: pSpawn.y, radius: 15, angle: 0, speed: pSpeed, hp: maxHp, armor: inventario.colete ? 50 : 0, damage: inventario.rifle ? 20 : 10, color: pColor, skin: pSkin, lastToxicDamage: 0, lastShot: 0, lastSword: 0, lastBomb: 0, lastBazooka: 0, lastRegen: Date.now(), bazookaAmmo: basucaDesbloqueada ? 2 : 0, isJumping: false, jumpTimer: 0, lastJump: 0 };

            bots = []; bullets = []; particles = []; damageTexts = []; bombs = []; explosions = []; slashes = []; basucas = [];

            if (modoJogo === 'boss') {
                for (let i = 0; i < 3; i++) { let allySpawn = getValidSpawn(false, true, 20); bots.push({ id: "ally" + i, teamId: 1, isBoss: false, x: allySpawn.x, y: allySpawn.y, radius: 15, hp: 150, armor: 100, damage: 25, color: "#2196F3", skin: "padrao", speed: 3.6, shootCooldown: 1000, lastShot: i * 150, angle: 0, patrolPoint: null, strafeDir: Math.random() < 0.5 ? 1 : -1, stuckCounter: 0 }); }
                let bossSpawn = getValidSpawn(false, false, 60);
                bots.push({
                    id: "boss",
                    teamId: 2,
                    isBoss: true,
                    x: bossSpawn.x,
                    y: bossSpawn.y,
                    hp: bossHp,
                    reforco: { ...motorReforco }, // <--- AQUI ESTÁ A MÁGICA
                    acaoAtual: 'perseguir'
                });
                caixas = [];
            } else {
                let botSpeedBase = 0.8 + (dificuldade * 0.3); let botCooldown = 2100 - (dificuldade * 300); let teamSpawns = {};
                for (let i = 0; i < 9; i++) {
                    let bTeamId = (modoJogo === 'duo') ? Math.floor((i + 1) / 2) + 1 : i + 2; let spawnPt;
                    if (modoJogo === 'duo') { if (!teamSpawns[bTeamId]) teamSpawns[bTeamId] = getValidSpawn(false, true, 30); spawnPt = { x: teamSpawns[bTeamId].x + (Math.random() * 40 - 20), y: teamSpawns[bTeamId].y + (Math.random() * 40 - 20) }; } else { spawnPt = getValidSpawn(false, true, 30); }
                    let bColor = "#f44336"; let bSkin = "inimigo"; let bSpeed = botSpeedBase;
                    if (Math.random() < 0.15) { bColor = "#222"; bSkin = "ninja"; bSpeed += 1.0; }
                    if (bSkin !== "ninja") { if (modoJogo === 'duo' && bTeamId === 1) { bColor = "#2196F3"; bSkin = "padrao"; } else { bColor = "#f44336"; bSkin = "inimigo"; } }
                    bots.push({ id: "bot" + i, teamId: bTeamId, isBoss: false, x: spawnPt.x, y: spawnPt.y, radius: 15, hp: 100, armor: Math.random() < 0.2 ? 50 : 0, damage: Math.random() < 0.2 ? 20 : 10, color: bColor, skin: bSkin, speed: bSpeed, shootCooldown: botCooldown, lastShot: i * 150, angle: 0, patrolPoint: null, strafeDir: Math.random() < 0.5 ? 1 : -1, stuckCounter: 0 });
                }
                caixas = [{ x: 400, y: 400, size: 24, color: "#FF9800", tipo: "arma" }, { x: 1100, y: 1200, size: 24, color: "#F44336", tipo: "vida" }, { x: 750, y: 450, size: 24, color: "#00BCD4", tipo: "escudo" }, { x: 250, y: 750, size: 24, color: "#FFEB3B", tipo: "velocidade" }, { x: 1100, y: 400, size: 24, color: "#FF9800", tipo: "arma" }, { x: 400, y: 1200, size: 24, color: "#F44336", tipo: "vida" }, { x: 750, y: 1200, size: 24, color: "#00BCD4", tipo: "escudo" }, { x: 1250, y: 750, size: 24, color: "#FFEB3B", tipo: "velocidade" }];
            }
            atualizarUI(); gameState = "COUNTDOWN"; gameStartTime = Date.now() + 3000;
        }

        function darDano(entidade, dano, x, y, isCritical, sourceId) {
            if (sourceId === "boss") {
                let boss = bots.find(b => b.id === "boss");
                if (boss) boss.reforco.processarResultadoAcao(boss.acaoAtual, true);
            }

            // Se o Boss recebeu dano
            if (entidade.id === "boss") {
                entidade.reforco.processarResultadoAcao(entidade.acaoAtual, false);
            }
            let dFinal = isCritical ? Math.floor(dano * 1.5) : dano;
            if (sourceId === "player") progressoMissao(2, dFinal);
            if (entidade.armor && entidade.armor > 0) { if (dFinal >= entidade.armor) { dFinal -= entidade.armor; entidade.armor = 0; entidade.hp -= dFinal; } else { entidade.armor -= dFinal; dFinal = 0; } } else { entidade.hp -= dFinal; }
            if (entidade.id === "player" || entidade.isBoss) atualizarUI(); mostrarDanoText(x, y, isCritical ? (dFinal > 0 ? dFinal : "BLOCKED") : (dFinal > 0 ? dFinal : "BLOCKED"), isCritical);
        }
        function moverEntidade(entidade, movX, movY) {
            entidade.vx = movX;
            entidade.vy = movY; let nX = entidade.x + movX; let nY = entidade.y + movY; let canX = true; let canY = true; for (let w of walls) { if (checkCollision({ x: nX, y: entidade.y, radius: entidade.radius }, w)) canX = false; } for (let w of walls) { if (checkCollision({ x: entidade.x, y: nY, radius: entidade.radius }, w)) canY = false; } if (nX < entidade.radius || nX > arena.width - entidade.radius) canX = false; if (nY < entidade.radius || nY > arena.height - entidade.radius) canY = false; if (canX) entidade.x = nX; if (canY) entidade.y = nY;
        }

        function update() {
            if (gameState === "MENU" || gameState === "GAMEOVER") return;
            let now = Date.now();

            for (let i = particles.length - 1; i >= 0; i--) { particles[i].x += particles[i].vx; particles[i].y += particles[i].vy; particles[i].life -= 0.02; if (particles[i].life <= 0) particles.splice(i, 1); }
            for (let i = damageTexts.length - 1; i >= 0; i--) { damageTexts[i].y -= 1; damageTexts[i].life -= 0.02; if (damageTexts[i].life <= 0) damageTexts.splice(i, 1); }
            for (let i = slashes.length - 1; i >= 0; i--) { slashes[i].life -= 0.08; if (slashes[i].life <= 0) slashes.splice(i, 1); }
            for (let i = explosions.length - 1; i >= 0; i--) { explosions[i].life -= 0.05; if (explosions[i].life <= 0) explosions.splice(i, 1); }

            if (gameState === "COUNTDOWN") { if (now >= gameStartTime) gameState = "PLAYING"; return; }
            if (gameState === "ANIMATING_END") return;

            let myTeamAlive = (player.hp > 0) || bots.some(b => b.teamId === player.teamId);
            if (modoJogo === 'boss') { let boss = bots.find(b => b.isBoss); if (!boss && gameState !== "GAMEOVER") { finalizarPartida(1, true); return; } if (!myTeamAlive && gameState !== "GAMEOVER") { finalizarPartida(2, false); return; } }
            else { let totalEquipes = getEquipesVivas(); if (modoJogo === 'solo' && player.hp <= 0 && gameState !== "GAMEOVER") { finalizarPartida(totalEquipes + 1); return; } if (!myTeamAlive && gameState !== "GAMEOVER") { finalizarPartida(totalEquipes + 1); return; } if (totalEquipes === 1 && myTeamAlive && gameState !== "GAMEOVER") { finalizarPartida(1); return; } if (safeZone.radius > 0) safeZone.radius -= 0.20; }

            let maxHp = inventario.tita ? 150 : 100;

            if (player.hp > 0) {
                if (inventario.regen && player.hp < maxHp && now - player.lastRegen > 1000) { player.hp = Math.min(maxHp, player.hp + 1); player.lastRegen = now; atualizarUI(); }
                if (keys[" "] && now - player.lastJump > 2000) { player.isJumping = true; player.jumpTimer = now; player.lastJump = now; }
                let curSpd = player.speed; if (player.isJumping) { if (now - player.jumpTimer < 300) curSpd = player.speed * 3; else player.isJumping = false; }
                let movX = 0, movY = 0; if (keys["w"]) movY -= 1; if (keys["s"]) movY += 1; if (keys["a"]) movX -= 1; if (keys["d"]) movX += 1; if (movX !== 0 || movY !== 0) { let len = Math.hypot(movX, movY); movX = (movX / len) * curSpd; movY = (movY / len) * curSpd; }
                if (movX !== 0 || movY !== 0) moverEntidade(player, movX, movY);
                atualizarMiraJogador();

                if (mouse.isDown) atirarJogador(now);
                if (keys["1"] && inventario.espada && now - player.lastSword > 600) { tocarSom("espada"); slashes.push({ x: player.x, y: player.y, angle: player.angle, life: 1.0, radius: 35, skin: player.skin }); bots.forEach((bot, index) => { if (bot.teamId !== player.teamId && Math.hypot(bot.x - player.x, bot.y - player.y) < 70 + bot.radius) { let d = Math.abs(Math.atan2(bot.y - player.y, bot.x - player.x) - player.angle); if (d > Math.PI) d = 2 * Math.PI - d; if (d < Math.PI / 2.5) { darDano(bot, 40, bot.x, bot.y, true, player.id); criarParticulas(bot.x, bot.y, "cyan"); if (bot.hp <= 0) { progressoMissao(1, 1); if (inventario.vampiro) { player.hp = Math.min(maxHp, player.hp + 20); mostrarDanoText(player.x, player.y, "+20 VAMP!", false, true); } bots.splice(index, 1); atualizarUI(); } } } }); player.lastSword = now; }
                if (keys["2"] && inventario.granada && now - player.lastBomb > 2000) { bombs.push({ teamId: player.teamId, x: player.x + Math.cos(player.angle) * 25, y: player.y + Math.sin(player.angle) * 25, vx: Math.cos(player.angle) * 12, vy: Math.sin(player.angle) * 12, spawnTime: now, ownerId: player.id, skin: player.skin }); player.lastBomb = now; }
                if (keys["3"] && basucaDesbloqueada && player.bazookaAmmo > 0 && now - player.lastBazooka > 1000) { tocarSom("bomba"); basucas.push({ teamId: player.teamId, ownerId: player.id, x: player.x + Math.cos(player.angle) * 20, y: player.y + Math.sin(player.angle) * 20, angle: player.angle, speed: 18, damage: 90 }); player.bazookaAmmo--; player.lastBazooka = now; atualizarUI(); }
                let dPC = Math.hypot(player.x - 750, player.y - 750); if (modoJogo !== 'boss' && (dPC > safeZone.radius || player.x < 0 || player.x > 1500 || player.y < 0 || player.y > 1500) && now - player.lastToxicDamage > 1000) { darDano(player, 10, player.x, player.y, false, "gas"); player.lastToxicDamage = now; }
                for (let i = caixas.length - 1; i >= 0; i--) { let cx = caixas[i]; if (Math.hypot(player.x - cx.x, player.y - cx.y) < player.radius + cx.size) { if (cx.tipo === "arma") { player.damage = 20; mostrarDanoText(player.x, player.y, "ARMA UP!", false, true); } else if (cx.tipo === "vida") { player.hp = Math.min(maxHp, player.hp + 50); mostrarDanoText(player.x, player.y, "+50 HP", false, true); } else if (cx.tipo === "escudo") { player.armor = 50; mostrarDanoText(player.x, player.y, "+50 ESCUDO", false, true); } else if (cx.tipo === "velocidade") { player.speed += 2; mostrarDanoText(player.x, player.y, "VELOCIDADE!", false, true); } tocarSom("powerup"); atualizarUI(); caixas.splice(i, 1); } }
            }

            for (let i = basucas.length - 1; i >= 0; i--) { let bz = basucas[i]; bz.x += Math.cos(bz.angle) * bz.speed; bz.y += Math.sin(bz.angle) * bz.speed; criarParticulas(bz.x, bz.y, "yellow"); let explodiu = false; if (bz.x < -500 || bz.x > 2000 || bz.y < -500 || bz.y > 2000) { explodiu = true; } if (!explodiu) { for (let w of walls) { if (bz.x > w.x && bz.x < w.x + w.width && bz.y > w.y && bz.y < w.y + w.height) { explodiu = true; break; } } } if (!explodiu) { for (let j = bots.length - 1; j >= 0; j--) { if (bots[j].teamId !== bz.teamId && Math.hypot(bz.x - bots[j].x, bz.y - bots[j].y) < bots[j].radius + 10) { explodiu = true; break; } } } if (!explodiu && player.hp > 0 && player.teamId !== bz.teamId && Math.hypot(bz.x - player.x, bz.y - player.y) < player.radius + 10) { explodiu = true; } if (explodiu) { tocarSom("bomba"); explosions.push({ x: bz.x, y: bz.y, life: 1.0, radius: 120 }); for (let j = bots.length - 1; j >= 0; j--) { if (bots[j].teamId !== bz.teamId && Math.hypot(bots[j].x - bz.x, bots[j].y - bz.y) < 120) { darDano(bots[j], bz.damage, bots[j].x, bots[j].y, true, bz.ownerId); if (bots[j].hp <= 0) { if (bz.ownerId === "player") progressoMissao(1, 1); if (bz.ownerId === "player" && inventario.vampiro) { player.hp = Math.min(maxHp, player.hp + 20); mostrarDanoText(player.x, player.y, "+20 VAMP!", false, true); } bots.splice(j, 1); atualizarUI(); } } } if (player.hp > 0 && player.teamId !== bz.teamId && !player.isJumping && Math.hypot(player.x - bz.x, player.y - bz.y) < 120) { darDano(player, bz.damage, player.x, player.y, true, bz.ownerId); } basucas.splice(i, 1); } }
            for (let i = bombs.length - 1; i >= 0; i--) { let b = bombs[i]; b.x += b.vx; b.y += b.vy; b.vx *= 0.92; b.vy *= 0.92; for (let w of walls) { if (b.x > w.x && b.x < w.x + w.width && b.y > w.y && b.y < w.y + w.height) { b.vx = 0; b.vy = 0; break; } } if (now - b.spawnTime > 1500) { tocarSom("bomba"); explosions.push({ x: b.x, y: b.y, life: 1.0, radius: 90 }); for (let j = bots.length - 1; j >= 0; j--) { if (bots[j].teamId !== b.teamId && Math.hypot(bots[j].x - b.x, bots[j].y - b.y) < 90) { darDano(bots[j], 50, bots[j].x, bots[j].y, true, b.ownerId); if (bots[j].hp <= 0) { if (b.ownerId === "player") progressoMissao(1, 1); if (b.ownerId === "player" && inventario.vampiro) { player.hp = Math.min(maxHp, player.hp + 20); mostrarDanoText(player.x, player.y, "+20 VAMP!", false, true); } bots.splice(j, 1); atualizarUI(); } } } if (player.hp > 0 && player.teamId !== b.teamId && !player.isJumping && Math.hypot(player.x - b.x, player.y - b.y) < 90) { darDano(player, 50, player.x, player.y, true, b.ownerId); } bombs.splice(i, 1); } }
            for (let i = caixas.length - 1; i >= 0; i--) { for (let j = 0; j < bots.length; j++) { if (!bots[j].isBoss && Math.hypot(bots[j].x - caixas[i].x, bots[j].y - caixas[i].y) < bots[j].radius + caixas[i].size) { let cx = caixas[i]; if (cx.tipo === "arma") bots[j].damage = 20; else if (cx.tipo === "vida") bots[j].hp = Math.min(100, bots[j].hp + 50); else if (cx.tipo === "escudo") bots[j].armor = 50; else if (cx.tipo === "velocidade") bots[j].speed += 1.5; caixas.splice(i, 1); break; } } }

            for (let i = bots.length - 1; i >= 0; i--) {
                let bot = bots[i]; let oldX = bot.x; let oldY = bot.y;
                if (!bot.isBoss && modoJogo !== 'boss') { let dBC = Math.hypot(bot.x - 750, bot.y - 750); if (dBC > safeZone.radius && now - (bot.lastToxicDamage || 0) > 1000) { darDano(bot, 10, bot.x, bot.y, false, "gas"); bot.lastToxicDamage = now; if (bot.hp <= 0) { bots.splice(i, 1); atualizarUI(); continue; } } }
                let isIgnoring = now < (bot.ignoreTargetUntil || 0); let alvoM = null; let menorD = Infinity;
                if (!isIgnoring) { if (player.hp > 0 && player.teamId !== bot.teamId) { let d = Math.hypot(player.x - bot.x, player.y - bot.y); if (d < menorD) { menorD = d; alvoM = player; } } bots.forEach(o => { if (o.teamId !== bot.teamId) { let d = Math.hypot(o.x - bot.x, o.y - bot.y); if (d < menorD) { menorD = d; alvoM = o; } } }); }
                let visaoLimpa = alvoM ? !temParede(bot.x, bot.y, alvoM.x, alvoM.y) : false; if (alvoM && !visaoLimpa) alvoM = null;
                if (bot.isBoss) {
                    if (alvoM) { bot.angle = Math.atan2(alvoM.y - bot.y, alvoM.x - bot.x); if (now - bot.lastAttackChange > 3000) { bot.attackState = Math.floor(Math.random() * 4); bot.lastAttackChange = now; } if (bot.attackState === 0) { if (menorD > 200 || !visaoLimpa) moverEntidade(bot, Math.cos(bot.angle) * bot.speed, Math.sin(bot.angle) * bot.speed); if (visaoLimpa && now - bot.lastShot > bot.shootCooldown) { for (let a = -0.2; a <= 0.2; a += 0.2) { bullets.push({ ownerId: bot.id, teamId: bot.teamId, x: bot.x, y: bot.y, angle: bot.angle + a, speed: 7, damage: bot.damage, skin: "boss" }); } bot.lastShot = now; tocarSom("tiroB"); } } else if (bot.attackState === 1) { if (menorD > 80 || !visaoLimpa) { moverEntidade(bot, Math.cos(bot.angle) * (bot.speed * 1.5), Math.sin(bot.angle) * (bot.speed * 1.5)); } else if (now - bot.lastShot > 1000) { tocarSom("espada"); slashes.push({ x: bot.x, y: bot.y, angle: bot.angle, life: 1.0, radius: 90, skin: "boss" });[player, ...bots].forEach(o => { if (o.hp > 0 && o.teamId !== bot.teamId && Math.hypot(o.x - bot.x, o.y - bot.y) < 100) { darDano(o, 60, o.x, o.y, true, bot.id); } }); bot.lastShot = now; } } else if (bot.attackState === 2) { if (visaoLimpa && menorD > 100 && menorD < 600 && now - bot.lastShot > 2000) { tocarSom("bomba"); basucas.push({ teamId: bot.teamId, ownerId: bot.id, x: bot.x, y: bot.y, angle: bot.angle, speed: 12, damage: 60 }); bot.lastShot = now; } else if (menorD > 600 || !visaoLimpa) { moverEntidade(bot, Math.cos(bot.angle) * bot.speed, Math.sin(bot.angle) * bot.speed); } } else if (bot.attackState === 3) { if (menorD > 150 || !visaoLimpa) moverEntidade(bot, Math.cos(bot.angle) * bot.speed, Math.sin(bot.angle) * bot.speed); if (visaoLimpa && now - bot.lastShot > 200) { bullets.push({ ownerId: bot.id, teamId: bot.teamId, x: bot.x, y: bot.y, angle: bot.angle + (Math.random() * 0.8 - 0.4), speed: 5, damage: 5, skin: "boss" }); bot.lastShot = now; tocarSom("powerup"); } } } else { if (!bot.patrolPoint || Math.hypot(bot.patrolPoint.x - bot.x, bot.patrolPoint.y - bot.y) < 40) { bot.patrolPoint = getValidSpawn(false, false, 60); } let ang = Math.atan2(bot.patrolPoint.y - bot.y, bot.patrolPoint.x - bot.x); bot.angle = ang; moverEntidade(bot, Math.cos(ang) * bot.speed, Math.sin(ang) * bot.speed); }
                } else {
                    // --- IA ADAPTATIVA E PREDITIVA ---
                    if (now - (bot.lastThink || 0) > 250) {
                        bot.caixaAlvo = null;
                        let distC = Infinity;

                        if (dificuldade >= 3 && bot.hp < 60) {
                            caixas.forEach(cx => {
                                if (cx.tipo === "vida") {
                                    let d = Math.hypot(cx.x - bot.x, cx.y - bot.y);
                                    if (d < distC) { distC = d; bot.caixaAlvo = cx; }
                                }
                            });

                            if (bot.caixaAlvo) {
                                if (!bot.avisouCura) {
                                    console.log(`[IA Nível ${dificuldade}] ${bot.id} com HP Crítico (${bot.hp}). Rota alterada para CAIXA DE VIDA!`);
                                    bot.avisouCura = true;
                                }
                            } else {
                                if (!bot.avisouSemCura) {
                                    console.log(`[IA Nível ${dificuldade}] ${bot.id} com HP Crítico (${bot.hp}). Rota alterada para CAIXA DE VIDA! (Obstáculo: Caixas esgotadas)`);
                                    bot.avisouSemCura = true;
                                }
                            }
                        } else {
                            bot.avisouCura = false;
                            bot.avisouSemCura = false;
                        }

                        // Comportamento padrão
                        if (!bot.caixaAlvo) {
                            caixas.forEach(cx => {
                                let d = Math.hypot(cx.x - bot.x, cx.y - bot.y);
                                if (d < distC) { distC = d; bot.caixaAlvo = cx; }
                            });
                        }

                        bot.distCaixa = distC;
                        bot.lastThink = now;
                    }

                    let alvoV = alvoM;
                    let indoC = false;
                    let fugindo = false;
                    let distR = menorD;
                    let dBC = Math.hypot(bot.x - 750, bot.y - 750);

                    if (bot.caixaAlvo && bot.distCaixa < (dificuldade >= 3 && bot.hp < 60 ? 800 : 300) && !temParede(bot.x, bot.y, bot.caixaAlvo.x, bot.caixaAlvo.y)) {
                        alvoV = bot.caixaAlvo; indoC = true; distR = bot.distCaixa;
                    }

                    if (modoJogo !== 'boss' && dBC > safeZone.radius - 80) {
                        alvoV = { x: 750, y: 750 }; fugindo = true; distR = dBC;
                    }

                    if (!alvoV) {
                        if (!bot.patrolPoint || Math.hypot(bot.patrolPoint.x - bot.x, bot.patrolPoint.y - bot.y) < 30) {
                            bot.patrolPoint = getValidSpawn(false, false, 20);
                        }
                        alvoV = bot.patrolPoint; distR = Math.hypot(alvoV.x - bot.x, alvoV.y - bot.y);
                    }

                    if (alvoV) {
                        let alvoFinalX = alvoV.x;
                        let alvoFinalY = alvoV.y;

                        if (dificuldade >= 3 && alvoV === alvoM && !indoC && !fugindo) {
                            let antecipacao = dificuldade * 3;
                            let targetVx = alvoV.vx || 0;
                            let targetVy = alvoV.vy || 0;
                            alvoFinalX = alvoV.x + (targetVx * antecipacao);
                            alvoFinalY = alvoV.y + (targetVy * antecipacao);
                            // diferença entre onde o player está e onde a IA vai atirar/andar
                            if (now - (bot.lastPredLog || 0) > 1000)
                                console.log(`[IA Preditiva] ${bot.id} interceptando. Alvo Real: X:${Math.floor(alvoV.x)} | Alvo Futuro: X:${Math.floor(alvoFinalX)}`);
                        }

                        let ang = Math.atan2(alvoFinalY - bot.y, alvoFinalX - bot.x);
                        bot.angle = ang;

                        if (alvoV === alvoM && !fugindo && !indoC) {
                            if (!visaoLimpa || distR > 250) {
                                moverEntidade(bot, Math.cos(bot.angle) * bot.speed, Math.sin(bot.angle) * bot.speed);
                            } else if (distR < 150) {
                                moverEntidade(bot, -Math.cos(bot.angle) * (bot.speed * 0.8), -Math.sin(bot.angle) * (bot.speed * 0.8));
                            } else {
                                moverEntidade(bot, Math.cos(bot.angle + (Math.PI / 2 * bot.strafeDir)) * bot.speed, Math.sin(bot.angle + (Math.PI / 2 * bot.strafeDir)) * bot.speed);
                            }
                        } else {
                            moverEntidade(bot, Math.cos(bot.angle) * bot.speed, Math.sin(bot.angle) * bot.speed);
                        }
                    }

                    if (alvoM && visaoLimpa && now - bot.lastShot > bot.shootCooldown && menorD < 400) {
                        let angleShoot = Math.atan2(alvoM.y - bot.y, alvoM.x - bot.x);
                        bullets.push({ ownerId: bot.id, teamId: bot.teamId, x: bot.x + Math.cos(angleShoot) * 20, y: bot.y + Math.sin(angleShoot) * 20, angle: angleShoot, speed: 7, damage: bot.damage, skin: bot.skin });
                        bot.lastShot = now; tocarSom("tiroB");
                    }
                }
                if (Math.hypot(bot.x - oldX, bot.y - oldY) < bot.speed * 0.2) {
                    bot.stuckCounter = (bot.stuckCounter || 0) + 1; if (bot.stuckCounter > 20) if (bot.reforco && typeof bot.reforco.processarResultadoAcao === 'function') {
                        bot.reforco.processarResultadoAcao(bot.acaoAtual, false); bot.patrolPoint = getValidSpawn(false, false, bot.isBoss ? 60 : 20); bot.ignoreTargetUntil = now + 1500; bot.stuckCounter = 0;
                    }
                } else { bot.stuckCounter = 0; }
            }
            for (let i = bullets.length - 1; i >= 0; i--) {
                let b = bullets[i]; b.x += Math.cos(b.angle) * b.speed; b.y += Math.sin(b.angle) * b.speed; if (b.x < -500 || b.x > 2000 || b.y < -500 || b.y > 2000) { bullets.splice(i, 1); continue; }
                let tiroD = false; for (let w of walls) { if (b.x > w.x && b.x < w.x + w.width && b.y > w.y && b.y < w.y + w.height) { tiroD = true; criarParticulas(b.x, b.y, "gray"); break; } }
                if (tiroD) { bullets.splice(i, 1); continue; }
                function processHit(alvo, dist) { let isHeadshot = dist < (alvo.radius * 0.4); darDano(alvo, b.damage, b.x, b.y, isHeadshot, b.ownerId); if (isHeadshot) tocarSom("headshot"); criarParticulas(b.x, b.y, alvo.armor > 0 ? "cyan" : (isHeadshot ? "red" : "orange")); }
                for (let j = bots.length - 1; j >= 0; j--) { if (b.teamId !== bots[j].teamId && Math.hypot(b.x - bots[j].x, b.y - bots[j].y) < bots[j].radius + 5) { tiroD = true; processHit(bots[j], Math.hypot(b.x - bots[j].x, b.y - bots[j].y)); if (bots[j].hp <= 0) { if (b.ownerId === "player") progressoMissao(1, 1); if (b.ownerId === "player" && inventario.vampiro) { player.hp = Math.min(maxHp, player.hp + 20); mostrarDanoText(player.x, player.y, "+20 VAMP!", false, true); } bots.splice(j, 1); atualizarUI(); } break; } }
                if (!tiroD && player.hp > 0 && b.teamId !== player.teamId && !player.isJumping && Math.hypot(b.x - player.x, b.y - player.y) < player.radius + 5) { tiroD = true; processHit(player, Math.hypot(b.x - player.x, b.y - player.y)); }
                if (tiroD) bullets.splice(i, 1);
            }
        }

        function desenharPersonagem(x, y, angle, color, isJumping = false, armor = 0, teamId = 1, isBoss = false, hp = 100, maxHp = 100, skin = 'padrao') {
            ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.globalAlpha = isJumping ? 0.4 : 1.0;
            let escala = isBoss ? 2.5 : 1.0; ctx.scale(escala, escala);
            ctx.shadowColor = isBoss ? "rgba(255,77,109,0.7)" : (teamId === 1 ? "rgba(54,216,255,0.48)" : "rgba(255,77,109,0.42)");
            ctx.shadowBlur = isBoss ? 22 : 10;
            if (modoJogo !== 'solo' && teamId === 1 && !isBoss) { ctx.strokeStyle = "#2196F3"; ctx.lineWidth = 3 / escala; ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.stroke(); }
            if (skin === 'fantasma') ctx.globalAlpha = isJumping ? 0.2 : 0.6;
            if (skin === 'realeza') { ctx.fillStyle = "#D32F2F"; ctx.beginPath(); ctx.moveTo(-10, -12); ctx.lineTo(-25, -18); ctx.lineTo(-25, 18); ctx.lineTo(-10, 12); ctx.fill(); }
            if (skin === 'ciborgue') { ctx.fillStyle = "#FF0000"; ctx.beginPath(); ctx.moveTo(-10, -8); ctx.lineTo(-20, -12); ctx.lineTo(-20, 12); ctx.lineTo(-10, 8); ctx.fill(); }
            ctx.fillStyle = skin === 'deserto' ? "#4E342E" : (skin === 'fantasma' ? "rgba(0,0,0,0)" : "#111");
            ctx.beginPath(); ctx.arc(-10, -8, 5, 0, Math.PI * 2); ctx.arc(-10, 8, 5, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(-3, 0, 10, 16, 0, 0, Math.PI * 2); ctx.fill();
            if (skin === 'deserto') { ctx.fillStyle = "#8D6E63"; ctx.beginPath(); ctx.arc(-5, -6, 3, 0, Math.PI * 2); ctx.arc(-2, 8, 2.5, 0, Math.PI * 2); ctx.fill(); }
            if (skin === 'neon') { ctx.fillStyle = "#00FFFF"; ctx.fillRect(-6, -12, 3, 24); }
            if (skin === 'ciborgue') { ctx.fillStyle = "#2196F3"; ctx.fillRect(-5, -5, 8, 10); }
            ctx.fillStyle = (skin === 'ninja' || skin === 'fantasma' || skin === 'ciborgue') ? color : "#ffcc99";
            ctx.beginPath(); ctx.arc(10, -10, 5, 0, Math.PI * 2); ctx.arc(12, 6, 5, 0, Math.PI * 2); ctx.fill();
            if (skin === 'neon') { ctx.fillStyle = "#FFF"; ctx.fillRect(8, 3, 22, 5); ctx.fillStyle = "#00FFFF"; ctx.fillRect(26, 2, 6, 3); }
            else if (skin === 'deserto') { ctx.fillStyle = "#4E342E"; ctx.fillRect(8, 4, 26, 3); ctx.fillStyle = "#222"; ctx.fillRect(15, 2, 4, 2); }
            else if (skin === 'fantasma') { ctx.fillStyle = "#444"; ctx.fillRect(8, 4, 16, 4); ctx.fillStyle = "#111"; ctx.fillRect(24, 3, 8, 6); }
            else if (skin === 'realeza' || skin === 'dourada') { ctx.fillStyle = "#FFD700"; ctx.fillRect(8, 3, 20, 6); ctx.fillStyle = "#FFF"; ctx.fillRect(24, 2, 4, 8); }
            else if (skin === 'ciborgue') { ctx.fillStyle = "#555"; ctx.fillRect(8, 3, 25, 8); ctx.fillStyle = "#00FFFF"; ctx.fillRect(30, 4, 3, 6); }
            else { ctx.fillStyle = isBoss ? "#444" : "#333"; ctx.fillRect(8, 3, 20, 6); }
            ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
            if (skin === 'ninja') { ctx.fillStyle = "#D32F2F"; ctx.fillRect(-10, -4, 15, 8); ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(4, -3, 2, 0, Math.PI * 2); ctx.arc(4, 3, 2, 0, Math.PI * 2); ctx.fill(); }
            else if (skin === 'fantasma') { ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(4, -4, 3, 0, Math.PI * 2); ctx.arc(4, 4, 3, 0, Math.PI * 2); ctx.fill(); }
            else if (skin === 'deserto') { ctx.fillStyle = "#222"; ctx.fillRect(-2, -7, 8, 14); ctx.fillStyle = "#FF9800"; ctx.fillRect(0, -6, 6, 12); }
            else if (skin === 'ciborgue') { ctx.fillStyle = "#FF0000"; ctx.beginPath(); ctx.arc(4, -4, 2, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#000"; ctx.fillRect(4, 2, 4, 4); }
            else { ctx.fillStyle = "rgba(0,0,0,0.2)"; ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill(); }
            if (skin === 'realeza') { ctx.fillStyle = "#FFD700"; ctx.beginPath(); ctx.moveTo(-5, -10); ctx.lineTo(0, -16); ctx.lineTo(5, -10); ctx.fill(); }
            if (skin === 'ninja') { ctx.strokeStyle = "#777"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-12, -8); ctx.lineTo(-12, 8); ctx.stroke(); }
            else if (skin !== 'fantasma' && skin !== 'realeza') { ctx.fillStyle = "black"; ctx.fillRect(6, -5, 6, 10); }
            ctx.shadowBlur = 0;
            if (armor > 0) { ctx.strokeStyle = "rgba(54, 216, 255, 0.72)"; ctx.lineWidth = 3 / escala; ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.stroke(); }
            ctx.restore();
            if (isBoss || (modoJogo === 'boss' && teamId === 1 && color !== player.color)) { let barY = y - (isBoss ? 60 : 30); preencherRetanguloArredondado(x - 31, barY - 1, 62, 8, 4, "rgba(0,0,0,0.62)"); preencherRetanguloArredondado(x - 30, barY, 60 * Math.max(0, hp / maxHp), 6, 4, isBoss ? "#ff4d6d" : "#36d8ff"); }
        }

        function draw() {
            let bg = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
            bg.addColorStop(0, "#07090f"); bg.addColorStop(0.55, "#0b1420"); bg.addColorStop(1, "#07110f");
            ctx.fillStyle = bg; ctx.fillRect(0, 0, canvas.width, canvas.height);
            if (gameState === "MENU" || gameState === "GAMEOVER") return;
            ctx.save();
            if (player && player.hp > 0) { camX = canvas.width / 2 - player.x; camY = canvas.height / 2 - player.y; }
            else if (bots.length > 0) { let aliado = bots.find(b => b.teamId === (player ? player.teamId : 1)); if (aliado) { camX = canvas.width / 2 - aliado.x; camY = canvas.height / 2 - aliado.y; } else { camX = canvas.width / 2 - 750; camY = canvas.height / 2 - 750; } }
            ctx.translate(camX, camY);

            let arenaGrad = ctx.createLinearGradient(0, 0, arena.width, arena.height);
            arenaGrad.addColorStop(0, "#162130"); arenaGrad.addColorStop(0.48, "#202d32"); arenaGrad.addColorStop(1, "#121a24");
            ctx.fillStyle = arenaGrad; ctx.fillRect(arena.x, arena.y, arena.width, arena.height);
            ctx.strokeStyle = "rgba(54,216,255,0.08)"; ctx.lineWidth = 1; for (let i = 0; i <= arena.width; i += 50) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, arena.height); ctx.stroke(); } for (let i = 0; i <= arena.height; i += 50) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(arena.width, i); ctx.stroke(); }
            ctx.strokeStyle = "rgba(255,255,255,0.075)"; ctx.lineWidth = 1.5; for (let i = 0; i <= arena.width; i += 250) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, arena.height); ctx.stroke(); } for (let i = 0; i <= arena.height; i += 250) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(arena.width, i); ctx.stroke(); }
            ctx.strokeStyle = "rgba(255,255,255,0.16)"; ctx.lineWidth = 8; ctx.strokeRect(arena.x + 4, arena.y + 4, arena.width - 8, arena.height - 8);
            ctx.strokeStyle = "rgba(54,216,255,0.35)"; ctx.lineWidth = 2; ctx.strokeRect(arena.x + 14, arena.y + 14, arena.width - 28, arena.height - 28);
            if (modoJogo !== 'boss') { ctx.save(); ctx.fillStyle = "rgba(2, 5, 9, 0.62)"; ctx.beginPath(); ctx.rect(arena.x, arena.y, arena.width, arena.height); ctx.arc(750, 750, Math.max(0, safeZone.radius), 0, Math.PI * 2, true); ctx.fill(); let pulso = 0.45 + Math.sin(Date.now() / 180) * 0.18; ctx.strokeStyle = `rgba(255, 77, 109, ${pulso})`; ctx.shadowColor = "rgba(255,77,109,0.65)"; ctx.shadowBlur = 18; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(750, 750, Math.max(0, safeZone.radius), 0, Math.PI * 2); ctx.stroke(); ctx.shadowBlur = 0; ctx.restore(); }
            else { ctx.save(); ctx.fillStyle = "rgba(255, 77, 109, 0.08)"; ctx.fillRect(arena.x, arena.y, arena.width, arena.height); ctx.strokeStyle = "rgba(255,77,109,0.28)"; ctx.lineWidth = 3; ctx.strokeRect(arena.x + 22, arena.y + 22, arena.width - 44, arena.height - 44); ctx.restore(); }

            walls.forEach(w => { ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.42)"; ctx.shadowBlur = 14; ctx.shadowOffsetY = 8; preencherRetanguloArredondado(w.x, w.y, w.width, w.height, 6, "#485462", "rgba(197,218,239,0.18)", 2); ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; ctx.strokeStyle = "rgba(255,255,255,0.13)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(w.x + 8, w.y + 8); ctx.lineTo(w.x + w.width - 8, w.y + w.height - 8); ctx.stroke(); ctx.restore(); });
            caixas.forEach(cx => { let accent = cx.tipo === "vida" ? "#ff4d6d" : (cx.tipo === "arma" ? "#ffd166" : (cx.tipo === "escudo" ? "#36d8ff" : "#63f0a0")); ctx.save(); ctx.translate(cx.x, cx.y); ctx.shadowColor = accent; ctx.shadowBlur = 12; preencherRetanguloArredondado(-cx.size / 2, -cx.size / 2, cx.size, cx.size, 5, "#6b4a28", "rgba(255,255,255,0.22)", 2); ctx.shadowBlur = 0; ctx.strokeStyle = "rgba(0,0,0,0.38)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-cx.size / 2 + 4, -cx.size / 4); ctx.lineTo(cx.size / 2 - 4, -cx.size / 4); ctx.moveTo(-cx.size / 2 + 4, cx.size / 4); ctx.lineTo(cx.size / 2 - 4, cx.size / 4); ctx.stroke(); ctx.fillStyle = accent; ctx.font = "bold 15px Arial"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; if (cx.tipo === "vida") ctx.fillText("♥", 0, 0); if (cx.tipo === "arma") ctx.fillText("⚔", 0, 0); if (cx.tipo === "escudo") ctx.fillText("◆", 0, 0); if (cx.tipo === "velocidade") ctx.fillText("⚡", 0, 0); ctx.restore(); });
            explosions.forEach(ex => { let grad = ctx.createRadialGradient(ex.x, ex.y, 0, ex.x, ex.y, ex.radius); grad.addColorStop(0, `rgba(255, 255, 0, ${ex.life})`); grad.addColorStop(0.5, `rgba(255, 0, 0, ${ex.life})`); grad.addColorStop(1, `rgba(0, 0, 0, 0)`); ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(ex.x, ex.y, ex.radius, 0, Math.PI * 2); ctx.fill(); });

            bombs.forEach(b => { ctx.save(); ctx.translate(b.x, b.y); let s = b.skin || 'padrao'; if (s === 'neon') { ctx.fillStyle = "#39FF14"; ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.beginPath(); ctx.arc(-2, -2, 2, 0, Math.PI * 2); ctx.fill(); } else if (s === 'dourada') { ctx.fillStyle = "#FFD700"; ctx.fillRect(-5, -5, 10, 10); } else if (s === 'realeza') { ctx.fillStyle = "#9C27B0"; ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = "#FFD700"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.stroke(); } else if (s === 'deserto') { ctx.fillStyle = "#C2B280"; ctx.fillRect(-4, -4, 8, 8); ctx.fillStyle = "#4E342E"; ctx.fillRect(-2, -2, 4, 4); } else if (s === 'fantasma') { ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill(); } else if (s === 'ciborgue') { ctx.fillStyle = "#00FFFF"; ctx.fillRect(-4, -4, 8, 8); } else if (s === 'ninja') { ctx.fillStyle = "#333"; ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#000"; ctx.fillRect(-2, -6, 4, 12); ctx.fillRect(-6, -2, 12, 4); } else { ctx.fillStyle = "#222"; ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill(); if (Math.floor(Date.now() / 150) % 2 === 0) { ctx.fillStyle = "red"; ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill(); } } ctx.restore(); });
            slashes.forEach(sl => { ctx.save(); ctx.translate(sl.x, sl.y); ctx.rotate(sl.angle); let s = sl.skin || 'padrao'; let c = "cyan"; if (s === 'neon') c = "#39FF14"; else if (s === 'ninja') c = "red"; else if (s === 'fantasma') c = "white"; else if (s === 'realeza') c = "#9C27B0"; else if (s === 'dourada') c = "#FFD700"; else if (s === 'deserto') c = "#FF9800"; else if (s === 'ciborgue') c = "#00FFFF"; if (sl.skin === "boss") c = "red"; ctx.globalAlpha = sl.life; ctx.strokeStyle = c; ctx.lineWidth = 10; ctx.beginPath(); ctx.arc(0, 0, sl.radius || 35, -Math.PI / 3, Math.PI / 3); ctx.stroke(); ctx.restore(); });
            particles.forEach(p => { ctx.fillStyle = p.color; ctx.globalAlpha = p.life; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1.0; });

            if (player && player.hp > 0) desenharPersonagem(player.x, player.y, player.angle, player.color, player.isJumping, player.armor, player.teamId, false, player.hp, inventario.tita ? 150 : 100, player.skin);

            bots.forEach(bot => {
                if (bot.isBoss) {
                    if (!bot.reforco) {
                        bot.reforco = { ...motorReforco };
                        bot.acaoAtual = 'perseguir';
                    }

                    bot.acaoAtual = bot.reforco.escolherAcao();

                    if (Date.now % 2000 < 20) {
                        console.log("IA do Chefão - Ação Atual:", bot.acaoAtual);
                        console.log("Pesos (Scores):", bot.reforco.acoes);
                    }

                    switch (bot.acaoAtual) {
                        case 'perseguir':
                            let angulo = Math.atan2(player.y - bot.y, player.x - bot.x);
                            bot.x += Math.cos(angulo) * 1.5;
                            bot.y += Math.sin(angulo) * 1.5;
                            break;
                        case 'esquivar':
                            bot.x += Math.cos(bot.angle + Math.PI / 2) * 2;
                            break;
                    }
                }

                desenharPersonagem(bot.x, bot.y, bot.angle, bot.color, false, bot.armor, bot.teamId, bot.isBoss, bot.hp, bot.maxHp || 100, bot.skin);
            });

            bullets.forEach(b => { ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.angle); let s = b.skin || 'padrao'; let bulletColor = (player && b.teamId === player.teamId) ? "#ffd166" : (b.damage > 15 ? "#ff4d6d" : "#ff8a3d"); ctx.shadowColor = bulletColor; ctx.shadowBlur = 12; ctx.strokeStyle = bulletColor; ctx.lineWidth = b.damage > 15 ? 5 : 3; ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(2, 0); ctx.stroke(); if (s === 'neon') { ctx.fillStyle = "#63f0a0"; ctx.beginPath(); ctx.ellipse(0, 0, 6, 3, 0, 0, Math.PI * 2); ctx.fill(); } else if (s === 'ninja') { ctx.rotate(Date.now() / 50); ctx.fillStyle = "#d7e8f8"; ctx.fillRect(-4, -1, 8, 2); ctx.fillRect(-1, -4, 2, 8); } else if (s === 'fantasma') { ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.stroke(); } else if (s === 'dourada') { ctx.fillStyle = "#FFD700"; ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(0, -4); ctx.lineTo(4, 0); ctx.lineTo(0, 4); ctx.fill(); } else if (s === 'realeza') { ctx.fillStyle = "#B36BFF"; ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(-4, -3); ctx.lineTo(-4, 3); ctx.fill(); } else if (s === 'deserto') { ctx.fillStyle = "#C2B280"; ctx.fillRect(-4, -1, 8, 2); } else if (s === 'ciborgue') { ctx.fillStyle = "#36d8ff"; ctx.fillRect(-3, -3, 6, 6); } else { ctx.fillStyle = bulletColor; ctx.beginPath(); ctx.arc(0, 0, b.damage > 15 ? 5 : 4, 0, Math.PI * 2); ctx.fill(); } ctx.restore(); });
            basucas.forEach(bz => { ctx.save(); ctx.shadowColor = "rgba(255,77,109,0.85)"; ctx.shadowBlur = 16; ctx.fillStyle = "#c4cbd4"; ctx.beginPath(); ctx.ellipse(bz.x, bz.y, 10, 5, bz.angle, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#ff4d6d"; ctx.beginPath(); ctx.arc(bz.x - Math.cos(bz.angle) * 10, bz.y - Math.sin(bz.angle) * 10, 4, 0, Math.PI * 2); ctx.fill(); ctx.restore(); });

            damageTexts.forEach(dt => { ctx.fillStyle = dt.color; ctx.globalAlpha = dt.life; ctx.font = `bold ${dt.size}px Arial`; ctx.fillText(dt.text, dt.x, dt.y); ctx.globalAlpha = 1.0; });
            ctx.restore();
            desenharMira();
            desenharMinimapa();

            if (gameState === "COUNTDOWN") { let tR = Math.ceil((gameStartTime - Date.now()) / 1000); let texto = tR > 0 ? tR : (modoJogo === 'boss' ? "MATE O TITÃ!" : "VAI!"); ctx.fillStyle = "white"; ctx.shadowColor = "rgba(54,216,255,0.55)"; ctx.shadowBlur = 26; ctx.font = "bold 80px Arial"; ctx.textAlign = "center"; ctx.fillText(texto, canvas.width / 2, canvas.height / 2); ctx.shadowBlur = 0; ctx.textAlign = "left"; }
            if (modoJogo !== 'solo' && player && player.hp <= 0 && gameState === "PLAYING") { ctx.fillStyle = "gold"; ctx.font = "bold 24px Arial"; ctx.textAlign = "center"; ctx.fillText("ASSISTINDO ALIADO...", canvas.width / 2, 80); ctx.textAlign = "left"; }
        }
        function gameLoop() { update(); draw(); requestAnimationFrame(gameLoop); }

        mostrarTela("menuPrincipal"); atualizarMenus(); atualizarMenuModo(); gameLoop();