/**
 * Countdown Timer — 純前端 controller
 *
 * 狀態機:  idle → running → (paused → running)* → finished → idle
 *
 * 警示分層:
 *   normal  : 剩餘 > max(10% of total, 60s)
 *   warn    : 剩餘 ≤ max(10% of total, 60s) 但 > 30s
 *   danger  : 剩餘 ≤ 30s
 *
 * 音效:   Web Audio API 合成 (無外部檔)
 *   - 滴答聲 (最後 10 秒) - 可選
 *   - 結束鈴 (三聲和弦)
 *
 * 鍵盤:   Space=start/pause, R=reset, F=fullscreen, Esc=exit fullscreen
 */
(function () {
    'use strict';

    const $ = (s) => document.querySelector(s);
    const RING_CIRC = 1156; // 2π × 184

    // ───── 狀態 ─────
    const state = {
        phase: 'idle',       // idle | running | paused | finished
        totalMs: 5 * 60000,  // 預設 5 分鐘
        remainingMs: 5 * 60000,
        endAt: 0,            // running 時的絕對終點 (Date.now())
        rafId: 0,
        muted: false,
    };

    // ───── Web Audio (lazy init) ─────
    let audioCtx = null;
    function ensureAudio() {
        if (!audioCtx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (AC) audioCtx = new AC();
        }
        // Safari: 需使用者互動後才能 resume
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
        return audioCtx;
    }
    function beep(freq, dur = 0.12, vol = 0.35, when = 0, type = 'sine') {
        if (state.muted) return;
        const ctx = ensureAudio();
        if (!ctx) return;
        const now = ctx.currentTime + when;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(vol, now + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now);
        osc.stop(now + dur + 0.05);
    }
    function tick() { beep(880, 0.05, 0.18); }
    function doneChord() {
        // 三和弦 G4 B4 D5
        beep(392, 0.7, 0.32, 0.0);
        beep(523.25, 0.7, 0.28, 0.08);
        beep(659.25, 0.9, 0.32, 0.16);
        // 第二次
        beep(392, 0.5, 0.25, 1.0);
        beep(659.25, 0.5, 0.25, 1.0);
    }

    // ───── 顯示 ─────
    function formatTime(ms) {
        const total = Math.max(0, Math.ceil(ms / 1000));
        const h = Math.floor(total / 3600);
        const m = Math.floor((total % 3600) / 60);
        const s = total % 60;
        const pad = (n) => String(n).padStart(2, '0');
        return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
    }
    function formatTarget(ms) {
        const total = Math.ceil(ms / 1000);
        const h = Math.floor(total / 3600);
        const m = Math.floor((total % 3600) / 60);
        const s = total % 60;
        if (h > 0) return `${h}h ${m}m`;
        if (m > 0) return s > 0 ? `${m}m ${s}s` : `${m} ${i18n.t('tools.cd.min')}`;
        return `${s} ${i18n.t('tools.cd.sec')}`;
    }

    function render() {
        const rem = state.remainingMs;
        const total = state.totalMs;
        $('#cdTime').textContent = formatTime(rem);
        $('#cdTarget').textContent = formatTarget(total);

        // 進度環 (剩餘 0 → offset RING_CIRC, 剩餘 total → offset 0)
        const ratio = total > 0 ? rem / total : 0;
        const offset = RING_CIRC * (1 - ratio);
        $('#cdRingProgress').style.strokeDashoffset = offset;

        // 警示等級
        document.body.classList.remove('cd-state-warn', 'cd-state-danger');
        const warnThreshold = Math.max(total * 0.10, 60000);
        let level = 'normal';
        if (state.phase === 'running' || state.phase === 'paused') {
            if (rem <= 30000) level = 'danger';
            else if (rem <= warnThreshold) level = 'warn';
        }
        if (level === 'warn') document.body.classList.add('cd-state-warn');
        if (level === 'danger') document.body.classList.add('cd-state-danger');

        // State badge
        const badge = $('#cdStateBadge');
        badge.className = 'cd-statebadge';
        let badgeText = '';
        if (state.phase === 'running') {
            badge.classList.add('show', level === 'danger' ? 'danger' : (level === 'warn' ? 'warn' : 'running'));
            badgeText = level === 'danger' ? '即將結束' : (level === 'warn' ? '倒數中' : '進行中');
        } else if (state.phase === 'paused') {
            badge.classList.add('show', 'paused');
            badgeText = '已暫停';
        }
        badge.textContent = badgeText;

        // 按鈕顯示
        $('#cdStart').style.display  = (state.phase === 'idle')    ? '' : 'none';
        $('#cdPause').style.display  = (state.phase === 'running') ? '' : 'none';
        $('#cdResume').style.display = (state.phase === 'paused')  ? '' : 'none';
    }

    // ───── 狀態轉換 ─────
    function setTotal(ms) {
        state.totalMs = ms;
        state.remainingMs = ms;
        state.phase = 'idle';
        render();
    }

    function start() {
        if (state.totalMs <= 0) return;
        ensureAudio();
        state.phase = 'running';
        state.endAt = Date.now() + state.remainingMs;
        loop();
        render();
    }
    function pause() {
        if (state.phase !== 'running') return;
        state.phase = 'paused';
        state.remainingMs = Math.max(0, state.endAt - Date.now());
        cancelAnimationFrame(state.rafId);
        render();
    }
    function resume() {
        if (state.phase !== 'paused') return;
        state.phase = 'running';
        state.endAt = Date.now() + state.remainingMs;
        loop();
        render();
    }
    function reset() {
        state.phase = 'idle';
        state.remainingMs = state.totalMs;
        cancelAnimationFrame(state.rafId);
        document.body.classList.remove('cd-state-warn', 'cd-state-danger');
        render();
    }

    // rAF 迴圈 — 每幀重新計算剩餘時間,避免 setInterval 漂移
    let lastTickSec = -1;
    function loop() {
        if (state.phase !== 'running') return;
        const now = Date.now();
        const rem = state.endAt - now;
        state.remainingMs = Math.max(0, rem);

        // 滴答音效 (剩 10 秒起,每秒一次)
        const curSec = Math.ceil(state.remainingMs / 1000);
        if (curSec !== lastTickSec) {
            if (curSec > 0 && curSec <= 10) tick();
            lastTickSec = curSec;
        }

        render();

        if (rem <= 0) {
            finish();
            return;
        }
        state.rafId = requestAnimationFrame(loop);
    }

    function finish() {
        state.phase = 'finished';
        state.remainingMs = 0;
        render();
        doneChord();
        $('#cdDone').hidden = false;
        // 自動在 10 秒後回到 idle
        setTimeout(() => {
            if (state.phase === 'finished') reset();
        }, 10000);
    }

    // ───── 事件綁定 ─────
    function initPresets() {
        document.querySelectorAll('.cd-preset').forEach(btn => {
            btn.addEventListener('click', () => {
                const sec = parseInt(btn.dataset.sec, 10);
                setTotal(sec * 1000);
                document.querySelectorAll('.cd-preset').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                // 同步自訂輸入框
                $('#cdInHH').value = Math.floor(sec / 3600);
                $('#cdInMM').value = Math.floor((sec % 3600) / 60);
                $('#cdInSS').value = sec % 60;
            });
        });
    }
    function initCustom() {
        $('#cdSetCustom').addEventListener('click', () => {
            const hh = parseInt($('#cdInHH').value, 10) || 0;
            const mm = parseInt($('#cdInMM').value, 10) || 0;
            const ss = parseInt($('#cdInSS').value, 10) || 0;
            const sec = hh * 3600 + mm * 60 + ss;
            if (sec <= 0) return;
            setTotal(sec * 1000);
            document.querySelectorAll('.cd-preset').forEach(b => b.classList.remove('active'));
        });
    }
    function initActions() {
        $('#cdStart').addEventListener('click', start);
        $('#cdPause').addEventListener('click', pause);
        $('#cdResume').addEventListener('click', resume);
        $('#cdReset').addEventListener('click', reset);
        $('#cdMute').addEventListener('click', () => {
            state.muted = !state.muted;
            $('#cdMute').setAttribute('aria-pressed', state.muted ? 'true' : 'false');
        });
    }
    function initFullscreen() {
        const btn = $('#cdFullscreen');
        btn.addEventListener('click', toggleFullscreen);
    }
    function toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen?.();
            document.body.classList.add('cd-fullscreen');
        } else {
            document.exitFullscreen?.();
            document.body.classList.remove('cd-fullscreen');
        }
    }
    document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement) {
            document.body.classList.remove('cd-fullscreen');
        }
    });

    function initKeyboard() {
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT') return;
            if (e.code === 'Space') {
                e.preventDefault();
                if (state.phase === 'idle') start();
                else if (state.phase === 'running') pause();
                else if (state.phase === 'paused') resume();
            } else if (e.key === 'r' || e.key === 'R') {
                reset();
            } else if (e.key === 'f' || e.key === 'F') {
                toggleFullscreen();
            }
        });
    }

    // ───── 啟動 ─────
    document.addEventListener('DOMContentLoaded', () => {
        if (window.ToolsCommon && ToolsCommon.applyI18n) ToolsCommon.applyI18n();

        // 初始化 ring 為滿圈 (配合 pop-in 動畫)
        $('#cdRingProgress').setAttribute('stroke-dasharray', RING_CIRC);
        $('#cdRingProgress').setAttribute('stroke-dashoffset', 0);

        initPresets();
        initCustom();
        initActions();
        initFullscreen();
        initKeyboard();

        // 預設 5 分鐘
        setTotal(5 * 60000);
        document.querySelector('.cd-preset[data-sec="300"]')?.classList.add('active');
    });
})();
