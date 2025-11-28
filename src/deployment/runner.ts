import spawn from 'cross-spawn';
import { DeploymentConfig, ClassificationResult, ProjectType } from './config';
import { prepareEnvironment, writeBuildEnv } from './env';

/**
 * Starts the application based on its type.
 * For Node apps, it spawns the process.
 * For Hybrid apps, it runs the build and then we expect the static server to take over (handled by caller or proxy).
 */
export async function startApp(
    rootPath: string,
    classification: ClassificationResult,
    config: DeploymentConfig
) {
    // 1. Prepare Environment
    const env = await prepareEnvironment(rootPath, config);

    // 2. Handle Build Step (Hybrid/Static with build)
    if (classification.type === ProjectType.HYBRID && classification.buildCommand) {
        console.log('Running build command...');
        // Write .env.production for the build tool
        await writeBuildEnv(rootPath, env);

        await new Promise<void>((resolve, reject) => {
            const [cmd, ...args] = classification.buildCommand!.split(' ');
            const child = spawn(cmd, args, {
                cwd: rootPath,
                stdio: 'inherit',
                env: { ...process.env, ...env }
            });

            child.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`Build failed with code ${code}`));
            });
        });
    }

    // 3. Start Node Server
    if (classification.type === ProjectType.NODE && classification.startCommand) {
        console.log('Starting Node.js server...');
        const [cmd, ...args] = classification.startCommand.split(' ');

        const child = spawn(cmd, args, {
            cwd: rootPath,
            stdio: 'inherit',
            env: { ...process.env, ...env }
        });

        return child;
    }

    // For Static/Hybrid (after build), we don't start a process here.
    // The proxy/static server logic will serve the outputDir.
    return null;
}
