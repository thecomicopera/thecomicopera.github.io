#!/usr/bin/env node
/**
 * Generic WebMCP-to-MCP CDP stdio Bridge
 *
 * Bridges Model Context Protocol (stdio) to browser WebMCP (document.modelContext)
 * via Chrome DevTools Protocol (CDP).
 *
 * Generic routing glue:
 * - Dynamically proxies tools/list from document.modelContext.getTools()
 * - Dynamically proxies tools/call to document.modelContext.executeTool()
 * - Dispatches trusted CDP mouse event before first audio call to unlock AudioContext
 * - No synth-specific tool names or business logic
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import puppeteer from 'puppeteer-core';

// Parse command line arguments
function parseArgs() {
    const args = process.argv.slice(2);
    let port = process.env.CDP_PORT ? parseInt(process.env.CDP_PORT, 10) : 9222;
    let host = process.env.CDP_HOST || '127.0.0.1';
    let targetUrl = process.env.TARGET_URL || 'synthweb|synthWeb';

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg.startsWith('--port=')) {
            port = parseInt(arg.split('=')[1], 10);
        } else if (arg === '--port' && i + 1 < args.length) {
            port = parseInt(args[++i], 10);
        } else if (arg.startsWith('--remote-debugging-port=')) {
            port = parseInt(arg.split('=')[1], 10);
        } else if (arg === '--remote-debugging-port' && i + 1 < args.length) {
            port = parseInt(args[++i], 10);
        } else if (arg.startsWith('--host=')) {
            host = arg.split('=')[1];
        } else if (arg === '--host' && i + 1 < args.length) {
            host = args[++i];
        } else if (arg.startsWith('--target-url=')) {
            targetUrl = arg.split('=')[1];
        } else if (arg === '--target-url' && i + 1 < args.length) {
            targetUrl = args[++i];
        } else if (/^\d+$/.test(arg)) {
            port = parseInt(arg, 10);
        }
    }

    return { port, host, targetUrl };
}

const config = parseArgs();
let browserInstance = null;
let activePage = null;
let activeCdpSession = null;
let hasUnlockedAudio = false;

/**
 * Get or establish CDP session with the matching tab
 */
async function getCDPSession() {
    // If we already have an active valid session on an open page, reuse it
    if (activeCdpSession && activePage && !activePage.isClosed()) {
        return activeCdpSession;
    }

    const browserUrl = `http://${config.host}:${config.port}`;
    try {
        if (!browserInstance || !browserInstance.isConnected()) {
            console.error(`[Bridge] Connecting to Chrome at ${browserUrl}...`);
            browserInstance = await puppeteer.connect({
                browserURL: browserUrl,
                defaultViewport: null
            });
        }
    } catch (err) {
        throw new Error(
            `Failed to connect to Chrome at ${browserUrl}. ` +
            `Ensure Chrome is running with --remote-debugging-port=${config.port}. Details: ${err.message}`
        );
    }

    const pages = await browserInstance.pages();
    if (!pages || pages.length === 0) {
        throw new Error(`Connected to Chrome at ${browserUrl}, but no open tabs were found.`);
    }

    // Match page by targetUrl regex / substring
    const regex = new RegExp(config.targetUrl, 'i');
    let matchedPage = pages.find(p => regex.test(p.url()));

    if (!matchedPage) {
        // Fallback: check if page title or URL contains synth or aurora
        matchedPage = pages.find(p => /synth|aurora/i.test(p.url()));
    }

    if (!matchedPage) {
        // If single non-blank tab, select it
        if (pages.length === 1 && pages[0].url() !== 'about:blank') {
            matchedPage = pages[0];
        }
    }

    if (!matchedPage) {
        const openUrls = pages.map(p => p.url()).join(', ');
        throw new Error(
            `No tab matching target pattern "${config.targetUrl}" found. Open tab URLs: [${openUrls}]. ` +
            `Open the synthWeb page in Chrome or specify --target-url.`
        );
    }

    activePage = matchedPage;
    console.error(`[Bridge] Attached to tab: "${await activePage.title()}" (${activePage.url()})`);

    activeCdpSession = await activePage.target().createCDPSession();
    await activeCdpSession.send('Page.enable');
    await activeCdpSession.send('Runtime.enable');

    activePage.on('close', () => {
        console.error('[Bridge] Active tab closed. Resetting session.');
        activePage = null;
        activeCdpSession = null;
        hasUnlockedAudio = false;
    });

    return activeCdpSession;
}

/**
 * Dispatch trusted CDP mouse event and call ensureAudioReady before first audio call
 */
async function ensureAutoplayUnlocked(cdp) {
    if (hasUnlockedAudio) return;

    console.error('[Bridge] Dispatching trusted user activation to satisfy AudioContext autoplay policy...');
    try {
        // Dispatch trusted mouse click at (50, 50)
        await cdp.send('Input.dispatchMouseEvent', {
            type: 'mousePressed',
            x: 50,
            y: 50,
            button: 'left',
            clickCount: 1
        });
        await cdp.send('Input.dispatchMouseEvent', {
            type: 'mouseReleased',
            x: 50,
            y: 50,
            button: 'left',
            clickCount: 1
        });

        // Call engine.ensureAudioReady() in page context and dismiss overlay if visible
        await cdp.send('Runtime.evaluate', {
            expression: `(async () => {
                if (window.synth?.engine?.ensureAudioReady) {
                    await window.synth.engine.ensureAudioReady();
                } else if (window.audioContext?.resume) {
                    await window.audioContext.resume();
                }
                const overlay = document.getElementById('audio-unlock-overlay');
                if (overlay) overlay.classList.add('hidden');
            })()`,
            awaitPromise: true,
            returnByValue: true
        });

        hasUnlockedAudio = true;
        console.error('[Bridge] Autoplay policy satisfied; AudioContext unlocked.');
    } catch (err) {
        console.error('[Bridge] Warning: Autoplay unlock event failed:', err.message);
    }
}

// Create MCP Server
const server = new Server(
    {
        name: 'synthweb-mcp-bridge',
        version: '1.0.0'
    },
    {
        capabilities: {
            tools: {}
        }
    }
);

// Register tools/list proxy
server.setRequestHandler(ListToolsRequestSchema, async () => {
    try {
        const cdp = await getCDPSession();

        const evalRes = await cdp.send('Runtime.evaluate', {
            expression: `(async () => {
                const mc = document.modelContext ?? navigator.modelContext;
                if (!mc || typeof mc.getTools !== 'function') return [];
                const tools = await mc.getTools();
                return tools.map(t => ({
                    name: t.name,
                    description: t.description || '',
                    inputSchema: t.inputSchema || { type: 'object', properties: {} }
                }));
            })()`,
            awaitPromise: true,
            returnByValue: true
        });

        if (evalRes.exceptionDetails) {
            const err = evalRes.exceptionDetails.exception?.description || evalRes.exceptionDetails.text;
            console.error('[Bridge] Error reading tools from page:', err);
            return { tools: [] };
        }

        const tools = evalRes.result?.value || [];
        console.error(`[Bridge] Discovered ${tools.length} tools from page modelContext.`);
        return { tools };
    } catch (err) {
        console.error('[Bridge] Failed to list tools:', err.message);
        return { tools: [] };
    }
});

// Register tools/call proxy
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    console.error(`[Bridge] Invoking tool "${name}"...`);

    try {
        const cdp = await getCDPSession();

        // Satisfy autoplay policy before first tool execution
        await ensureAutoplayUnlocked(cdp);

        // Execute tool through page's WebMCP modelContext
        const expr = `(async () => {
            const mc = document.modelContext ?? navigator.modelContext;
            if (!mc) throw new Error("WebMCP modelContext is unavailable on the page");
            if (typeof mc.getTools !== 'function') throw new Error("modelContext.getTools is not a function");

            const tools = await mc.getTools();
            const tool = tools.find(t => t.name === ${JSON.stringify(name)});
            if (!tool) throw new Error("Tool '" + ${JSON.stringify(name)} + "' was not found in modelContext registry");

            if (typeof mc.executeTool === 'function') {
                return await mc.executeTool(tool, ${JSON.stringify(args || {})});
            } else if (typeof tool.execute === 'function') {
                return await tool.execute(${JSON.stringify(args || {})});
            } else {
                throw new Error("No execution mechanism available for tool '" + ${JSON.stringify(name)} + "'");
            }
        })()`;

        const evalRes = await cdp.send('Runtime.evaluate', {
            expression: expr,
            awaitPromise: true,
            returnByValue: true
        });

        if (evalRes.exceptionDetails) {
            const errorMsg = evalRes.exceptionDetails.exception?.description || evalRes.exceptionDetails.text || 'Tool execution threw an error';
            console.error(`[Bridge] Tool "${name}" execution failed:`, errorMsg);
            return {
                isError: true,
                content: [{ type: 'text', text: `Error: ${errorMsg}` }]
            };
        }

        const rawValue = evalRes.result?.value;
        let parsedValue = rawValue;
        if (typeof rawValue === 'string') {
            try {
                parsedValue = JSON.parse(rawValue);
            } catch (e) {
                parsedValue = rawValue;
            }
        }

        // Check if value contains an image data URL (e.g. synth.snapshot)
        if (parsedValue && typeof parsedValue === 'object') {
            const dataUrl = parsedValue.dataUrl;
            if (typeof dataUrl === 'string' && dataUrl.startsWith('data:image/')) {
                const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
                if (match) {
                    return {
                        content: [
                            {
                                type: 'image',
                                data: match[2],
                                mimeType: match[1]
                            },
                            {
                                type: 'text',
                                text: JSON.stringify(parsedValue, null, 2)
                            }
                        ]
                    };
                }
            }
        }

        return {
            content: [
                {
                    type: 'text',
                    text: typeof parsedValue === 'string' ? parsedValue : JSON.stringify(parsedValue, null, 2)
                }
            ]
        };
    } catch (err) {
        console.error(`[Bridge] Exception handling tool "${name}":`, err.message);
        return {
            isError: true,
            content: [{ type: 'text', text: `Bridge error: ${err.message}` }]
        };
    }
});

// Connect to stdio transport
async function main() {
    console.error(`[Bridge] Starting WebMCP bridge (port=${config.port}, targetUrl=${config.targetUrl})...`);
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('[Bridge] MCP stdio transport connected and listening.');
}

main().catch((err) => {
    console.error('[Bridge] Fatal error:', err);
    process.exit(1);
});
