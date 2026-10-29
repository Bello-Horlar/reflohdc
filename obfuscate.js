/* TITLE: obfuscate.js */
const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

// 1. Base Core Singletons & Third-Party Libraries
const MASTER_RESERVED = new Set([
    'db', 'refloDb', 'storage', 'SupabaseService', 'initSupabaseClient',
    'REFLO_CONFIG', 'Auth', 'TrialGate', 'App', 'RefloPush', 
    'LocalNotifier', 'RefloTheme', 'QRCode', 'PaystackPop', 'supabase'
]);

// 2. 🟢 AUTO-SCANNER: Finds every top-level App name across all your JS files
function scanForGlobalNames(dirPath) {
    if (!fs.existsSync(dirPath)) return;
    const files = fs.readdirSync(dirPath);

    files.forEach(file => {
        const fullPath = path.join(dirPath, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            scanForGlobalNames(fullPath);
        } else if (file.endsWith('.js') && file !== 'obfuscate.js') {
            const content = fs.readFileSync(fullPath, 'utf8');

            // Regex detects top-level: const X = { ... }, function X(), var X = ...
            const matches = content.matchAll(/(?:const|let|var|function|class)\s+([A-Za-z0-9_]+App|[A-Za-z0-9_]+Slider|Reflo[A-Za-z0-9_]+|Public[A-Za-z0-9_]+)/g);
            for (const match of matches) {
                if (match[1]) {
                    MASTER_RESERVED.add(match[1]);
                }
            }
        }
    });
}

// 3. OBFUSCATION ENGINE
function obfuscateDirectory(dirPath, reservedList) {
    if (!fs.existsSync(dirPath)) return;
    const files = fs.readdirSync(dirPath);

    files.forEach(file => {
        const fullPath = path.join(dirPath, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            obfuscateDirectory(fullPath, reservedList);
        } else if (file.endsWith('.js') && file !== 'obfuscate.js') {
            const rawCode = fs.readFileSync(fullPath, 'utf8');

            const obfuscated = JavaScriptObfuscator.obfuscate(rawCode, {
                compact: true,
                controlFlowFlattening: true,
                deadCodeInjection: false,
                debugProtection: false,
                disableConsoleOutput: false,
                identifierNamesGenerator: 'hexadecimal',
                log: false,
                renameGlobals: false, // 🟢 Preserves top-level access
                reservedNames: reservedList, // 🟢 Automatically extracted names
                stringArray: true,
                stringArrayEncoding: ['base64'],
                stringArrayThreshold: 0.75,
                transformObjectKeys: false // 🟢 Keeps methods like .toast() and .checkout() intact
            }).getObfuscatedCode();

            fs.writeFileSync(fullPath, obfuscated, 'utf8');
            console.log(`🔒 Securely Obfuscated: ${file}`);
        }
    });
}

const jsFolder = path.join(__dirname, 'assets', 'js');

console.log("🔍 Scanning project for all global names...");
scanForGlobalNames(jsFolder);

const finalReservedList = Array.from(MASTER_RESERVED);
console.log(`🛡️ Protected ${finalReservedList.length} global names from being renamed.`);

console.log("🚀 Starting obfuscation...");
obfuscateDirectory(jsFolder, finalReservedList);
console.log("✅ All JavaScript files are 100% scrambled and protected!");