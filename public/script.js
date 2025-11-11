// Estado de la aplicación
let apps = [];
let systemInfo = {};
let systemStats = {};
let currentTheme = localStorage.getItem('theme') || 'light';
let healthcheckInterval = null;
let selectedFile = null;
let detectedStartCommandValue = '';
let credentialUpdateState = {
  required: false,
  actions: { password: false, username: false }
};

// Aplicar tema guardado
document.documentElement.setAttribute('data-theme', currentTheme);

// Elementos del DOM
const themeToggle = document.getElementById('theme-toggle');
const refreshBtn = document.getElementById('refresh-btn');
const uploadForm = document.getElementById('upload-form');
const zipFileInput = document.getElementById('zip-file');
const fileNameDisplay = document.getElementById('file-name');
const dropZone = document.getElementById('drop-zone');
const selectFileBtn = document.getElementById('select-file-btn');
const zipPreview = document.getElementById('zip-preview');
const zipPreviewList = document.getElementById('zip-preview-list');
const zipPreviewMeta = document.getElementById('zip-preview-meta');
const detectedStartCommandBox = document.getElementById('detected-start-command');
const startCommandInput = document.getElementById('start-command-input');
const appsGrid = document.getElementById('apps-grid');
const emptyState = document.getElementById('empty-state');
const uploadStatus = document.getElementById('upload-status');
const uploadProgressLabel = document.getElementById('upload-progress-label');
const logsModal = document.getElementById('logs-modal');
const closeLogsModal = document.getElementById('close-logs-modal');
const notificationModal = document.getElementById('notification-modal');
const closeNotification = document.getElementById('close-notification');
const exportConfigBtn = document.getElementById('export-config-btn');
const importConfigBtn = document.getElementById('import-config-btn');
const envModal = document.getElementById('env-modal');
const closeEnvModal = document.getElementById('close-env-modal');
const closeEnvModalFooter = document.getElementById('close-env-modal-footer');
const backupModal = document.getElementById('backup-modal');
const closeBackupModal = document.getElementById('close-backup-modal');
const closeBackupModalFooter = document.getElementById('close-backup-modal-footer');
const importModal = document.getElementById('import-modal');
const closeImportModal = document.getElementById('close-import-modal');
const cancelImportBtn = document.getElementById('cancel-import-btn');
const confirmImportBtn = document.getElementById('confirm-import-btn');
const importFileInput = document.getElementById('import-file');
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeSettingsModal = document.getElementById('close-settings-modal');
const closeSettingsModalFooter = document.getElementById('close-settings-modal-footer');
const changePasswordForm = document.getElementById('change-password-form');
const changeUsernameForm = document.getElementById('change-username-form');
const logoutBtn = document.getElementById('logout-btn');
const credentialModal = document.getElementById('credential-modal');
const credentialForm = document.getElementById('credential-form');
const credentialActionsList = document.getElementById('credential-actions');
const credentialMessage = document.getElementById('credential-message');
const credentialLogoutBtn = document.getElementById('credential-logout-btn');
const credentialCurrentPassword = document.getElementById('credential-current-password');
const credentialNewPassword = document.getElementById('credential-new-password');
const credentialConfirmPassword = document.getElementById('credential-confirm-password');
const credentialNewUsername = document.getElementById('credential-new-username');
const credentialCurrentPasswordGroup = document.getElementById('credential-current-password-group');
const credentialNewPasswordGroup = document.getElementById('credential-new-password-group');
const credentialConfirmPasswordGroup = document.getElementById('credential-confirm-password-group');
const credentialNewUsernameGroup = document.getElementById('credential-new-username-group');

// Event Listeners
themeToggle.addEventListener('click', toggleTheme);
refreshBtn.addEventListener('click', loadApps);
uploadForm.addEventListener('submit', handleUpload);
zipFileInput.addEventListener('change', handleFileSelect);
selectFileBtn.addEventListener('click', () => zipFileInput.click());
dropZone.addEventListener('dragover', handleDragOver);
dropZone.addEventListener('dragleave', handleDragLeave);
dropZone.addEventListener('drop', handleFileDrop);
['dragover', 'drop'].forEach(eventName => {
  window.addEventListener(eventName, (event) => {
    if (!dropZone.contains(event.target)) {
      event.preventDefault();
    }
  });
});
closeLogsModal.addEventListener('click', () => logsModal.classList.add('hidden'));
closeNotification.addEventListener('click', () => notificationModal.classList.add('hidden'));
exportConfigBtn.addEventListener('click', exportConfiguration);
importConfigBtn.addEventListener('click', () => importModal.classList.remove('hidden'));
closeEnvModal.addEventListener('click', () => envModal.classList.add('hidden'));
closeEnvModalFooter.addEventListener('click', () => envModal.classList.add('hidden'));
closeBackupModal.addEventListener('click', () => backupModal.classList.add('hidden'));
closeBackupModalFooter.addEventListener('click', () => backupModal.classList.add('hidden'));
closeImportModal.addEventListener('click', () => importModal.classList.add('hidden'));
cancelImportBtn.addEventListener('click', () => importModal.classList.add('hidden'));
confirmImportBtn.addEventListener('click', confirmImport);
importFileInput.addEventListener('change', handleImportFileSelect);
settingsBtn.addEventListener('click', () => settingsModal.classList.remove('hidden'));
closeSettingsModal.addEventListener('click', () => settingsModal.classList.add('hidden'));
closeSettingsModalFooter.addEventListener('click', () => settingsModal.classList.add('hidden'));
changePasswordForm.addEventListener('submit', handleChangePassword);
changeUsernameForm.addEventListener('submit', handleChangeUsername);
logoutBtn.addEventListener('click', handleLogout);
credentialForm?.addEventListener('submit', handleCredentialUpdateSubmit);
credentialLogoutBtn?.addEventListener('click', () => handleLogout(true));

// Cerrar modales al hacer clic fuera
logsModal.addEventListener('click', (e) => {
  if (e.target === logsModal) {
    logsModal.classList.add('hidden');
  }
});

notificationModal.addEventListener('click', (e) => {
  if (e.target === notificationModal) {
    notificationModal.classList.add('hidden');
  }
});

const SAFE_HTTP_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function getCsrfToken() {
  const match = document.cookie.match(/(?:^|; )csrfToken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

function isCredentialUpdateError(error) {
  return error?.code === 'CREDENTIAL_UPDATE_REQUIRED' || error?.message === 'CREDENTIAL_UPDATE_REQUIRED';
}

function escapeHtml(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function apiFetch(url, options = {}) {
  const opts = {
    credentials: 'same-origin',
    ...options
  };

  opts.headers = Object.assign({}, opts.headers || {});
  const method = (opts.method || 'GET').toUpperCase();

  if (!SAFE_HTTP_METHODS.has(method)) {
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      opts.headers['X-CSRF-Token'] = csrfToken;
    }
  }

  const response = await fetch(url, opts);

  if (response.status === 401) {
    window.location.href = '/login';
    throw new Error('No autenticado');
  }

  if (response.status === 403) {
    let data = {};
    try {
      data = await response.clone().json();
    } catch (error) {
      // ignorar
    }

    if (data.code === 'CREDENTIAL_UPDATE_REQUIRED') { if (!credentialUpdateState.required || (credentialModal && credentialModal.classList.contains('hidden'))) { showCredentialUpdateModal(data.actionsRequired || {}); } 
      const err = new Error('CREDENTIAL_UPDATE_REQUIRED');
      err.code = 'CREDENTIAL_UPDATE_REQUIRED';
      throw err;
    }

    if (data.code === 'PASSWORD_EXPIRED') {
      showNotification('Tu contraseña expiró. Actualízala antes de continuar.', 'error');
    }

    throw new Error(data.error || 'Acceso denegado');
  }

  return response;
}

// Inicializar
init();

async function init() {
  await loadSystemInfo();
  await loadSystemStats();
  await loadApps();
  
  // Iniciar auto-refresh cada 5 segundos para healthcheck
  startHealthcheckPolling();
}

// Cambiar tema
function toggleTheme() {
  currentTheme = currentTheme === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', currentTheme);
  localStorage.setItem('theme', currentTheme);
  
  const icon = themeToggle.querySelector('.icon');
  if (currentTheme === 'dark') {
    icon.innerHTML = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
  } else {
    icon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
  }
}

// Cargar información del sistema
async function loadSystemInfo() {
  try {
    const response = await apiFetch('/api/system/info');
    const data = await response.json();
    
    if (data.ok) {
      systemInfo = data.info;
      updateSystemInfo();
    }
  } catch (error) {
    if (isCredentialUpdateError(error)) return;
    console.error('Error al cargar información del sistema:', error);
  }
}

// Actualizar información del sistema
function updateSystemInfo() {
  const serverIpElement = document.getElementById('server-ip');
  const totalAppsElement = document.getElementById('total-apps');
  const totalAppsSecondary = document.getElementById('total-apps-secondary');
  const totalSizeElement = document.getElementById('total-size');
  const totalSizeSecondary = document.getElementById('total-size-secondary');
  const activeAppsElement = document.getElementById('active-apps');
  const activeAppsSecondary = document.getElementById('active-apps-secondary');

  if (serverIpElement) {
    if (systemInfo.ips && systemInfo.ips.length > 0) {
      serverIpElement.textContent = systemInfo.ips[0];
    } else {
      serverIpElement.textContent = window.location.hostname;
    }
  }

  const totalAppsCount = apps.length;
  if (totalAppsElement) {
    totalAppsElement.textContent = totalAppsCount;
  }
  if (totalAppsSecondary) {
    totalAppsSecondary.textContent = totalAppsCount;
  }

  let sizeText = '0 MB';
  if (systemStats.totalSize) {
    const sizeMB = (systemStats.totalSize / (1024 * 1024)).toFixed(2);
    sizeText = `${sizeMB} MB`;
  }
  if (totalSizeElement) {
    totalSizeElement.textContent = sizeText;
  }
  if (totalSizeSecondary) {
    totalSizeSecondary.textContent = sizeText;
  }

  const activeCount = apps.filter(app => app.health?.status === 'online').length;
  if (activeAppsElement) {
    activeAppsElement.textContent = activeCount;
  }
  if (activeAppsSecondary) {
    activeAppsSecondary.textContent = activeCount;
  }
}

// Cargar estadísticas del sistema
async function loadSystemStats() {
  try {
    const response = await apiFetch('/api/system/stats');
    const data = await response.json();
    
    if (data.ok) {
      systemStats = data.stats;
      updateSystemInfo();
    }
  } catch (error) {
    if (isCredentialUpdateError(error)) return;
    console.error('Error al cargar estadísticas:', error);
  }
}

// Iniciar polling de healthcheck
function startHealthcheckPolling() {
  if (healthcheckInterval) {
    clearInterval(healthcheckInterval);
  }
  
  healthcheckInterval = setInterval(async () => { if (credentialUpdateState.required) { return; }
    // Solo actualizar las apps sin mostrar notificaciones
    try {
      const response = await apiFetch('/api/apps');
      const data = await response.json();
      
      if (data.ok) {
        apps = data.apps;
        updateAppsHealthStatus();
        await loadSystemStats();
      }
  } catch (error) {
    if (isCredentialUpdateError(error)) return;
    console.error('Error en healthcheck polling:', error);
  }
  }, 5000); // Cada 5 segundos
}

// Actualizar solo el estado de health de las apps sin re-renderizar todo
function updateAppsHealthStatus() {
  apps.forEach(app => {
    const card = document.getElementById(`app-${app.name}`);
    if (card) {
      const healthBadge = card.querySelector('.health-badge');
      if (healthBadge && app.health) {
        const isOnline = app.health.status === 'online';
        healthBadge.className = `health-badge ${isOnline ? 'online' : 'offline'}`;
        healthBadge.innerHTML = `
          <svg class="health-icon" width="10" height="10" viewBox="0 0 24 24" fill="${isOnline ? '#10b981' : '#ef4444'}">
            <circle cx="12" cy="12" r="10"/>
          </svg>
          ${isOnline ? 'Online' : 'Offline'}
        `;
      }
    }
  });
}

// Cargar lista de apps
async function loadApps() {
  try {
    const response = await apiFetch('/api/apps');
    const data = await response.json();
    
    if (data.ok) {
      apps = data.apps;
      renderApps();
      updateSystemInfo();
    } else {
      showNotification('Error al cargar apps: ' + data.error, 'error');
    }
  } catch (error) {
    if (isCredentialUpdateError(error)) return;
    console.error('Error al cargar apps:', error);
    showNotification('Error de conexión', 'error');
  }
}

// Renderizar apps
function renderApps() {
  if (apps.length === 0) {
    emptyState.style.display = 'block';
    return;
  }
  
  emptyState.style.display = 'none';
  
  appsGrid.innerHTML = apps.map(app => createAppCard(app)).join('');
  
  // Agregar event listeners a los botones
  apps.forEach(app => {
    const card = document.getElementById(`app-${app.name}`);
    if (card) {
      card.querySelector('.btn-open')?.addEventListener('click', () => openApp(app));
      card.querySelector('.btn-pause')?.addEventListener('click', () => pauseApp(app.name));
      card.querySelector('.btn-resume')?.addEventListener('click', () => resumeApp(app.name));
      card.querySelector('.btn-restart')?.addEventListener('click', () => restartApp(app.name));
      card.querySelector('.btn-logs')?.addEventListener('click', () => showLogs(app.name));
      card.querySelector('.btn-env')?.addEventListener('click', () => showEnvVars(app.name));
      card.querySelector('.btn-backups')?.addEventListener('click', () => showBackups(app.name));
      card.querySelector('.btn-delete')?.addEventListener('click', () => deleteApp(app.name));
    }
  });
}

// Crear tarjeta de app
function createAppCard(app) {
  const serverIp = systemInfo.ips?.[0] || window.location.hostname;
  
  // Determinar URL según publicPath o tipo
  let appUrl;
  if (app.publicPath) {
    appUrl = `http://${serverIp}:${window.location.port}${app.publicPath}`;
  } else if (app.type === 'nodejs') {
    appUrl = `http://${serverIp}:${app.port}`;
  } else {
    appUrl = `http://${serverIp}:${window.location.port}/apps/${app.name}`;
  }
  
  const deployDate = new Date(app.deployedAt).toLocaleString('es-ES');
  const startCommandEscaped = app.startCommand ? escapeHtml(app.startCommand) : '';
  const startCommandSourceEscaped = app.startCommandSource ? escapeHtml(app.startCommandSource) : '';
  
  let statusIcon, statusText;
  if (app.status === 'running') {
    statusIcon = '<svg class="status-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" fill="#10b981"/></svg>';
    statusText = 'Activa';
  } else if (app.status === 'paused') {
    statusIcon = '<svg class="status-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" fill="#f59e0b"/></svg>';
    statusText = 'Pausada';
  } else {
    statusIcon = '<svg class="status-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" fill="#ef4444"/></svg>';
    statusText = 'Detenida';
  }
  
  // Health badge
  const isOnline = app.health?.status === 'online';
  const healthBadge = app.type === 'nodejs' ? `
    <div class="health-badge ${isOnline ? 'online' : 'offline'}">
      <svg class="health-icon" width="10" height="10" viewBox="0 0 24 24" fill="${isOnline ? '#10b981' : '#ef4444'}">
        <circle cx="12" cy="12" r="10"/>
      </svg>
      ${isOnline ? 'Online' : 'Offline'}
    </div>
  ` : '';
  
  const warningBadge = app.overwritten ? '<div class="app-info-item"><span class="app-info-label">Estado:</span><span class="app-info-value"><svg class="warning-badge" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Sobrescrita</span></div>' : '';
  
  // Calcular tamaño si está disponible
  const sizeInfo = app.size ? `
    <div class="app-info-item">
      <span class="app-info-label">Tamaño:</span>
      <span class="app-info-value">${(app.size / (1024 * 1024)).toFixed(2)} MB</span>
    </div>
  ` : '';
  
  return `
    <div class="app-card" id="app-${app.name}">
      <div class="app-header">
        <h3 class="app-name">${app.name}</h3>
        <div class="app-badges">
          <span class="app-status ${app.status}">${statusIcon} ${statusText}</span>
          ${healthBadge}
        </div>
      </div>
      
      <div class="app-info">
        <div class="app-info-item">
          <span class="app-info-label">Tipo:</span>
          <span class="app-info-value">
            <span class="app-type">${getAppTypeLabel(app.type)}</span>
          </span>
        </div>
        <div class="app-info-item">
          <span class="app-info-label">Puerto:</span>
          <span class="app-info-value">${app.port}</span>
        </div>
        ${app.publicPath ? `
        <div class="app-info-item">
          <span class="app-info-label">Ruta pública:</span>
          <span class="app-info-value">${app.publicPath}</span>
        </div>
        ` : ''}
        <div class="app-info-item">
          <span class="app-info-label">URL:</span>
          <span class="app-info-value">
            <a href="${appUrl}" target="_blank" class="app-url">${appUrl}</a>
          </span>
        </div>
        <div class="app-info-item">
          <span class="app-info-label">Desplegada:</span>
          <span class="app-info-value">${deployDate}</span>
        </div>
        ${app.startCommand ? `
        <div class="app-info-item">
          <span class="app-info-label">Comando:</span>
          <span class="app-info-value">
            ${startCommandEscaped}
            ${app.startCommandSource ? `<span class="app-info-note">(${startCommandSourceEscaped})</span>` : ''}
          </span>
        </div>
        ` : ''}
        ${sizeInfo}
        ${warningBadge}
      </div>
      
      <div class="app-actions">
        <button class="btn btn-success btn-open">
          <svg class="btn-icon-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          <span>Abrir</span>
        </button>
        ${app.type === 'nodejs' && app.status === 'running' ? '<button class="btn btn-warning btn-pause"><svg class="btn-icon-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg><span>Pausar</span></button>' : ''}
        ${app.type === 'nodejs' && app.status === 'paused' ? '<button class="btn btn-success btn-resume"><svg class="btn-icon-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg><span>Reanudar</span></button>' : ''}
        <button class="btn btn-secondary btn-restart">
          <svg class="btn-icon-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
          <span>Reiniciar</span>
        </button>
        ${app.type === 'nodejs' ? '<button class="btn btn-secondary btn-logs"><svg class="btn-icon-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg><span>Logs</span></button>' : ''}
        <button class="btn btn-secondary btn-env">
          <svg class="btn-icon-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v6m0 6v6m5.4-15.4l-4.2 4.2m0 6l-4.2 4.2m11.8-10-6 0m-6 0h-6m15.4 5.4l-4.2-4.2m0-6l-4.2-4.2"/></svg>
          <span>Env</span>
        </button>
        <button class="btn btn-secondary btn-backups">
          <svg class="btn-icon-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          <span>Backups</span>
        </button>
        <button class="btn btn-danger btn-delete">
          <svg class="btn-icon-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          <span>Eliminar</span>
        </button>
      </div>
    </div>
  `;
}

// Obtener etiqueta de tipo de app
function getAppTypeLabel(type) {
  const labels = {
    'nodejs': 'Node.js',
    'static': 'Estático',
    'storage': 'Almacenamiento',
    'auto': 'Auto-detectado'
  };
  return labels[type] || type;
}

// Manejar selección de archivo
function handleFileSelect(e) {
  const file = e.target.files?.[0] || null;
  assignSelectedFile(file);
}

function handleDragOver(event) {
  event.preventDefault();
  dropZone.classList.add('drag-over');
}

function handleDragLeave(event) {
  if (!dropZone.contains(event.relatedTarget)) {
    dropZone.classList.remove('drag-over');
  }
}

function handleFileDrop(event) {
  event.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = event.dataTransfer?.files?.[0];
  if (!file) {
    return;
  }

  if (window.DataTransfer) {
    const dt = new DataTransfer();
    dt.items.add(file);
    zipFileInput.files = dt.files;
  }

  assignSelectedFile(file);
}

function assignSelectedFile(file) {
  if (!file) {
    selectedFile = null;
    fileNameDisplay.textContent = 'Ningun archivo seleccionado';
    if (zipFileInput) {
      zipFileInput.value = '';
    }
    resetZipAnalysis();
    return;
  }

  if (!file.name.toLowerCase().endsWith('.zip')) {
    showNotification('Por favor selecciona un archivo .zip válido', 'error');
    if (zipFileInput) {
      zipFileInput.value = '';
    }
    selectedFile = null;
    fileNameDisplay.textContent = 'Ningun archivo seleccionado';
    resetZipAnalysis();
    return;
  }

  selectedFile = file;
  fileNameDisplay.textContent = file.name;
  analyzeZipFile(file);
}

function resetZipAnalysis() {
  if (zipPreview) {
    zipPreview.setAttribute('hidden', true);
  }
  if (zipPreviewList) {
    zipPreviewList.innerHTML = '';
  }
  if (zipPreviewMeta) {
    zipPreviewMeta.textContent = '';
  }
  detectedStartCommandValue = '';
  updateDetectedCommandUI('Analiza un ZIP para ver el comando sugerido.');
}

async function analyzeZipFile(file) {
  if (!window.JSZip) {
    updateDetectedCommandUI('JSZip no está disponible. Ingresa el comando manualmente.');
    return;
  }

  try {
    const zip = await JSZip.loadAsync(file);
    const entries = Object.values(zip.files);
    renderZipPreview(entries);
    await detectStartCommandFromZip(zip, entries);
  } catch (error) {
    console.error('Error analizando ZIP:', error);
    resetZipAnalysis();
    updateDetectedCommandUI('No se pudo analizar el ZIP. Ingresa el comando manualmente.');
  }
}

function renderZipPreview(entries) {
  if (!zipPreview || !zipPreviewList) {
    return;
  }

  const maxEntries = 12;
  const sortedEntries = entries
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, maxEntries);

  zipPreviewList.innerHTML = sortedEntries.map(entry => {
    const iconLabel = entry.dir ? 'DIR' : 'FILE';
    return `
      <li class="preview-item ${entry.dir ? 'dir' : 'file'}">
        <span class="preview-icon">${iconLabel}</span>
        <span class="preview-name">${entry.name}</span>
      </li>
    `;
  }).join('');

  if (zipPreviewMeta) {
    zipPreviewMeta.textContent = `${entries.length} elementos`;
  }

  zipPreview.removeAttribute('hidden');
}

async function detectStartCommandFromZip(zip, entries) {
  let command = '';
  let source = '';

  const packageEntries = entries
    .filter(entry => !entry.dir && entry.name.toLowerCase().endsWith('package.json'))
    .sort((a, b) => a.name.split('/').length - b.name.split('/').length);

  if (packageEntries.length > 0) {
    try {
      const packageContent = await zip.file(packageEntries[0].name).async('string');
      const packageJson = JSON.parse(packageContent);
      
      if (packageJson.scripts && packageJson.scripts.start) {
        command = 'npm start';
        source = 'package.json (script start)';
      } else if (packageJson.main) {
        command = `node ${packageJson.main}`;
        source = 'package.json (main)';
      }
    } catch (error) {
      console.warn('No se pudo leer package.json del ZIP:', error);
    }
  }

  const fileNames = entries.map(entry => entry.name.toLowerCase());

  if (!command) {
    if (fileNames.some(name => name.endsWith('server.js'))) {
      command = 'node server.js';
      source = 'server.js detectado';
    } else if (fileNames.some(name => name.endsWith('index.js'))) {
      command = 'node index.js';
      source = 'index.js detectado';
    }
  }

  detectedStartCommandValue = command;

  if (command) {
    updateDetectedCommandUI(`${command} (${source || 'auto'})`);
    if (startCommandInput && !startCommandInput.value) {
      startCommandInput.placeholder = command;
    }
  } else {
    updateDetectedCommandUI('No se detectó comando de inicio. Ingresa uno manualmente.');
  }
}

function updateDetectedCommandUI(message) {
  if (detectedStartCommandBox) {
    detectedStartCommandBox.textContent = message;
  }
}

async function postJson(url, payload) {
  const response = await apiFetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!data.ok) {
    throw new Error(data.error || 'Operación no completada');
  }
  return data;
}

function showCredentialUpdateModal(actions = {}) { if (!credentialModal) return; const alreadyVisible = credentialUpdateState.required && !credentialModal.classList.contains('hidden'); credentialUpdateState.required = true; credentialUpdateState.actions = { password: Boolean(actions.password), username: Boolean(actions.username) }; if (!alreadyVisible) { updateCredentialModalUI(); } credentialModal.classList.remove('hidden'); }

function updateCredentialModalUI() {
  if (!credentialModal) return;
  const items = [];
  if (credentialUpdateState.actions.password) {
    items.push('Cambiar tu contraseña predeterminada');
  }
  if (credentialUpdateState.actions.username) {
    items.push('Elegir un nuevo nombre de usuario');
  }
  credentialActionsList.innerHTML = items.length
    ? items.map(item => `<li>${item}</li>`).join('')
    : '<li>No hay acciones pendientes.</li>';
  credentialMessage.textContent = 'Completa estos pasos para asegurar tu panel:';

  toggleCredentialField(credentialCurrentPasswordGroup, credentialUpdateState.actions.password || credentialUpdateState.actions.username);
  toggleCredentialField(credentialNewPasswordGroup, credentialUpdateState.actions.password);
  toggleCredentialField(credentialConfirmPasswordGroup, credentialUpdateState.actions.password);
  toggleCredentialField(credentialNewUsernameGroup, credentialUpdateState.actions.username);

  credentialForm?.reset();
}

function toggleCredentialField(element, shouldShow) {
  if (!element) return;
  if (shouldShow) {
    element.removeAttribute('hidden');
  } else {
    element.setAttribute('hidden', 'hidden');
  }
}

async function handleCredentialUpdateSubmit(event) {
  event.preventDefault();
  if (!credentialUpdateState.required) {
    return;
  }

  const actions = { ...credentialUpdateState.actions };
  const currentPassword = credentialCurrentPassword?.value || '';
  const newPassword = credentialNewPassword?.value || '';
  const confirmPassword = credentialConfirmPassword?.value || '';
  const newUsername = credentialNewUsername?.value?.trim() || '';

  if ((actions.password || actions.username) && !currentPassword) {
    showNotification('Ingresa tu contraseña actual.', 'error');
    return;
  }

  if (actions.password) {
    if (!newPassword) {
      showNotification('Ingresa una nueva contraseña.', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showNotification('La confirmación de contraseña no coincide.', 'error');
      return;
    }
  }

  if (actions.username && !newUsername) {
    showNotification('Ingresa un nuevo nombre de usuario.', 'error');
    return;
  }

  try {
    if (actions.password) {
      await postJson('/api/auth/change-password', {
        currentPassword,
        newPassword
      });
      credentialUpdateState.actions.password = false;
    }

    if (actions.username) {
      const passwordForUsername = actions.password ? newPassword : currentPassword;
      await postJson('/api/auth/change-username', {
        newUsername,
        currentPassword: passwordForUsername
      });
      credentialUpdateState.actions.username = false;
    }

    credentialModal?.classList.add('hidden');
    showNotification('Credenciales actualizadas. Vuelve a iniciar sesión.', 'success');
    await handleLogout(true);
  } catch (error) {
    console.error('Error actualizando credenciales', error);
    showNotification(error.message || 'No se pudo actualizar la información', 'error');
  }
}

// Manejar subida de app
async function handleUpload(event) {
  event.preventDefault();

  const appName = document.getElementById('app-name').value.trim();
  const appType = document.getElementById('app-type').value;
  const publicPath = document.getElementById('public-path').value.trim();
  const startCommandValue = (startCommandInput?.value.trim()) || detectedStartCommandValue;

  if (!appName) {
    showNotification('Debes indicar un nombre para la app.', 'error');
    return;
  }

  if (!selectedFile) {
    showNotification('Selecciona un archivo ZIP antes de desplegar.', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('name', appName);
  formData.append('type', appType);
  formData.append('publicPath', publicPath);
  if (startCommandValue) {
    formData.append('startCommand', startCommandValue);
  }
  formData.append('zipfile', selectedFile, selectedFile.name);

  const deployBtn = document.getElementById('deploy-btn');
  deployBtn.disabled = true;
  deployBtn.querySelector('span').textContent = 'Desplegando...';

  try {
    const response = await uploadAppWithProgress(formData);
    if (response.ok) {
      showUploadStatus('App desplegada con éxito', 100, true);
      showNotification('App desplegada exitosamente', 'success');
      uploadForm.reset();
      assignSelectedFile(null);
      if (startCommandInput) {
        startCommandInput.value = '';
        startCommandInput.placeholder = 'npm run start:prod';
      }
      await loadApps();
      await loadSystemStats();
    } else {
      throw new Error(response.error || 'Error al desplegar la app');
    }
  } catch (error) {
    if (isCredentialUpdateError(error)) {
      deployBtn.disabled = false;
      deployBtn.querySelector('span').textContent = 'Desplegar App';
      return;
    }
    console.error('Error al desplegar app:', error);
    showUploadStatus('Error en el despliegue', 100, true);
    showNotification(error.message || 'Error al desplegar la app', 'error');
  } finally {
    deployBtn.disabled = false;
    deployBtn.querySelector('span').textContent = 'Desplegar App';
    setTimeout(() => uploadStatus.classList.add('hidden'), 2500);
  }
}

function showUploadStatus(message, percent = 0, completed = false) {
  if (!uploadStatus) {
    return;
  }
  uploadStatus.classList.remove('hidden');
  const messageElement = uploadStatus.querySelector('.status-message');
  if (messageElement) {
    messageElement.textContent = message;
  }
  updateUploadProgress(percent);
  if (completed) {
    uploadStatus.classList.add('completed');
  } else {
    uploadStatus.classList.remove('completed');
  }
}

function updateUploadProgress(percent) {
  const normalized = Math.min(Math.max(percent || 0, 0), 100);
  const progressFill = uploadStatus?.querySelector('.progress-fill');
  if (progressFill) {
    progressFill.style.width = `${normalized}%`;
  }
  if (uploadProgressLabel) {
    uploadProgressLabel.textContent = `${Math.round(normalized)}%`;
  }
}

function uploadAppWithProgress(formData) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/apps');

    const csrfToken = getCsrfToken();
    if (csrfToken) {
      xhr.setRequestHeader('X-CSRF-Token', csrfToken);
    }

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = (event.loaded / event.total) * 100;
        showUploadStatus('Subiendo archivo...', percent);
      }
    };

    xhr.onreadystatechange = () => {
      if (xhr.readyState !== XMLHttpRequest.DONE) {
        return;
      }

      let response;
      try {
        response = JSON.parse(xhr.responseText || '{}');
      } catch (error) {
        reject(new Error('Respuesta inválida del servidor'));
        return;
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(response);
      } else {
        reject(new Error(response?.error || 'Error al desplegar la app'));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Error de red durante el despliegue'));
    };

    showUploadStatus('Preparando despliegue...', 5);
    xhr.send(formData);
  });
}

// Abrir app
function openApp(app) {
  const serverIp = systemInfo.ips?.[0] || window.location.hostname;
  
  let url;
  if (app.publicPath) {
    url = `http://${serverIp}:${window.location.port}${app.publicPath}`;
  } else if (app.type === 'nodejs') {
    url = `http://${serverIp}:${app.port}`;
  } else {
    url = `http://${serverIp}:${window.location.port}/apps/${app.name}`;
  }
  
  window.open(url, '_blank');
}

// Pausar app
async function pauseApp(name) {
  try {
    const response = await apiFetch(`/api/apps/${name}/pause`, {
      method: 'POST'
    });
    
    const data = await response.json();
    
    if (data.ok) {
      showNotification(`App "${name}" pausada exitosamente.`, 'success');
      await loadApps();
    } else {
      showNotification('Error al pausar la aplicación:\n\n' + data.error, 'error');
    }
  } catch (error) {
    if (isCredentialUpdateError(error)) return;
    console.error('Error al pausar app:', error);
    showNotification('Error de conexión con el servidor.', 'error');
  }
}

// Reanudar app
async function resumeApp(name) {
  try {
    const response = await apiFetch(`/api/apps/${name}/resume`, {
      method: 'POST'
    });
    
    const data = await response.json();
    
    if (data.ok) {
      showNotification(`App "${name}" reanudada exitosamente.`, 'success');
      await loadApps();
    } else {
      showNotification('Error al reanudar la aplicación:\n\n' + data.error, 'error');
    }
  } catch (error) {
    if (isCredentialUpdateError(error)) return;
    console.error('Error al reanudar app:', error);
    showNotification('Error de conexión con el servidor.', 'error');
  }
}

// Reiniciar app
async function restartApp(name) {
  try {
    const response = await apiFetch(`/api/apps/${name}/restart`, {
      method: 'POST'
    });
    
    const data = await response.json();
    
    if (data.ok) {
      showNotification(`App "${name}" reiniciada exitosamente.`, 'success');
      await loadApps();
    } else {
      showNotification('Error al reiniciar la aplicación:\n\n' + data.error, 'error');
    }
  } catch (error) {
    if (isCredentialUpdateError(error)) return;
    console.error('Error al reiniciar app:', error);
    showNotification('Error de conexión con el servidor.', 'error');
  }
}

// Mostrar logs
async function showLogs(name) {
  const modalAppName = document.getElementById('modal-app-name');
  const logsContent = document.getElementById('logs-content');
  
  modalAppName.textContent = name;
  logsContent.textContent = 'Cargando logs...';
  logsModal.classList.remove('hidden');
  
  try {
    const response = await apiFetch(`/api/apps/${name}/logs`);
    const data = await response.json();
    
    if (data.ok) {
      logsContent.textContent = data.logs || 'No hay logs disponibles';
    } else {
      logsContent.textContent = 'Error al cargar logs: ' + data.error;
      showNotification('Error al cargar los logs:\n\n' + data.error, 'error');
    }
  } catch (error) {
    if (isCredentialUpdateError(error)) return;
    console.error('Error al cargar logs:', error);
    logsContent.textContent = 'Error de conexión';
    showNotification('Error de conexión con el servidor.', 'error');
  }
}

// Eliminar app
async function deleteApp(name) {
  // Crear modal de confirmación personalizado
  const confirmed = await showConfirmation(
    `¿Eliminar la app "${name}"?`,
    'Esta acción eliminará permanentemente:\n• La aplicación y todos sus archivos\n• Los logs asociados\n• La configuración\n\nEsta acción no se puede deshacer.'
  );
  
  if (!confirmed) {
    return;
  }
  
  try {
    const response = await apiFetch(`/api/apps/${name}`, {
      method: 'DELETE'
    });
    
    const data = await response.json();
    
    if (data.ok) {
      showNotification(`App "${name}" eliminada exitosamente.`, 'success');
      await loadApps();
    } else {
      showNotification('Error al eliminar la aplicación:\n\n' + data.error, 'error');
    }
  } catch (error) {
    if (isCredentialUpdateError(error)) return;
    console.error('Error al eliminar app:', error);
    showNotification('Error de conexión con el servidor.', 'error');
  }
}

// Mostrar modal de confirmación
function showConfirmation(title, message) {
  return new Promise((resolve) => {
    const icon = document.getElementById('notification-icon');
    const messageElement = document.getElementById('notification-message');
    const closeBtn = document.getElementById('close-notification');
    
    icon.innerHTML = '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
    messageElement.innerHTML = `<strong>${title}</strong><br><br>${message.replace(/\n/g, '<br>')}`;
    
    // Cambiar botón a dos opciones
    closeBtn.textContent = 'Cancelar';
    closeBtn.className = 'btn btn-secondary';
    
    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = 'Eliminar';
    confirmBtn.className = 'btn btn-danger';
    confirmBtn.style.marginTop = '10px';
    
    const modalBody = closeBtn.parentElement;
    modalBody.appendChild(confirmBtn);
    
    notificationModal.classList.remove('hidden');
    
    const cleanup = () => {
      confirmBtn.remove();
      closeBtn.textContent = 'Aceptar';
      closeBtn.className = 'btn btn-primary';
      notificationModal.classList.add('hidden');
    };
    
    const handleConfirm = () => {
      cleanup();
      resolve(true);
      confirmBtn.removeEventListener('click', handleConfirm);
      closeBtn.removeEventListener('click', handleCancel);
    };
    
    const handleCancel = () => {
      cleanup();
      resolve(false);
      confirmBtn.removeEventListener('click', handleConfirm);
      closeBtn.removeEventListener('click', handleCancel);
    };
    
    confirmBtn.addEventListener('click', handleConfirm);
    closeBtn.addEventListener('click', handleCancel);
  });
}

// Mostrar notificación en modal
function showNotification(message, type = 'info') {
  const icon = document.getElementById('notification-icon');
  const messageElement = document.getElementById('notification-message');
  
  // Iconos SVG según el tipo
  const icons = {
    'success': '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    'error': '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    'warning': '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    'info': '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
  };
  
  icon.innerHTML = icons[type] || icons['info'];
  messageElement.textContent = message;
  
  notificationModal.classList.remove('hidden');
  
  // Log en consola también
  console.log(`[${type.toUpperCase()}] ${message}`);
}

// ============== NUEVAS FUNCIONALIDADES ==============

// Variables de entorno
async function showEnvVars(appName) {
  const envAppName = document.getElementById('env-app-name');
  const envVarsList = document.getElementById('env-vars-list');
  
  envAppName.textContent = appName;
  envVarsList.innerHTML = '<p>Cargando variables de entorno...</p>';
  envModal.classList.remove('hidden');
  
  try {
    const response = await apiFetch(`/api/apps/${appName}/envs`);
    const data = await response.json();
    
    if (data.ok) {
      renderEnvVars(appName, data.envs);
    } else {
      envVarsList.innerHTML = '<p>Error al cargar variables de entorno</p>';
      showNotification('Error al cargar variables de entorno: ' + data.error, 'error');
    }
  } catch (error) {
    if (isCredentialUpdateError(error)) return;
    console.error('Error al cargar env vars:', error);
    envVarsList.innerHTML = '<p>Error de conexión</p>';
    showNotification('Error de conexión con el servidor.', 'error');
  }
}

function renderEnvVars(appName, envs) {
  const envVarsList = document.getElementById('env-vars-list');
  
  if (Object.keys(envs).length === 0) {
    envVarsList.innerHTML = '<p class="empty-message">No hay variables de entorno definidas</p>';
  } else {
    envVarsList.innerHTML = Object.entries(envs).map(([key, value]) => `
      <div class="env-var-item">
        <div class="env-var-info">
          <strong>${key}</strong>
          <span>${value}</span>
        </div>
        <button class="btn btn-danger btn-sm" onclick="deleteEnvVar('${appName}', '${key}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      </div>
    `).join('');
  }
  
  // Setup add env button
  const addEnvBtn = document.getElementById('add-env-btn');
  addEnvBtn.onclick = () => addEnvVar(appName);
}

async function addEnvVar(appName) {
  const keyInput = document.getElementById('new-env-key');
  const valueInput = document.getElementById('new-env-value');
  
  const key = keyInput.value.trim();
  const value = valueInput.value.trim();
  
  if (!key || !value) {
    showNotification('Por favor completa ambos campos', 'warning');
    return;
  }
  
  try {
    const response = await apiFetch(`/api/apps/${appName}/envs`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: value })
    });
    
    const data = await response.json();
    
    if (data.ok) {
      keyInput.value = '';
      valueInput.value = '';
      showEnvVars(appName); // Recargar
      showNotification('Variable agregada exitosamente', 'success');
    } else {
      showNotification('Error al agregar variable: ' + data.error, 'error');
    }
  } catch (error) {
    if (isCredentialUpdateError(error)) return;
    console.error('Error al agregar env var:', error);
    showNotification('Error de conexión', 'error');
  }
}

async function deleteEnvVar(appName, key) {
  try {
    const response = await apiFetch(`/api/apps/${appName}/envs/${key}`, {
      method: 'DELETE'
    });
    
    const data = await response.json();
    
    if (data.ok) {
      showEnvVars(appName); // Recargar
      showNotification('Variable eliminada exitosamente', 'success');
    } else {
      showNotification('Error al eliminar variable: ' + data.error, 'error');
    }
  } catch (error) {
    if (isCredentialUpdateError(error)) return;
    console.error('Error al eliminar env var:', error);
    showNotification('Error de conexión', 'error');
  }
}

// Backups
async function showBackups(appName) {
  const backupAppName = document.getElementById('backup-app-name');
  const backupsList = document.getElementById('backups-list');
  
  backupAppName.textContent = appName;
  backupsList.innerHTML = '<p>Cargando backups...</p>';
  backupModal.classList.remove('hidden');
  
  try {
    const response = await apiFetch(`/api/apps/${appName}/backups`);
    const data = await response.json();
    
    if (data.ok) {
      renderBackups(appName, data.backups);
    } else {
      backupsList.innerHTML = '<p>Error al cargar backups</p>';
      showNotification('Error al cargar backups: ' + data.error, 'error');
    }
  } catch (error) {
    if (isCredentialUpdateError(error)) return;
    console.error('Error al cargar backups:', error);
    backupsList.innerHTML = '<p>Error de conexión</p>';
    showNotification('Error al cargar backups', 'error');
  }
}

function renderBackups(appName, backups) {
  const backupsList = document.getElementById('backups-list');
  
  if (backups.length === 0) {
    backupsList.innerHTML = '<p class="empty-message">No hay backups disponibles</p>';
  } else {
    backupsList.innerHTML = '<div class="backups-container">' + backups.map(backup => {
      const date = new Date(backup.timestamp).toLocaleString('es-ES');
      const sizeMB = (backup.size / (1024 * 1024)).toFixed(2);
      
      return `
        <div class="backup-item">
          <div class="backup-info">
            <strong>${backup.filename}</strong>
            <span>${date} - ${sizeMB} MB</span>
          </div>
          <div class="backup-actions">
            <button class="btn btn-success btn-sm" onclick="restoreBackup('${appName}', '${backup.filename}')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="23 4 23 10 17 10"/>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
              </svg>
              Restaurar
            </button>
            <button class="btn btn-danger btn-sm" onclick="deleteBackup('${appName}', '${backup.filename}')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
            </button>
          </div>
        </div>
      `;
    }).join('') + '</div>';
  }
}

async function restoreBackup(appName, filename) {
  const confirmed = await showConfirmation(
    '¿Restaurar backup?',
    `Esto restaurará la app "${appName}" al estado del backup:\n${filename}\n\nLa versión actual se perderá.`
  );
  
  if (!confirmed) return;
  
  try {
    const response = await apiFetch(`/api/apps/${appName}/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ backup: filename })
    });
    
    const data = await response.json();
    
    if (data.ok) {
      backupModal.classList.add('hidden');
      showNotification('Backup restaurado exitosamente', 'success');
      await loadApps();
    } else {
      showNotification('Error al restaurar backup: ' + data.error, 'error');
    }
  } catch (error) {
    if (isCredentialUpdateError(error)) return;
    console.error('Error al restaurar backup:', error);
    showNotification('Error de conexión', 'error');
  }
}

async function deleteBackup(appName, filename) {
  const confirmed = await showConfirmation(
    '¿Eliminar backup?',
    `Esto eliminará permanentemente el backup:\n${filename}\n\nEsta acción no se puede deshacer.`
  );
  
  if (!confirmed) return;
  
  try {
    const response = await apiFetch(`/api/apps/${appName}/backups/${filename}`, {
      method: 'DELETE'
    });
    
    const data = await response.json();
    
    if (data.ok) {
      showBackups(appName); // Recargar
      showNotification('Backup eliminado exitosamente', 'success');
    } else {
      showNotification('Error al eliminar backup: ' + data.error, 'error');
    }
  } catch (error) {
    if (isCredentialUpdateError(error)) return;
    console.error('Error al eliminar backup:', error);
    showNotification('Error de conexión', 'error');
  }
}

// Exportar/Importar configuración
async function exportConfiguration() {
  try {
    const response = await apiFetch('/api/config/export');
    const blob = await response.blob();
    
    // Crear un enlace de descarga
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `minipaas-config-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    showNotification('Configuración exportada exitosamente', 'success');
  } catch (error) {
    if (isCredentialUpdateError(error)) return;
    console.error('Error al exportar configuración:', error);
    showNotification('Error al exportar configuración', 'error');
  }
}

function handleImportFileSelect(e) {
  const file = e.target.files[0];
  const confirmBtn = document.getElementById('confirm-import-btn');
  
  if (file && file.name.toLowerCase().endsWith('.json')) {
    confirmBtn.disabled = false;
  } else {
    confirmBtn.disabled = true;
    if (file) {
      showNotification('Por favor selecciona un archivo JSON válido', 'warning');
    }
  }
}

async function confirmImport() {
  const fileInput = document.getElementById('import-file');
  const file = fileInput.files[0];
  
  if (!file) {
    showNotification('Por favor selecciona un archivo', 'warning');
    return;
  }
  
  const confirmed = await showConfirmation(
    '¿Importar configuración?',
    'Esto importará todas las apps y configuraciones del archivo.\n\nLas apps existentes con el mismo nombre serán sobrescritas.'
  );
  
  if (!confirmed) {
    importModal.classList.add('hidden');
    return;
  }
  
  const formData = new FormData();
  formData.append('config', file);
  
  try {
    const response = await apiFetch('/api/config/import', {
      method: 'POST',
      body: formData
    });
    
    const data = await response.json();
    
    if (data.ok) {
      importModal.classList.add('hidden');
      fileInput.value = '';
      document.getElementById('confirm-import-btn').disabled = true;
      showNotification(`Configuración importada exitosamente.\n${data.imported} apps importadas.`, 'success');
      await loadApps();
    } else {
      showNotification('Error al importar configuración: ' + data.error, 'error');
    }
  } catch (error) {
    if (isCredentialUpdateError(error)) return;
    console.error('Error al importar configuración:', error);
    showNotification('Error de conexión', 'error');
  }
}

// Hacer funciones globales para onclick
window.deleteEnvVar = deleteEnvVar;
window.restoreBackup = restoreBackup;
window.deleteBackup = deleteBackup;

// ============== CONFIGURACIÓN ==============

// Cambiar contraseña
async function handleChangePassword(e) {
  e.preventDefault();
  
  const currentPassword = document.getElementById('current-password').value;
  const newPassword = document.getElementById('new-password').value;
  const confirmPassword = document.getElementById('confirm-password').value;
  
  // Validaciones
  if (newPassword.length < 6) {
    showNotification('La contraseña debe tener al menos 6 caracteres', 'warning');
    return;
  }
  
  if (newPassword !== confirmPassword) {
    showNotification('Las contraseñas no coinciden', 'warning');
    return;
  }
  
  try {
    const response = await apiFetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentPassword,
        newPassword
      })
    });
    
    const data = await response.json();
    
    if (data.ok) {
      showNotification('Contraseña cambiada exitosamente', 'success');
      changePasswordForm.reset();
      settingsModal.classList.add('hidden');
    } else {
      showNotification('Error al cambiar contraseña: ' + data.error, 'error');
    }
  } catch (error) {
    if (isCredentialUpdateError(error)) return;
    console.error('Error al cambiar contraseña:', error);
    showNotification('Error de conexión', 'error');
  }
}

// Cambiar nombre de usuario
async function handleChangeUsername(e) {
  e.preventDefault();
  
  const newUsername = document.getElementById('new-username').value.trim();
  const password = document.getElementById('confirm-username-password').value;
  
  // Validaciones
  if (!newUsername || newUsername.length < 3) {
    showNotification('El usuario debe tener al menos 3 caracteres', 'warning');
    return;
  }
  
  if (!/^[a-zA-Z0-9_-]+$/.test(newUsername)) {
    showNotification('El usuario solo puede contener letras, números, guiones y guiones bajos', 'warning');
    return;
  }
  
  try {
    const response = await apiFetch('/api/auth/change-username', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        newUsername,
        currentPassword: password
      })
    });
    
    const data = await response.json();
    
    if (data.ok) {
      showNotification(`Usuario cambiado exitosamente a "${newUsername}".\n\nDebes iniciar sesión nuevamente.`, 'success');
      changeUsernameForm.reset();
      settingsModal.classList.add('hidden');
      
      // Redirigir al login después de 2 segundos
      setTimeout(() => {
        window.location.href = '/login.html';
      }, 2000);
    } else {
      showNotification('Error al cambiar usuario: ' + data.error, 'error');
    }
  } catch (error) {
    if (isCredentialUpdateError(error)) return;
    console.error('Error al cambiar usuario:', error);
    showNotification('Error de conexión', 'error');
  }
}

// Cerrar sesión
async function handleLogout(skipConfirm = false) {
  if (!skipConfirm) {
    const confirmed = await showConfirmation(
      '¿Cerrar sesión?',
      'Serás redirigido a la página de inicio de sesión.'
    );
    
    if (!confirmed) return;
  }
  
  try {
    await apiFetch('/api/auth/logout', { method: 'POST' });
  } catch (error) {
    console.error('Error al cerrar sesión:', error);
  } finally {
    window.location.href = '/login.html';
  }
}






