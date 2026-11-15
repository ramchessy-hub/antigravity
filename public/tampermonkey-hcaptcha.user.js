// ==UserScript==
// @name         hCaptcha Puzzle Auto-Redirect & Loop (StakeCruncher)
// @namespace    http://tampermonkey.net/
// @version      5.0
// @description  Detects hCaptcha puzzle, requests URL from StakeCruncher API, redirects, waits 2 min, returns to stakecruncher.com
// @author       You
// @match        *://*/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const SUPABASE_URL = 'https://ekjivkdpczvamcysmxlr.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3QiOiJzdXBhYmFzZSIsInJlZiI6ImVraml2a2RwY3p2YW1jeXNteGxyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0OTE4MzEsImV4cCI6MjEwNzA2NzgzMX0.SKez8C6cPipQyZ5NRQzPqAmBusxzQT2b20Ly03tCYkI';

    const DEVICE_ID = 'device-' + (localStorage.getItem('sc_device_id') || Math.random().toString(36).slice(2, 8));
    localStorage.setItem('sc_device_id', DEVICE_ID.replace('device-', ''));

    const RETURN_URL = 'https://stakecruncher.com';
    const WAIT_MS = 120000; // 2 minutes on the hCaptcha page

    // ==========================================
    // 1. MAIN PAGE UI & REDIRECT LOGIC
    // ==========================================
    if (window === window.top) {

        // --- UI Setup ---
        const panel = document.createElement('div');
        panel.id = 'hcaptcha-ui-panel';
        panel.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #374151; padding-bottom:5px; margin-bottom:5px;">
                <strong>hCaptcha Monitor</strong>
                <span id="hcm-dot" style="width:10px; height:10px; border-radius:50%; background:#22c55e;"></span>
            </div>
            <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                <span style="color:#9ca3af;">Status:</span>
                <span id="hcm-status" style="color:#22c55e; font-weight:bold;">Initializing...</span>
            </div>
            <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                <span style="color:#9ca3af;">Device:</span>
                <span style="color:#d1d5db; font-size:10px;">${DEVICE_ID}</span>
            </div>
            <div id="hcm-assignment" style="display:none; margin-top:4px; padding-top:4px; border-top:1px solid #374151; font-size:10px; color:#6b7280;">
                <div>URL: <span id="hcm-label" style="color:#a78bfa;">--</span></div>
                <div>Waiting: <span id="hcm-countdown" style="color:#f59e0b;">2:00</span></div>
            </div>
        `;

        Object.assign(panel.style, {
            position: 'fixed', bottom: '20px', right: '20px', width: '250px',
            background: '#111827', color: '#e5e7eb', padding: '12px',
            border: '1px solid #374151', borderRadius: '8px', font: '12px system-ui',
            zIndex: '2147483647', boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
        });
        document.body.appendChild(panel);

        const statusEl = document.getElementById('hcm-status');
        const dotEl = document.getElementById('hcm-dot');

        // --- Request URL from API and redirect ---
        async function requestAndRedirect() {
            if (sessionStorage.getItem('hcap_redirecting')) return;
            sessionStorage.setItem('hcap_redirecting', 'true');

            statusEl.textContent = 'Requesting URL...';
            statusEl.style.color = '#f59e0b';
            dotEl.style.background = '#f59e0b';

            try {
                const res = await fetch(`${SUPABASE_URL}/functions/v1/assign-hcaptcha?action=request`, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ device_id: DEVICE_ID }),
                });

                if (!res.ok) {
                    const errBody = await res.json().catch(() => ({}));
                    if (errBody.error === 'no_urls_available') {
                        statusEl.textContent = 'No URLs left today';
                        statusEl.style.color = '#ef4444';
                        dotEl.style.background = '#ef4444';
                        sessionStorage.removeItem('hcap_redirecting');
                        // Retry in 60 seconds
                        setTimeout(() => {
                            sessionStorage.removeItem('hcap_redirecting');
                            statusEl.textContent = 'Monitoring...';
                            statusEl.style.color = '#22c55e';
                            dotEl.style.background = '#22c55e';
                        }, 60000);
                        return;
                    }
                    throw new Error('API error');
                }

                const data = await res.json();
                if (!data.url) throw new Error('No URL in response');

                // Store assignment info
                sessionStorage.setItem('hcap_assigned_label', data.label);
                sessionStorage.setItem('hcap_assigned_url', data.url);
                sessionStorage.setItem('hcap_redirect_start', Date.now().toString());

                statusEl.textContent = 'Redirecting...';
                statusEl.style.color = '#ef4444';
                dotEl.style.background = '#ef4444';

                window.location.href = data.url;
            } catch (err) {
                statusEl.textContent = 'API failed, retry...';
                statusEl.style.color = '#ef4444';
                dotEl.style.background = '#ef4444';
                sessionStorage.removeItem('hcap_redirecting');
                // Retry after 30s
                setTimeout(() => {
                    sessionStorage.removeItem('hcap_redirecting');
                    statusEl.textContent = 'Monitoring...';
                    statusEl.style.color = '#22c55e';
                    dotEl.style.background = '#22c55e';
                }, 30000);
            }
        }

        // --- Redirect Listener ---
        window.addEventListener('message', function (event) {
            if (event.data === 'HCAPTCHA_PUZZLE_VISIBLE') {
                requestAndRedirect();
            }
        });

        // --- Cooldown / Return Logic ---
        // If we were redirected and came back, check if we need to wait
        const redirectStart = sessionStorage.getItem('hcap_redirect_start');
        if (redirectStart) {
            const elapsed = Date.now() - parseInt(redirectStart, 10);
            if (elapsed < WAIT_MS) {
                // Still within wait window — show countdown
                const remaining = WAIT_MS - elapsed;
                const assignmentDiv = document.getElementById('hcm-assignment');
                const labelEl = document.getElementById('hcm-label');
                const countdownEl = document.getElementById('hcm-countdown');
                if (assignmentDiv) assignmentDiv.style.display = 'block';
                if (labelEl) labelEl.textContent = sessionStorage.getItem('hcap_assigned_label') || '--';

                statusEl.textContent = 'Waiting...';
                statusEl.style.color = '#f59e0b';
                dotEl.style.background = '#f59e0b';

                const tick = () => {
                    const now = Date.now();
                    const startVal = parseInt(sessionStorage.getItem('hcap_redirect_start') || '0', 10);
                    const elapsedNow = now - startVal;
                    if (elapsedNow >= WAIT_MS) {
                        // Time's up — return to stakecruncher
                        statusEl.textContent = 'Returning...';
                        statusEl.style.color = '#22c55e';
                        dotEl.style.background = '#22c55e';
                        sessionStorage.removeItem('hcap_redirecting');
                        sessionStorage.removeItem('hcap_redirect_start');
                        sessionStorage.removeItem('hcap_assigned_label');
                        sessionStorage.removeItem('hcap_assigned_url');
                        window.location.href = RETURN_URL;
                        return;
                    }
                    const left = WAIT_MS - elapsedNow;
                    const mins = Math.floor(left / 60000);
                    const secs = Math.floor((left % 60000) / 1000);
                    if (countdownEl) countdownEl.textContent = `${mins}:${String(secs).padStart(2, '0')}`;
                    setTimeout(tick, 500);
                };
                tick();
                return;
            } else {
                // Wait period already passed — clean up
                sessionStorage.removeItem('hcap_redirecting');
                sessionStorage.removeItem('hcap_redirect_start');
                sessionStorage.removeItem('hcap_assigned_label');
                sessionStorage.removeItem('hcap_assigned_url');
            }
        }

        statusEl.textContent = 'Monitoring...';
        statusEl.style.color = '#22c55e';
        dotEl.style.background = '#22c55e';

        return; // Stop main page execution here
    }

    // ==========================================
    // 2. IFRAME LOGIC (Detects hCaptcha puzzle)
    // ==========================================
    if (window.location.hostname.includes('hcaptcha.com') || window.location.hostname.includes('hcaptcha.net')) {

        // If we're on an hCaptcha verify page (top-level, redirected here), start the timer
        if (window === window.top) {
            const assignedUrl = sessionStorage.getItem('hcap_assigned_url');
            if (assignedUrl && window.location.href.includes('hcaptcha.com')) {
                // We were redirected here by the script — start countdown
                const panel = document.createElement('div');
                panel.id = 'hcaptcha-wait-panel';
                panel.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #374151; padding-bottom:5px; margin-bottom:5px;">
                        <strong>hCaptcha Waiting</strong>
                        <span id="hcm-wait-dot" style="width:10px; height:10px; border-radius:50%; background:#f59e0b;"></span>
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                        <span style="color:#9ca3af;">Returning in:</span>
                        <span id="hcm-wait-countdown" style="color:#f59e0b; font-weight:bold;">2:00</span>
                    </div>
                    <div style="font-size:10px; color:#6b7280;">Will redirect to ${RETURN_URL}</div>
                `;
                Object.assign(panel.style, {
                    position: 'fixed', bottom: '20px', right: '20px', width: '250px',
                    background: '#111827', color: '#e5e7eb', padding: '12px',
                    border: '1px solid #374151', borderRadius: '8px', font: '12px system-ui',
                    zIndex: '2147483647', boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
                });
                document.body.appendChild(panel);

                const countdownEl = document.getElementById('hcm-wait-countdown');

                const tick = () => {
                    const startVal = parseInt(sessionStorage.getItem('hcap_redirect_start') || Date.now().toString(), 10);
                    const elapsed = Date.now() - startVal;
                    if (elapsed >= WAIT_MS) {
                        // Report completion to API
                        const label = sessionStorage.getItem('hcap_assigned_label');
                        if (label) {
                            fetch(`${SUPABASE_URL}/functions/v1/assign-hcaptcha?action=complete`, {
                                method: 'POST',
                                headers: {
                                    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
                                    'Content-Type': 'application/json',
                                },
                                body: JSON.stringify({ device_id: DEVICE_ID, label }),
                            }).catch(() => {});
                        }
                        sessionStorage.removeItem('hcap_redirecting');
                        sessionStorage.removeItem('hcap_redirect_start');
                        sessionStorage.removeItem('hcap_assigned_label');
                        sessionStorage.removeItem('hcap_assigned_url');
                        window.location.href = RETURN_URL;
                        return;
                    }
                    const left = WAIT_MS - elapsed;
                    const mins = Math.floor(left / 60000);
                    const secs = Math.floor((left % 60000) / 1000);
                    if (countdownEl) countdownEl.textContent = `${mins}:${String(secs).padStart(2, '0')}`;
                    setTimeout(tick, 500);
                };
                tick();
            }
            return;
        }

        // Inside iframe — detect puzzle and notify top window
        let puzzleAlerted = false;

        function checkForPuzzle() {
            if (puzzleAlerted) return;

            const skipBtn = document.querySelector('button[title="Skip"]');
            const challengeGrid = document.querySelector('.challenge-container');
            const promptText = document.querySelector('div[class*="prompt-text"]');

            function isVisible(el) {
                if (!el) return false;
                const rect = el.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0;
            }

            if (isVisible(skipBtn) || isVisible(challengeGrid) || isVisible(promptText)) {
                puzzleAlerted = true;
                console.log('[hCaptcha Monitor] Visible image puzzle detected! Triggering redirect...');
                window.top.postMessage('HCAPTCHA_PUZZLE_VISIBLE', '*');
            }
        }

        checkForPuzzle();

        const observer = new MutationObserver(checkForPuzzle);
        if (document.body) {
            observer.observe(document.body, { childList: true, subtree: true });
        } else {
            window.addEventListener('DOMContentLoaded', () => {
                observer.observe(document.body, { childList: true, subtree: true });
                checkForPuzzle();
            });
        }
    }
})();
