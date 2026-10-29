/* TITLE: assets/js/security.js */
/* REFLO Anti-Tampering & Security Sentry */
(function() {
    'use strict';

    // 1. DISABLE RIGHT-CLICK & LONG-PRESS CONTEXT MENU
    document.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        return false;
    });

    // 2. DISABLE DEVTOOLS KEYBOARD SHORTCUTS & TERMINATE SESSION
    document.addEventListener('keydown', function(e) {
        const isInspectKey = 
            e.keyCode === 123 || // F12
            ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.keyCode === 73 || e.key === 'I' || e.key === 'i')) || // Ctrl+Shift+I
            ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.keyCode === 74 || e.key === 'J' || e.key === 'j')) || // Ctrl+Shift+J
            ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.keyCode === 67 || e.key === 'C' || e.key === 'c')) || // Ctrl+Shift+C
            ((e.ctrlKey || e.metaKey) && (e.keyCode === 85 || e.key === 'U' || e.key === 'u')) || // Ctrl+U
            ((e.ctrlKey || e.metaKey) && (e.keyCode === 83 || e.key === 'S' || e.key === 's'));   // Ctrl+S

        if (isInspectKey) {
            e.preventDefault();
            reportSuspiciousActivity('unauthorized_inspect', 'User attempted developer inspection shortcuts');
            triggerSecurityLockout();
            return false;
        }
    });

    // 3. CONSOLE WARNING BANNER
    try {
        console.log(
            '%c⛔ STOP! REFLO Security Protocol Active.',
            'color: red; font-size: 20px; font-weight: bold;'
        );
        console.log(
            '%cThis is a protected commercial SaaS browser environment. Unauthorized inspection, reverse engineering, or data scraping attempts are actively monitored, logged, and will result in permanent account suspension.',
            'color: #64748b; font-size: 12px; font-weight: 600;'
        );
    } catch(e) {}

    // 4. DETECT DEVTOOLS OPENED VIA BROWSER MENU (Mobile & PC)
    let isLockedOut = false;
    const threshold = 160;

    function checkDevToolsMenu() {
        if (isLockedOut) return;
        const widthDiff = window.outerWidth - window.innerWidth > threshold;
        const heightDiff = window.outerHeight - window.innerHeight > threshold;

        if (widthDiff || heightDiff) {
            isLockedOut = true;
            reportSuspiciousActivity('devtools_opened', 'Developer Tools opened via browser menu');
            triggerSecurityLockout();
        }
    }
    setInterval(checkDevToolsMenu, 1500);

    // 5. SECURITY KICKOUT / LOCK SCREEN
    function triggerSecurityLockout() {
        document.body.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background:#0f172a;color:#ffffff;font-family:-apple-system,sans-serif;text-align:center;padding:25px;">
                <div style="font-size:3.5rem;margin-bottom:12px;">🛡️</div>
                <h1 style="font-size:1.4rem;font-weight:900;margin-bottom:8px;">Security Violation Detected</h1>
                <p style="color:#94a3b8;font-size:0.85rem;max-width:380px;line-height:1.45;margin-bottom:20px;">
                    Developer inspection and source extraction are disabled on REFLO. Your session has been locked.
                </p>
                <button onclick="location.reload()" style="padding:12px 24px;border-radius:12px;background:#2563eb;color:#fff;border:none;font-weight:800;font-size:0.88rem;cursor:pointer;">
                    Return to Safe Mode
                </button>
            </div>
        `;

        // Terminate active session if user was logged in
        if (typeof Auth !== 'undefined' && Auth.logout) {
            Auth.logout();
        }
    }

    // 6. REPORT SUSPICIOUS ATTEMPTS TO SUPABASE DATABASE
    let lastReportTime = 0;
    async function reportSuspiciousActivity(type, details) {
        const now = Date.now();
        if (now - lastReportTime < 10000) return; // Throttle to prevent spam
        lastReportTime = now;

        try {
            if (typeof db !== 'undefined' && db.rpc) {
                await db.rpc('report_threat_and_autoban', {
                    p_incident_type: type,
                    p_details: details,
                    p_severity: 'warning'
                });
            }
        } catch (err) {
            // Fail silently to avoid breaking UI
        }
    }

    // 7. EXPOSE GLOBAL THREAT REPORTER
    window.RefloSecurity = {
        reportThreat: async function(type, details, isCritical) {
            try {
                if (typeof db !== 'undefined' && db.rpc) {
                    await db.rpc('report_threat_and_autoban', {
                        p_incident_type: type,
                        p_details: details,
                        p_severity: isCritical ? 'critical' : 'warning'
                    });
                    if (isCritical) {
                        triggerSecurityLockout();
                    }
                }
            } catch(e) {}
        }
    };
})();