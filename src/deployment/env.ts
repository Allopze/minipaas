import fs from 'fs-extra';
import path from 'path';
import dotenv from 'dotenv';
import { DeploymentConfig } from './config';

/**
 * Prepares the environment variables for the application.
 * Reads .env files, filters out unsafe values, and injects platform variables.
 */
export async function prepareEnvironment(rootPath: string, config: DeploymentConfig): Promise<Record<string, string>> {
    const envPath = path.join(rootPath, '.env');
    let fileEnv: Record<string, string> = {};

    // 1. Read existing .env if present
    if (await fs.pathExists(envPath)) {
        const envContent = await fs.readFile(envPath, 'utf-8');
        fileEnv = dotenv.parse(envContent);
    }

    // 2. Filter unsafe variables (localhost, internal IPs)
    // We don't want the app to rely on hardcoded local URLs from the user's dev machine
    const safeFileEnv: Record<string, string> = {};
    for (const [key, value] of Object.entries(fileEnv)) {
        if (value.includes('localhost') || value.includes('127.0.0.1') || value.includes('192.168.')) {
            console.warn(`Ignoring unsafe env var ${key}=${value}`);
            continue;
        }
        safeFileEnv[key] = value;
    }

    // 3. Merge with deployment config env (which overrides file env)
    const combinedEnv = { ...safeFileEnv, ...config.env };

    // 4. Inject Platform Variables
    const platformEnv: Record<string, string> = {
        PORT: config.internalPort.toString(),
        HOST: '0.0.0.0', // Force binding to all interfaces
        NODE_ENV: 'production',
        PUBLIC_URL: config.publicDomain,
        API_URL: `${config.publicDomain}/api`, // Convention
        // Standardize for frameworks
        MINIPAAS_PUBLIC_URL: config.publicDomain,
        MINIPAAS_API_URL: `${config.publicDomain}/api`
    };

    // 5. Framework specific injections (for build time)
    // Vite
    platformEnv['VITE_API_URL'] = platformEnv['MINIPAAS_API_URL'];
    // Next.js
    platformEnv['NEXT_PUBLIC_API_URL'] = platformEnv['MINIPAAS_API_URL'];
    // Create React App
    platformEnv['REACT_APP_API_URL'] = platformEnv['MINIPAAS_API_URL'];

    return { ...combinedEnv, ...platformEnv };
}

/**
 * Writes a temporary .env.production file for build tools that might read it directly.
 */
export async function writeBuildEnv(rootPath: string, env: Record<string, string>) {
    const envContent = Object.entries(env)
        .map(([k, v]) => `${k}=${v}`)
        .join('\n');

    await fs.writeFile(path.join(rootPath, '.env.production'), envContent);
}
