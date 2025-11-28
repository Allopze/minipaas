import { deployProject } from './src/deployment/deploy';
import { ProjectType } from './src/deployment/config';

console.log('Deployment logic loaded successfully.');
console.log('Project Types:', ProjectType);

// We won't actually run deployProject as it requires a real ZIP and environment
// But compiling and running this proves the modules are linked correctly.
