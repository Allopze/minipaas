import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { DeploymentConfig, ClassificationResult, ProjectType } from './config';
import path from 'path';

/**
 * Creates and starts the internal proxy server for a deployment.
 * Handles CORS, routing (frontend vs backend), and Cloudflare integration.
 */
export function startProxy(
    config: DeploymentConfig,
    classification: ClassificationResult,
    appPort?: number // The internal port where the Node app is running (if applicable)
) {
    const proxyApp = express();
    const { internalPort, publicDomain, workDir } = config;

    // Trust Cloudflare headers
    proxyApp.set('trust proxy', true);

    // Centralized CORS Middleware
    proxyApp.use((req, res, next) => {
        // Strip upstream CORS headers to avoid conflicts
        const originalSetHeader = res.setHeader;
        res.setHeader = function (name: string, value: string | number | readonly string[]) {
            if (typeof name === 'string' && name.toLowerCase().startsWith('access-control-')) {
                return this;
            }
            return originalSetHeader.apply(this, [name, value]);
        };

        // Set our controlled CORS headers
        res.header('Access-Control-Allow-Origin', publicDomain); // Strict origin
        res.header('Access-Control-Allow-Credentials', 'true');
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

        // Handle Preflight
        if (req.method === 'OPTIONS') {
            return res.sendStatus(200);
        }
        next();
    });

    // Routing Logic

    // 1. Backend / API Routing
    if (classification.type === ProjectType.NODE || classification.type === ProjectType.HYBRID) {
        if (appPort) {
            // Proxy /api requests to the backend
            // We can make this configurable, but defaulting to /api is safe for hybrid
            // For pure Node apps, we might want to proxy everything.

            const target = `http://127.0.0.1:${appPort}`;

            const apiProxy = createProxyMiddleware({
                target,
                changeOrigin: true,
                ws: true, // Support WebSockets
                pathRewrite: classification.type === ProjectType.HYBRID ? { '^/api': '' } : undefined, // Rewrite if hybrid convention
                onProxyRes: (proxyRes: any) => {
                    // Ensure we don't leak upstream CORS
                    if (proxyRes.headers) {
                        delete proxyRes.headers['access-control-allow-origin'];
                        delete proxyRes.headers['access-control-allow-credentials'];
                    }
                }
            } as any);

            if (classification.type === ProjectType.HYBRID) {
                proxyApp.use('/api', apiProxy);
            } else {
                // Pure Node app: Proxy everything
                proxyApp.use('/', apiProxy);
            }
        }
    }

    // 2. Static Frontend Serving
    if (classification.type === ProjectType.STATIC || classification.type === ProjectType.HYBRID) {
        let staticDir = classification.outputDir || workDir;

        // If outputDir is relative, resolve it
        if (!path.isAbsolute(staticDir)) {
            staticDir = path.join(classification.rootPath || workDir, staticDir);
        }

        console.log(`Serving static files from ${staticDir}`);
        proxyApp.use(express.static(staticDir));

        // SPA Fallback (for client-side routing)
        proxyApp.get('*', (req, res) => {
            res.sendFile(path.join(staticDir, 'index.html'));
        });
    }

    // Start the Proxy
    // Note: In a real container setup, this might be the main entry point listening on PORT
    // But here we assume this runs alongside the app or IS the main process.
    // Since we are "miniPaaS", we likely want THIS to be the process listening on the assigned internalPort
    // and the app listening on a DIFFERENT random port (appPort).

    // However, the requirement says "miniPaaS assigns an internal port... app MUST listen on PORT".
    // If we put a proxy in front, the proxy listens on the "public" internal port (exposed to Cloudflare),
    // and the app listens on a "private" internal port.

    // Let's assume `config.internalPort` is what Cloudflare talks to.
    // So we listen on that.

    proxyApp.listen(internalPort, '0.0.0.0', () => {
        console.log(`Proxy server listening on port ${internalPort}`);
    });
}
