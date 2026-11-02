/**
 * Automated end-to-end test for synthWeb MCP Bridge
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// 1. Setup minimal static HTTP server
const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.json': 'application/json'
};

const server = http.createServer((req, res) => {
    let reqPath = req.url.split('?')[0];
    if (reqPath === '/') reqPath = '/index.html';
    const filePath = path.join(rootDir, reqPath);

    if (!fs.existsSync(filePath)) {
        res.writeHead(404);
        res.end('Not Found');
        return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*'
    });
    fs.createReadStream(filePath).pipe(res);
});

async function runTests() {
    await new Promise((resolve) => server.listen(8080, '127.0.0.1', resolve));
    console.log('[Test] Static server listening at http://127.0.0.1:8080/');

    // 2. Launch Chrome with remote debugging port 9222
    const chromePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe'
    ];
    const chromeExe = chromePaths.find(p => fs.existsSync(p));
    if (!chromeExe) {
        throw new Error('Chrome executable not found on system');
    }

    const chromeUserData = path.join(process.env.TEMP || 'C:\\Windows\\Temp', 'chrome_synth_test_' + Date.now());
    console.log('[Test] Spawning Chrome with remote debugging on port 9222...');
    const chromeProc = spawn(chromeExe, [
        '--remote-debugging-port=9222',
        '--headless=new',
        '--autoplay-policy=no-user-gesture-required',
        '--no-first-run',
        '--no-default-browser-check',
        `--user-data-dir=${chromeUserData}`,
        'http://127.0.0.1:8080/index.html'
    ], { stdio: 'ignore' });

    // Wait 2.5s for Chrome and synthWeb page to fully initialize
    await new Promise(resolve => setTimeout(resolve, 2500));

    // 3. Spawn Bridge process
    console.log('[Test] Spawning bridge process...');
    const bridgeProc = spawn(process.execPath, [
        path.join(__dirname, 'index.js'),
        '--remote-debugging-port=9222',
        '--target-url=8080'
    ], {
        stdio: ['pipe', 'pipe', 'inherit']
    });

    let msgId = 1;
    let pendingRequests = new Map();
    let buffer = '';

    bridgeProc.stdout.on('data', (chunk) => {
        buffer += chunk.toString('utf-8');
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep last incomplete line

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
                const json = JSON.parse(trimmed);
                if (json.id && pendingRequests.has(json.id)) {
                    const { resolve, reject } = pendingRequests.get(json.id);
                    pendingRequests.delete(json.id);
                    if (json.error) reject(json.error);
                    else resolve(json.result);
                }
            } catch (err) {
                console.error('[Test] Non-JSON line from bridge stdout:', trimmed);
            }
        }
    });

    function sendRequest(method, params = {}) {
        return new Promise((resolve, reject) => {
            const id = msgId++;
            pendingRequests.set(id, { resolve, reject });
            const payload = JSON.stringify({
                jsonrpc: '2.0',
                id,
                method,
                params
            }) + '\n';
            bridgeProc.stdin.write(payload);
        });
    }

    function sendNotification(method, params = {}) {
        const payload = JSON.stringify({
            jsonrpc: '2.0',
            method,
            params
        }) + '\n';
        bridgeProc.stdin.write(payload);
    }

    try {
        console.log('\n--- TEST 1: MCP Initialize Handshake ---');
        const initResult = await sendRequest('initialize', {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'claude-desktop-test', version: '1.0.0' }
        });
        console.log('[PASS] Handshake succeeded:', initResult.serverInfo);
        sendNotification('notifications/initialized');

        console.log('\n--- TEST 2: tools/list discovery ---');
        const listResult = await sendRequest('tools/list');
        const toolNames = listResult.tools.map(t => t.name);
        console.log('[PASS] Discovered tools:', toolNames);
        const requiredTools = [
            'synth.get_state',
            'synth.set_params',
            'synth.note_on',
            'synth.note_off',
            'synth.play_sequence',
            'synth.list_presets',
            'synth.load_preset',
            'synth.save_preset',
            'synth.record_start',
            'synth.record_stop',
            'synth.snapshot'
        ];
        for (const reqTool of requiredTools) {
            if (!toolNames.includes(reqTool)) {
                throw new Error(`Missing required tool: ${reqTool}`);
            }
        }
        console.log('[PASS] All 11 required tools registered with schemas!');

        console.log('\n--- TEST 3: synth.set_params (cutoff: 500) ---');
        const setParamsResult = await sendRequest('tools/call', {
            name: 'synth.set_params',
            arguments: { filter: { cutoff: 500 } }
        });
        console.log('[PASS] set_params response:', setParamsResult.content[0].text);
        const parsedState = JSON.parse(setParamsResult.content[0].text);
        if (parsedState.params.filter.cutoff !== 500) {
            throw new Error(`Expected cutoff to be 500, got ${parsedState.params.filter.cutoff}`);
        }
        console.log('[PASS] Filter cutoff verified at 500Hz in engine params!');

        console.log('\n--- TEST 4: synth.note_on & note_off (autoplay policy unlock) ---');
        const noteOnResult = await sendRequest('tools/call', {
            name: 'synth.note_on',
            arguments: { note: 60, velocity: 0.85 }
        });
        console.log('[PASS] note_on response:', noteOnResult.content[0].text);
        const noteOnData = JSON.parse(noteOnResult.content[0].text);
        if (noteOnData.activeVoices < 1) {
            throw new Error(`Expected activeVoices >= 1, got ${noteOnData.activeVoices}`);
        }

        const noteOffResult = await sendRequest('tools/call', {
            name: 'synth.note_off',
            arguments: { note: 60 }
        });
        console.log('[PASS] note_off response:', noteOffResult.content[0].text);

        console.log('\n--- TEST 5: Recording & Audio Playback (synth.record_start/stop) ---');
        await sendRequest('tools/call', { name: 'synth.record_start', arguments: {} });
        console.log('[PASS] Recording started.');

        // Play sequence: C major chord
        console.log('[Test] Playing C major chord sequence...');
        await sendRequest('tools/call', {
            name: 'synth.play_sequence',
            arguments: {
                notes: [
                    { note: 60, velocity: 0.8, duration: 0.2 },
                    { note: 64, velocity: 0.8, duration: 0.2 },
                    { note: 67, velocity: 0.8, duration: 0.3 }
                ]
            }
        });

        const recordStopResult = await sendRequest('tools/call', {
            name: 'synth.record_stop',
            arguments: {}
        });
        const recData = JSON.parse(recordStopResult.content[0].text);
        console.log('[PASS] Record stop result: mimeType=' + recData.mimeType + ', sizeBytes=' + recData.sizeBytes);
        if (!recData.base64 || recData.base64.length === 0) {
            throw new Error('Expected non-empty base64 audio data');
        }
        console.log('[PASS] Valid base64 WebM audio received (length: ' + recData.base64.length + ' chars)!');

        console.log('\n--- TEST 6: Visualizer snapshot (synth.snapshot) ---');
        const snapResult = await sendRequest('tools/call', {
            name: 'synth.snapshot',
            arguments: {}
        });
        console.log('[PASS] Snapshot returned content types:', snapResult.content.map(c => c.type));
        const hasImage = snapResult.content.some(c => c.type === 'image');
        if (!hasImage) {
            throw new Error('Expected image content in snapshot response');
        }
        console.log('[PASS] Visualizer PNG snapshot received!');

        console.log('\n========================================');
        console.log('ALL ACCEPTANCE TESTS PASSED SUCCESSFULLY');
        console.log('========================================\n');

    } finally {
        bridgeProc.kill();
        chromeProc.kill();
        server.close();
        try {
            fs.rmSync(chromeUserData, { recursive: true, force: true });
        } catch(e){}
    }
}

runTests().catch(err => {
    console.error('\n[FAIL] Test failed:', err);
    process.exit(1);
});

