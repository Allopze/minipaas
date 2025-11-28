export enum ProjectType {
    NODE = 'node',
    STATIC = 'static',
    HYBRID = 'hybrid'
}

export interface DeploymentConfig {
    deploymentId: string;
    internalPort: number;
    publicDomain: string;
    env: Record<string, string>;
    workDir: string; // Directory where ZIP is extracted
}

export interface AnalysisResult {
    rootPath: string;
    hasPackageJson: boolean;
    hasIndexHtml: boolean;
    packageJsonPaths: string[]; // For monorepo detection
}

export interface ClassificationResult {
    type: ProjectType;
    rootPath: string; // The real root of the project
    buildCommand?: string;
    startCommand?: string;
    outputDir?: string; // For static/hybrid serving
}

export const IGNORED_DIRS = [
    'node_modules',
    '.git',
    '.next',
    'dist',
    'build',
    '.cache',
    'coverage',
    'vendor',
    '__MACOSX' // Common in ZIPs from Mac
];
