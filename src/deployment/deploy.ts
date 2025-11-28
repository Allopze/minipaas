import AdmZip from 'adm-zip';
import fs from 'fs-extra';
import path from 'path';
import { DeploymentConfig } from './config';
import { analyzeProject } from './analyzer';
import { classifyProject } from './classifier';
import { installDependencies } from './installer';
import { startApp } from './runner';
import { startProxy } from './proxy';

/**
 * Main entry point for deploying an application.
 * 
 * Flow:
 * 1. Unzip project
 * 2. Analyze structure (find root)
 * 3. Classify type (Node, Static, Hybrid)
 * 4. Install dependencies (if needed)
 * 5. Start Application (if Node/Hybrid)
 * 6. Start Proxy
 */
export async function deployProject(zipPath: string, config: DeploymentConfig) {
    console.log(`Starting deployment for ${config.deploymentId}...`);

    // 1. Unzip
    console.log('Extracting ZIP...');
    await fs.ensureDir(config.workDir);
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(config.workDir, true);

    // 2. Analyze
    console.log('Analyzing project structure...');
    const analysis = await analyzeProject(config.workDir);
    console.log(`Root detected at: ${analysis.rootPath}`);

    // 3. Classify
    console.log('Classifying project type...');
    const classification = await classifyProject(analysis);
    console.log(`Project classified as: ${classification.type}`);

    // 4. Install Dependencies
    // Only needed if we have a package.json and it's not a purely static site without build
    // (Though even static sites might need install if they have a build step, which classifier handles)
    if (analysis.hasPackageJson) {
        await installDependencies(analysis.rootPath);
    }

    // 5. Start App
    // We need to pick a port for the app if it's a Node/Hybrid app that runs a server
    let appPort: number | undefined;

    if (classification.type !== 'static') {
        // In a real PaaS, we'd find a free port dynamically.
        // For this implementation, let's assume we assign one or use a random one.
        // We'll use a random port between 10000 and 60000 for the internal app
        appPort = Math.floor(Math.random() * (60000 - 10000 + 1) + 10000);

        // Inject this port into the config for the runner
        const appConfig = {
            ...config,
            internalPort: appPort // The app listens on this
        };

        const appProcess = await startApp(analysis.rootPath, classification, appConfig);

        if (appProcess) {
            console.log(`App started with PID: ${appProcess.pid}`);
            appProcess.on('exit', (code) => {
                console.log(`App process exited with code ${code}`);
                // In production, we'd restart it or fail the deployment
            });
        }
    }

    // 6. Start Proxy
    // The proxy listens on the config.internalPort (the one exposed to Cloudflare)
    // and forwards to appPort (if applicable) or serves static files
    console.log('Starting Proxy...');
    startProxy(config, classification, appPort);

    console.log('Deployment successful!');
    return {
        classification,
        analysis,
        appPort
    };
}
