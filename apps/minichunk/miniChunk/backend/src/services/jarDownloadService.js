import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';

// Helper to make HTTPS requests
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, { headers: { 'User-Agent': 'MiniChunk/1.0' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchJson(res.headers.location).then(resolve).catch(reject);
      }
      
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Failed to parse JSON response'));
        }
      });
    }).on('error', reject);
  });
}

// Download file from URL
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    
    const request = (downloadUrl) => {
      protocol.get(downloadUrl, { headers: { 'User-Agent': 'MiniChunk/1.0' } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          return request(res.headers.location);
        }
        
        if (res.statusCode !== 200) {
          reject(new Error(`Failed to download: ${res.statusCode}`));
          return;
        }
        
        const fileStream = fs.createWriteStream(destPath);
        res.pipe(fileStream);
        
        fileStream.on('finish', () => {
          fileStream.close();
          resolve(destPath);
        });
        
        fileStream.on('error', (err) => {
          fs.unlink(destPath, () => {});
          reject(err);
        });
      }).on('error', reject);
    };
    
    request(url);
  });
}

// ========== PAPER MC API ==========
// https://api.papermc.io/v2/

export async function getPaperVersions() {
  const data = await fetchJson('https://api.papermc.io/v2/projects/paper');
  return data.versions.reverse(); // Most recent first
}

export async function getPaperBuilds(version) {
  const data = await fetchJson(`https://api.papermc.io/v2/projects/paper/versions/${version}`);
  return data.builds;
}

export async function downloadPaper(version, destFolder, fileName = 'paper.jar') {
  const buildsData = await fetchJson(`https://api.papermc.io/v2/projects/paper/versions/${version}`);
  const latestBuild = buildsData.builds[buildsData.builds.length - 1];
  
  const buildData = await fetchJson(`https://api.papermc.io/v2/projects/paper/versions/${version}/builds/${latestBuild}`);
  const jarName = buildData.downloads.application.name;
  
  const downloadUrl = `https://api.papermc.io/v2/projects/paper/versions/${version}/builds/${latestBuild}/downloads/${jarName}`;
  const destPath = path.join(destFolder, fileName);
  
  await downloadFile(downloadUrl, destPath);
  return { path: destPath, build: latestBuild };
}

// ========== PURPUR API ==========
// https://api.purpurmc.org/v2/

export async function getPurpurVersions() {
  const data = await fetchJson('https://api.purpurmc.org/v2/purpur');
  return data.versions.reverse();
}

export async function downloadPurpur(version, destFolder, fileName = 'purpur.jar') {
  const downloadUrl = `https://api.purpurmc.org/v2/purpur/${version}/latest/download`;
  const destPath = path.join(destFolder, fileName);
  
  await downloadFile(downloadUrl, destPath);
  return { path: destPath };
}

// ========== VANILLA (Mojang) API ==========
// https://launchermeta.mojang.com/mc/game/version_manifest.json

export async function getVanillaVersions() {
  const data = await fetchJson('https://launchermeta.mojang.com/mc/game/version_manifest.json');
  // Filter only releases (not snapshots)
  return data.versions
    .filter(v => v.type === 'release')
    .map(v => v.id);
}

export async function getVanillaAllVersions() {
  const data = await fetchJson('https://launchermeta.mojang.com/mc/game/version_manifest.json');
  return data.versions.map(v => ({ id: v.id, type: v.type }));
}

export async function downloadVanilla(version, destFolder, fileName = 'server.jar') {
  const manifest = await fetchJson('https://launchermeta.mojang.com/mc/game/version_manifest.json');
  const versionData = manifest.versions.find(v => v.id === version);
  
  if (!versionData) {
    throw new Error(`Vanilla version ${version} not found`);
  }
  
  const versionManifest = await fetchJson(versionData.url);
  const serverDownload = versionManifest.downloads?.server;
  
  if (!serverDownload) {
    throw new Error(`Server download not available for version ${version}`);
  }
  
  const destPath = path.join(destFolder, fileName);
  await downloadFile(serverDownload.url, destPath);
  
  return { path: destPath, sha1: serverDownload.sha1 };
}

// ========== FABRIC API ==========
// https://meta.fabricmc.net/v2/

export async function getFabricGameVersions() {
  const data = await fetchJson('https://meta.fabricmc.net/v2/versions/game');
  return data.filter(v => v.stable).map(v => v.version);
}

export async function getFabricLoaderVersions() {
  const data = await fetchJson('https://meta.fabricmc.net/v2/versions/loader');
  return data.filter(v => v.stable).map(v => v.version);
}

export async function getFabricInstallerVersions() {
  const data = await fetchJson('https://meta.fabricmc.net/v2/versions/installer');
  return data.map(v => v.version);
}

export async function downloadFabric(gameVersion, destFolder, fileName = 'fabric-server.jar') {
  // Get latest loader and installer versions
  const [loaders, installers] = await Promise.all([
    fetchJson('https://meta.fabricmc.net/v2/versions/loader'),
    fetchJson('https://meta.fabricmc.net/v2/versions/installer')
  ]);
  
  const latestLoader = loaders.find(l => l.stable)?.version || loaders[0].version;
  const latestInstaller = installers[0].version;
  
  const downloadUrl = `https://meta.fabricmc.net/v2/versions/loader/${gameVersion}/${latestLoader}/${latestInstaller}/server/jar`;
  const destPath = path.join(destFolder, fileName);
  
  await downloadFile(downloadUrl, destPath);
  
  return { path: destPath, loader: latestLoader, installer: latestInstaller };
}

// ========== UNIFIED INTERFACE ==========

export const ServerTypes = {
  VANILLA: 'vanilla',
  PAPER: 'paper',
  PURPUR: 'purpur',
  FABRIC: 'fabric'
};

export async function getVersionsForType(serverType) {
  switch (serverType.toLowerCase()) {
    case ServerTypes.VANILLA:
      return await getVanillaVersions();
    case ServerTypes.PAPER:
      return await getPaperVersions();
    case ServerTypes.PURPUR:
      return await getPurpurVersions();
    case ServerTypes.FABRIC:
      return await getFabricGameVersions();
    default:
      throw new Error(`Unknown server type: ${serverType}`);
  }
}

export async function downloadServerJar(serverType, version, destFolder) {
  // Ensure folder exists
  if (!fs.existsSync(destFolder)) {
    fs.mkdirSync(destFolder, { recursive: true });
  }
  
  switch (serverType.toLowerCase()) {
    case ServerTypes.VANILLA:
      return await downloadVanilla(version, destFolder, 'server.jar');
    case ServerTypes.PAPER:
      return await downloadPaper(version, destFolder, 'paper.jar');
    case ServerTypes.PURPUR:
      return await downloadPurpur(version, destFolder, 'purpur.jar');
    case ServerTypes.FABRIC:
      return await downloadFabric(version, destFolder, 'fabric-server.jar');
    default:
      throw new Error(`Unknown server type: ${serverType}`);
  }
}

export function getDefaultJarName(serverType) {
  switch (serverType.toLowerCase()) {
    case ServerTypes.VANILLA:
      return 'server.jar';
    case ServerTypes.PAPER:
      return 'paper.jar';
    case ServerTypes.PURPUR:
      return 'purpur.jar';
    case ServerTypes.FABRIC:
      return 'fabric-server.jar';
    default:
      return 'server.jar';
  }
}

export function getDefaultJvmArgs(serverType) {
  const baseArgs = '-XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200';
  
  switch (serverType.toLowerCase()) {
    case ServerTypes.PAPER:
    case ServerTypes.PURPUR:
      return `${baseArgs} -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC -XX:+AlwaysPreTouch -XX:G1NewSizePercent=30 -XX:G1MaxNewSizePercent=40 -XX:G1HeapRegionSize=8M -XX:G1ReservePercent=20 -XX:G1HeapWastePercent=5 -XX:G1MixedGCCountTarget=4 -XX:InitiatingHeapOccupancyPercent=15 -XX:G1MixedGCLiveThresholdPercent=90 -XX:G1RSetUpdatingPauseTimePercent=5 -XX:SurvivorRatio=32 -XX:+PerfDisableSharedMem -XX:MaxTenuringThreshold=1 -Dusing.aikars.flags=https://mcflags.emc.gs -Daikars.new.flags=true`;
    case ServerTypes.FABRIC:
      return `${baseArgs} -XX:+UnlockExperimentalVMOptions`;
    default:
      return baseArgs;
  }
}
