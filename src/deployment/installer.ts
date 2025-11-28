import fs from 'fs-extra';
import path from 'path';
import spawn from 'cross-spawn';

/**
 * Installs dependencies for the project.
 * Enforces removal of existing node_modules to ensure Linux compatibility.
 */
export async function installDependencies(rootPath: string): Promise<void> {
    const nodeModulesPath = path.join(rootPath, 'node_modules');
    const pkgLockPath = path.join(rootPath, 'package-lock.json');
    const yarnLockPath = path.join(rootPath, 'yarn.lock');
    const pnpmLockPath = path.join(rootPath, 'pnpm-lock.yaml');

    // 1. Remove existing node_modules
    if (await fs.pathExists(nodeModulesPath)) {
        console.log('Removing existing node_modules...');
        await fs.remove(nodeModulesPath);
    }

    // 2. Determine package manager and command
    let command = 'npm';
    let args = ['install'];

    if (await fs.pathExists(pnpmLockPath)) {
        command = 'pnpm';
        args = ['install', '--frozen-lockfile'];
    } else if (await fs.pathExists(yarnLockPath)) {
        command = 'yarn';
        args = ['install', '--frozen-lockfile'];
    } else if (await fs.pathExists(pkgLockPath)) {
        command = 'npm';
        args = ['ci'];
    }

    console.log(`Installing dependencies using ${command}...`);

    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd: rootPath,
            stdio: 'inherit', // Pipe output to parent
            env: { ...process.env, NODE_ENV: 'production' } // Install prod deps mainly, though build might need devDeps
        });

        child.on('close', (code: number | null) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`Dependency installation failed with code ${code}`));
            }
        });

        child.on('error', (err) => {
            reject(err);
        });
    });
}
