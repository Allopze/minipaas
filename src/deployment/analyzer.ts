import fs from 'fs-extra';
import path from 'path';
import { AnalysisResult, IGNORED_DIRS } from './config';

/**
 * Analyzes the extracted ZIP directory to find the real project root.
 * Handles nested folders (e.g. zip contains a single folder 'my-app' which contains the code).
 */
export async function analyzeProject(extractPath: string): Promise<AnalysisResult> {
    const result: AnalysisResult = {
        rootPath: extractPath,
        hasPackageJson: false,
        hasIndexHtml: false,
        packageJsonPaths: []
    };

    // Helper to check if a directory is relevant
    const isRelevantDir = (name: string) => !IGNORED_DIRS.includes(name);

    // Recursive search for root candidates
    async function findRoot(currentPath: string): Promise<string> {
        const items = await fs.readdir(currentPath);

        // Filter out ignored items for the purpose of "single folder" detection
        const relevantItems = [];
        for (const item of items) {
            const fullPath = path.join(currentPath, item);
            const stat = await fs.stat(fullPath);
            if (stat.isDirectory()) {
                if (isRelevantDir(item)) {
                    relevantItems.push({ name: item, isDir: true });
                }
            } else {
                // Ignore system files like .DS_Store or Thumbs.db
                if (!['.DS_Store', 'Thumbs.db'].includes(item)) {
                    relevantItems.push({ name: item, isDir: false });
                }
            }
        }

        // Rule: If only one directory and no relevant files, go deeper
        if (relevantItems.length === 1 && relevantItems[0].isDir) {
            return findRoot(path.join(currentPath, relevantItems[0].name));
        }

        return currentPath;
    }

    result.rootPath = await findRoot(extractPath);

    // Now scan the determined root for indicators
    // We also scan subdirectories to find monorepo packages, but we don't go too deep to save time
    async function scanForIndicators(dir: string, depth: number = 0) {
        if (depth > 2) return; // Limit depth for monorepo scanning

        const items = await fs.readdir(dir);
        for (const item of items) {
            const fullPath = path.join(dir, item);
            const stat = await fs.stat(fullPath);

            if (stat.isDirectory()) {
                if (isRelevantDir(item)) {
                    await scanForIndicators(fullPath, depth + 1);
                }
            } else {
                if (item === 'package.json') {
                    if (dir === result.rootPath) result.hasPackageJson = true;
                    result.packageJsonPaths.push(fullPath);
                }
                if (item === 'index.html' && dir === result.rootPath) {
                    result.hasIndexHtml = true;
                }
            }
        }
    }

    await scanForIndicators(result.rootPath);

    return result;
}
