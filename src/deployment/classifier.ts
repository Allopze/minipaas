import fs from 'fs-extra';
import path from 'path';
import { AnalysisResult, ClassificationResult, ProjectType } from './config';

export async function classifyProject(analysis: AnalysisResult): Promise<ClassificationResult> {
    const { rootPath, hasPackageJson, hasIndexHtml } = analysis;

    // Default to static if nothing else found
    const result: ClassificationResult = {
        type: ProjectType.STATIC,
        rootPath: rootPath,
        outputDir: rootPath // Default for static is the root itself
    };

    if (hasPackageJson) {
        try {
            const pkgPath = path.join(rootPath, 'package.json');
            const pkg = await fs.readJson(pkgPath);
            const scripts = pkg.scripts || {};
            const dependencies = { ...pkg.dependencies, ...pkg.devDependencies };

            // Check for build scripts
            const hasBuild = !!scripts.build;
            const hasStart = !!scripts.start;
            const hasDev = !!scripts.dev;

            // Check for frameworks
            const isReact = !!dependencies.react;
            const isVue = !!dependencies.vue;
            const isSvelte = !!dependencies.svelte;
            const isNext = !!dependencies.next;
            const isNuxt = !!dependencies.nuxt;
            const isVite = !!dependencies.vite;
            const isExpress = !!dependencies.express;
            const isNest = !!dependencies['@nestjs/core'];

            // Logic to determine type

            // 1. Hybrid / Static Build (Frontend Frameworks)
            if (hasBuild && (isReact || isVue || isSvelte || isVite || isNext || isNuxt)) {
                result.type = ProjectType.HYBRID;
                result.buildCommand = 'npm run build';

                // Heuristics for output dir
                if (isNext) result.outputDir = path.join(rootPath, '.next'); // Next.js is special, often needs 'npm start' in prod or static export
                else if (isNuxt) result.outputDir = path.join(rootPath, '.output/public');
                else if (isVite) result.outputDir = path.join(rootPath, 'dist');
                else result.outputDir = path.join(rootPath, 'build'); // Common default

                // Special case: Next.js SSR vs Static Export
                // If it's Next.js and has 'start', it's likely a Node server (SSR)
                if (isNext && hasStart) {
                    result.type = ProjectType.NODE;
                    result.startCommand = 'npm start';
                    delete result.outputDir; // Node apps don't serve a static dir directly usually
                }

                return result;
            }

            // 2. Node.js Server
            if (hasStart || isExpress || isNest || scripts.serve) {
                result.type = ProjectType.NODE;
                result.startCommand = scripts.start ? 'npm start' : 'node index.js'; // Fallback
                return result;
            }

        } catch (error) {
            console.error('Error reading package.json:', error);
            // Fallback to static if package.json is corrupt
        }
    }

    // 3. Static (already default)
    if (hasIndexHtml && !hasPackageJson) {
        result.type = ProjectType.STATIC;
    }

    return result;
}
