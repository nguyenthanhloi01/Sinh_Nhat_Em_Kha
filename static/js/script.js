
"use strict";

// ===============================
// 1. LẤY CÁC PHẦN TỬ HTML
// ===============================
const fog = document.getElementById("fogCanvas");
const effects = document.getElementById("effectsCanvas");
const hint = document.getElementById("hint");
const music = document.getElementById("backgroundMusic");
const replay = document.getElementById("replayButton");
const eraser = document.getElementById("eraser");

if (!fog || !effects) {
    console.error("Không tìm thấy fogCanvas hoặc effectsCanvas trong HTML.");
} else {
    const ctx = fog.getContext("2d", { willReadFrequently: true });
    const fx = effects.getContext("2d");

    let width = 0;
    let height = 0;
    let dpr = 1;

    let drawing = false;
    let unlocked = false;
    let autoRunning = false;
    let musicStarted = false;
    let lastPoint = null;
    let progress = 0;
    let lastMeasureTime = 0;
    let autoStartTimer = null;

    let particles = [];
    let balloons = [];
    let rockets = []; // Tên lửa pháo hoa bay lên
    let animationStarted = false;

    const brushSize = 42;
    const threshold = 0.5;

    // ===============================
    // 2. NHẠC NỀN
    // ===============================
    if (music) {
        music.volume = 0.65;
        music.loop = true;
    }

    function startBackgroundMusic() {
        if (!music || musicStarted) return;

        const result = music.play();

        if (result && typeof result.then === "function") {
            result.then(() => {
                musicStarted = true;

                if (hint && !unlocked) {
                    updateHint();
                }
            }).catch(() => {
                if (hint && !unlocked) {
                    hint.textContent =
                        "🎵 Chạm vào màn hình lẹ lên";
                    hint.style.opacity = "1";
                }
            });
        }
    }

    document.addEventListener("pointerdown", () => {
        if (!musicStarted) {
            startBackgroundMusic();
        }
    });

    function updateHint() {
        if (!hint) return;

        hint.innerHTML =
            '✨một chút nữa nhé hehe <span id="percent">' +
            Math.round(progress * 100) + "%</span>";
    }

    // ===============================
    // 3. KHỞI TẠO CANVAS
    // ===============================
    function resizeCanvas(preserve = false) {
        let oldFog = null;

        // Lưu lớp sương cũ để không mất tiến độ khi đổi kích thước.
        if (preserve && fog.width > 0 && fog.height > 0) {
            oldFog = document.createElement("canvas");
            oldFog.width = fog.width;
            oldFog.height = fog.height;
            oldFog.getContext("2d").drawImage(fog, 0, 0);
        }

        width = window.innerWidth;
        height = window.innerHeight;
        dpr = Math.min(window.devicePixelRatio || 1, 2);

        [fog, effects].forEach(canvas => {
            canvas.width = Math.round(width * dpr);
            canvas.height = Math.round(height * dpr);
            canvas.style.width = width + "px";
            canvas.style.height = height + "px";
        });

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        fx.setTransform(dpr, 0, 0, dpr, 0, 0);

        if (oldFog) {
            ctx.drawImage(oldFog, 0, 0, width, height);
        }
    }

    function paintFog() {
        ctx.save();
        ctx.globalCompositeOperation = "source-over";
        ctx.clearRect(0, 0, width, height);

        const gradient = ctx.createLinearGradient(
            0, 0, width, height
        );

        gradient.addColorStop(0, "#d9e5e1");
        gradient.addColorStop(0.5, "#bdcfcc");
        gradient.addColorStop(1, "#dce5e1");

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);

        for (let i = 0; i < 35; i++) {
            const x = Math.random() * width;
            const y = Math.random() * height;
            const radius = 40 + Math.random() * 120;

            const mist = ctx.createRadialGradient(
                x, y, 0, x, y, radius
            );

            mist.addColorStop(0, "rgba(255,255,255,0.2)");
            mist.addColorStop(1, "rgba(255,255,255,0)");

            ctx.fillStyle = mist;
            ctx.fillRect(
                x - radius, y - radius,
                radius * 2, radius * 2
            );
        }

        ctx.restore();
    }

    // ===============================
    // 4. LAU SƯƠNG BẰNG CHUỘT
    // ===============================
    function getPoint(event) {
        const rect = fog.getBoundingClientRect();

        return {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
        };
    }

    function erase(point, previous = null) {
        ctx.save();
        ctx.globalCompositeOperation = "destination-out";
        ctx.lineWidth = brushSize * 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        ctx.beginPath();

        if (previous) {
            ctx.moveTo(previous.x, previous.y);
            ctx.lineTo(point.x, point.y);
            ctx.stroke();
        } else {
            ctx.arc(point.x, point.y, brushSize, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }

    function start(event) {
        if (unlocked || autoRunning) return;

        startBackgroundMusic();

        drawing = true;
        lastPoint = getPoint(event);

        if (fog.setPointerCapture) {
            try {
                fog.setPointerCapture(event.pointerId);
            } catch (_) {}
        }

        erase(lastPoint);
        measureProgress(true);
    }

    function move(event) {
        if (!drawing || unlocked || autoRunning) return;

        const point = getPoint(event);

        erase(point, lastPoint);
        lastPoint = point;

        measureProgress();
    }

    function stop() {
        drawing = false;
        lastPoint = null;
        measureProgress(true);
    }

    // ===============================
    // 5. TÍNH PHẦN TRĂM SƯƠNG ĐÃ LAU
    // ===============================
    function measureProgress(force = false) {
        if (unlocked) return;

        const now = performance.now();

        if (!force && now - lastMeasureTime < 300) return;
        lastMeasureTime = now;

        const image = ctx.getImageData(
            0, 0, fog.width, fog.height
        );

        const pixels = image.data;
        const stepX = Math.max(1, Math.floor(fog.width / 100));
        const stepY = Math.max(1, Math.floor(fog.height / 100));

        let clear = 0;
        let total = 0;

        for (let y = 0; y < fog.height; y += stepY) {
            for (let x = 0; x < fog.width; x += stepX) {
                const alpha = pixels[(y * fog.width + x) * 4 + 3];

                if (alpha < 80) clear++;
                total++;
            }
        }

        progress = total ? clear / total : 0;

        const percent = document.getElementById("percent");
        if (percent) {
            percent.textContent =
                Math.round(progress * 100) + "%";
        }

        if (progress >= threshold) {
            unlockSurprise();
        }
    }

    // ===============================
    // 6. CỤC TẨY TỰ ĐỘNG
    // ===============================
    function startAutomaticErasing() {
        if (unlocked || autoRunning || !eraser) return;

        autoRunning = true;
        eraser.classList.add("show");
        startBackgroundMusic();

        const margin = Math.min(
            brushSize + 12,
            Math.min(width, height) / 3
        );

        let x = width / 2;
        let y = height / 2;
        let targetX = x;
        let targetY = y;
        let targetTime = performance.now();

        const cols = Math.max(
            3, Math.ceil(width / (brushSize * 2.2))
        );
        const rows = Math.max(
            3, Math.ceil(height / (brushSize * 2.2))
        );

        const targets = [];

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                targets.push({
                    x: margin +
                        (width - margin * 2) * (col + 0.5) / cols,
                    y: margin +
                        (height - margin * 2) * (row + 0.5) / rows
                });
            }
        }

        // Xáo trộn lộ trình để cục tẩy di chuyển tự nhiên.
        for (let i = targets.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [targets[i], targets[j]] = [targets[j], targets[i]];
        }

        let targetIndex = 0;

        function chooseTarget() {
            if (targetIndex < targets.length) {
                targetX = targets[targetIndex].x;
                targetY = targets[targetIndex].y;
                targetIndex++;
            } else {
                targetX = margin +
                    Math.random() * Math.max(1, width - margin * 2);
                targetY = margin +
                    Math.random() * Math.max(1, height - margin * 2);
            }

            targetTime = performance.now();
        }

        function frame(now) {
            if (unlocked) {
                eraser.classList.remove("show");
                autoRunning = false;
                return;
            }

            if (
                Math.hypot(targetX - x, targetY - y) < 15 ||
                now - targetTime > 4000
            ) {
                chooseTarget();
            }

            const oldX = x;
            const oldY = y;

            // Tốc độ thấp tạo chuyển động chậm, mượt.
            const easing = 0.1;
            x += (targetX - x) * easing;
            y += (targetY - y) * easing;

            ctx.save();
            ctx.globalCompositeOperation = "destination-out";
            ctx.lineWidth = brushSize * 2;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";

            ctx.beginPath();
            ctx.moveTo(oldX, oldY);
            ctx.lineTo(x, y);
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(x, y, brushSize, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            const angle = Math.atan2(y - oldY, x - oldX);
            const rotation = Math.max(
                -18, Math.min(18, angle * 180 / Math.PI * 0.15)
            );

            eraser.style.left = x + "px";
            eraser.style.top = y + "px";
            eraser.style.transform =
                `translate(-50%, -50%) rotate(${rotation}deg)`;

            measureProgress();

            if (!unlocked) {
                requestAnimationFrame(frame);
            }
        }

        chooseTarget();
        requestAnimationFrame(frame);
    }

    // ===============================
    // 7. MỞ LỜI CHÚC
    // ===============================
    function unlockSurprise() {
        if (unlocked) return;

        unlocked = true;
        autoRunning = false;
        drawing = false;

        if (eraser) eraser.classList.remove("show");
        if (hint) hint.style.opacity = "0";

        fog.style.transition = "opacity 1.5s ease";
        fog.style.opacity = "0";

        launchFireworks();
        createBalloons();
    }

    // ===============================
    // 8. PHÁO HOA
    // ===============================
    function random(min, max) {
        return Math.random() * (max - min) + min;
    }

    
function launchFireworks() {
    if (!animationStarted) {
        animationStarted = true;
        animate();
    }

    // Phóng nhiều quả pháo, cách nhau một khoảng thời gian.
    for (let i = 0; i < 10; i++) {
        setTimeout(() => {
            launchRocket();
        }, i * 420);
    }
}

// Tạo một quả pháo bay từ dưới lên.
function launchRocket() {
    if (!unlocked) return;

    const x = random(width * 0.15, width * 0.85);
    const targetY = random(height * 0.12, height * 0.48);

    rockets.push({
        x: x,
        y: height + 10,
        vx: random(-1.2, 1.2),
        vy: random(-10.5, -8.5),
        targetY: targetY,
        hue: random(0, 360),
        trail: [],
        exploded: false
    });
}

// Nổ thành chùm pháo hoa lớn.
function explodeFirework(x, y, hue) {
    const count = Math.floor(random(100, 220));
    const type = Math.floor(random(0, 4));

    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;

        // Phân bố tốc độ để chùm pháo tròn và đầy đặn.
        const speed = type === 0
            ? random(2, 8)
            : random(2, 5.5);

        particles.push({
            x: x,
            y: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: random(55, 100),
            maxLife: 100,
            hue: (hue + random(-25, 25) + 360) % 360,
            size: random(1.5, 3.5),
            gravity: 0.045,
            sparkle: Math.random() < 0.35
        });
    }

    // Một vòng sáng nhỏ ngay lúc phát nổ.
    particles.push({
        x, y,
        vx: 0,
        vy: 0,
        life: 18,
        maxLife: 18,
        hue,
        size: 16,
        gravity: 0,
        shockwave: true
    });
}



    // ===============================
    // 9. BÓNG BAY
    // ===============================
    function createBalloons() {
        const colors = [
            "#f0c77a", "#9dd8c8", "#e8a6bc",
            "#a8b8ef", "#f5eee0"
        ];

        for (let i = 0; i < 22; i++) {
            balloons.push({
                x: random(0, width),
                y: random(height * 0.5, height + 100),
                radius: random(10, 18),
                speed: random(0.5, 1.3),
                color: colors[i % colors.length],
                phase: random(0, 6)
            });
        }
    }

    // ===============================
    // 10. VẼ HIỆU ỨNG
    // ===============================
   
function animate() {
    fx.clearRect(0, 0, width, height);

    // -------------------------------
    // TÊN LỬA BAY LÊN
    // -------------------------------
    rockets = rockets.filter(rocket => !rocket.exploded);

    rockets.forEach(rocket => {
        rocket.trail.push({ x: rocket.x, y: rocket.y });

        if (rocket.trail.length > 9) {
            rocket.trail.shift();
        }

        // Vẽ đuôi sáng kéo dài phía sau tên lửa.
        for (let i = 0; i < rocket.trail.length; i++) {
            const point = rocket.trail[i];

            fx.beginPath();
            fx.fillStyle = `hsla(${rocket.hue}, 100%, 70%, ${
                (i + 1) / rocket.trail.length * 0.65
            })`;
            fx.arc(
                point.x,
                point.y,
                1 + (i / rocket.trail.length) * 2,
                0,
                Math.PI * 2
            );
            fx.fill();
        }

        // Đầu tên lửa sáng rực.
        fx.save();
        fx.shadowBlur = 20;
        fx.shadowColor = `hsl(${rocket.hue}, 100%, 70%)`;
        fx.fillStyle = "#ffffff";
        fx.beginPath();
        fx.arc(rocket.x, rocket.y, 3.5, 0, Math.PI * 2);
        fx.fill();
        fx.restore();

        rocket.x += rocket.vx;
        rocket.y += rocket.vy;
        rocket.vy += 0.045;

        // Đến độ cao mong muốn thì phát nổ.
        if (
            rocket.y <= rocket.targetY ||
            rocket.vy >= -0.5
        ) {
            rocket.exploded = true;
            explodeFirework(rocket.x, rocket.y, rocket.hue);
        }
    });

    // -------------------------------
    // HẠT PHÁO HOA
    // -------------------------------
    particles = particles.filter(p => p.life > 0);

    particles.forEach(p => {
        const ratio = Math.max(0, p.life / p.maxLife);

        fx.save();
        fx.globalAlpha = ratio;

        if (p.shockwave) {
            // Vòng sáng bung rộng khi pháo nổ.
            const radius = (18 - p.life) * 2.5;

            fx.strokeStyle = `hsla(${p.hue}, 100%, 80%, ${ratio})`;
            fx.lineWidth = 2;
            fx.beginPath();
            fx.arc(p.x, p.y, radius, 0, Math.PI * 2);
            fx.stroke();
        } else {
            const lightness = p.sparkle && Math.random() < 0.3
                ? 95
                : 65;

            fx.fillStyle =
                `hsl(${p.hue}, 100%, ${lightness}%)`;
            fx.shadowBlur = p.sparkle ? 15 : 8;
            fx.shadowColor = `hsl(${p.hue}, 100%, 70%)`;

            fx.beginPath();
            fx.arc(
                p.x,
                p.y,
                p.size || 2,
                0,
                Math.PI * 2
            );
            fx.fill();

            // Một vài tia lấp lánh nhỏ.
            if (p.sparkle && Math.random() < 0.15) {
                fx.strokeStyle = "#ffffff";
                fx.lineWidth = 1;
                fx.beginPath();
                fx.moveTo(p.x - 3, p.y);
                fx.lineTo(p.x + 3, p.y);
                fx.moveTo(p.x, p.y - 3);
                fx.lineTo(p.x, p.y + 3);
                fx.stroke();
            }
        }

        fx.restore();

        if (!p.shockwave) {
            p.x += p.vx;
            p.y += p.vy;

            p.vx *= 0.985;
            p.vy = p.vy * 0.985 + (p.gravity || 0.045);
        }

        p.life--;
    });

    // -------------------------------
    // BÓNG BAY
    // -------------------------------
    balloons.forEach(b => {
        fx.save();
        fx.globalAlpha = 0.85;
        fx.fillStyle = b.color;

        fx.beginPath();
        fx.ellipse(
            b.x, b.y,
            b.radius * 0.8,
            b.radius,
            0, 0, Math.PI * 2
        );
        fx.fill();

        fx.strokeStyle = "rgba(255,255,255,0.6)";
        fx.beginPath();
        fx.moveTo(b.x, b.y + b.radius);
        fx.lineTo(b.x + 2, b.y + b.radius + 25);
        fx.stroke();
        fx.restore();

        b.y -= b.speed;
        b.x += Math.sin(b.phase) * 0.3;
        b.phase += 0.02;

        if (b.y < -40) {
            b.y = height + random(20, 120);
            b.x = random(0, width);
        }
    });

    // Thỉnh thoảng phóng thêm pháo khi lời chúc đã mở.
    if (
        unlocked &&
        Math.random() < 0.012 &&
        rockets.length < 4
    ) {
        launchRocket();
    }

    if (unlocked || particles.length > 0 || rockets.length > 0) {
        requestAnimationFrame(animate);
    } else {
        animationStarted = false;
    }
}


      
     
     
    

        

    // ===============================
    // 11. SỰ KIỆN
    // ===============================
    fog.addEventListener("pointerdown", start);
    fog.addEventListener("pointermove", move);
    fog.addEventListener("pointerup", stop);
    fog.addEventListener("pointercancel", stop);

    if (replay) {
        replay.addEventListener("click", () => {
            if (autoStartTimer) clearTimeout(autoStartTimer);
            window.location.reload();
        });
    }

    window.addEventListener("resize", () => {
        resizeCanvas(true);
    });

    // ===============================
    // 12. KHỞI ĐỘNG
    // ===============================
    function initialize() {
        resizeCanvas(false);
        paintFog();
        updateHint();

        autoStartTimer = setTimeout(() => {
            startBackgroundMusic();
            startAutomaticErasing();
        }, 1000);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize, {
            once: true
        });
    } else {
        initialize();
    }
}
