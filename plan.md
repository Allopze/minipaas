# Security and Deployment Improvements for Mini PaaS

Comprehensive plan to address critical security vulnerabilities and add essential deployment features to the Mini PaaS platform.

## User Review Required

> [!WARNING]
> **Breaking Change - Environment Variables Required**  
> After implementing this plan, the application will **require** a `JWT_SECRET` environment variable to start. Users must create a `.env` file or set environment variables before running the server.

> [!IMPORTANT]
> **Rate Limiting Impact**  
> Rate limiting will be applied to login and registration endpoints. Users attempting too many login failures will be temporarily blocked (default: 5 attempts per 15 minutes). This may affect legitimate users with multiple failed login attempts.

> [!NOTE]
> **Git Deployment Dependencies**  
> Git deployment requires Git to be installed on the host system. The implementation will check for Git availability before attempting Git-based deployments.

## Proposed Changes

### Security: Environment Variables & Configuration

#### [NEW] [.env.example](file:///c:/dev/minipaas/.env.example)
Template file showing required environment variables for the application.
- `JWT_SECRET` - Secret key for JWT token signing (required)
- `PORT` - Server port (optional, defaults to 5050)
- `RATE_LIMIT_WINDOW` - Rate limit window in minutes (optional, defaults to 15)
- `RATE_LIMIT_MAX_ATTEMPTS` - Max attempts per window (optional, defaults to 5)

#### [MODIFY] [package.json](file:///c:/dev/minipaas/package.json)
Add new dependencies:
- `dotenv` - For loading environment variables
- `express-rate-limit` - For rate limiting endpoints
- `simple-git` - For Git-based deployments

#### [MODIFY] [server.js](file:///c:/dev/minipaas/server.js)
Updates across multiple sections:
1. **Lines 1-17**: Add `dotenv` import and load environment variables at the top
2. **Line 17**: Replace hardcoded `JWT_SECRET` with `process.env.JWT_SECRET` and add validation
3. **Lines 67-69**: Add rate limiter middleware configuration and apply to auth endpoints
4. **Lines 240-251**: Apply rate limiting to login and registration endpoints
5. **Lines 568-571, 607-608, 630**: Enhance path traversal protection with `path.normalize()` and additional validation

---

### Deployment: Git Support

#### [MODIFY] [server.js](file:///c:/dev/minipaas/server.js)
Updates to deployment endpoint (lines 410-470):
1. Add `simple-git` import
2. Modify `/api/apps` POST endpoint to support both ZIP and Git deployments
3. Add Git URL handling:
   - Validate Git URL
   - Clone repository to app directory
   - Support branch selection via query parameter
   - Handle Git authentication errors gracefully
4. Maintain backward compatibility with ZIP uploads

---

### Deployment: Version Control & Rollback System

#### [MODIFY] [data/apps.json](file:///c:/dev/minipaas/data/apps.json)
Extend app metadata structure:
- Add `versions` array to each app containing:
  - `versionId` - Unique version identifier (timestamp-based)
  - `deployDate` - Deployment timestamp
  - `deployMethod` - 'zip' or 'git'
  - `gitUrl` - Git repository URL (if applicable)
  - `gitBranch` - Git branch (if applicable)
  - `gitCommit` - Git commit hash (if applicable)
  - `path` - Path to version directory
- Add `currentVersion` field pointing to active version

#### [NEW] [apps/{appname}/versions/](file:///c:/dev/minipaas/apps/)
New directory structure for version storage:
```
apps/
  {appname}/
    current/          (symlink or copy of current version)
    versions/
      v{timestamp}/   (archived version)
      v{timestamp}/   (archived version)
```

#### [MODIFY] [server.js](file:///c:/dev/minipaas/server.js)
Add version management functionality:
1. **New function `createAppVersion()`**: Archives current deployment as a new version
2. **Modify deployment endpoint** (lines 410-470): Create version on each deployment
3. **Add GET `/api/apps/:name/versions`**: List all versions for an app
4. **Add POST `/api/apps/:name/rollback`**: Rollback to a specific version
   - Stop current version
   - Copy/link target version to current
   - Update app metadata
   - Restart app

---

### Monitoring: Health Checks

#### [MODIFY] [server.js](file:///c:/dev/minipaas/server.js)
Add health check system:
1. **Add GET `/health`**: Platform health endpoint
   - Returns server uptime
   - Database connection status
   - File system status
   - Total apps count

2. **Add GET `/api/apps/:name/health`**: Per-app health endpoint
   - Checks if process is running
   - Attempts HTTP request to app's port
   - Returns health status and response time

3. **Extend app metadata**: Add `health` field to track:
   - `status` - 'healthy', 'unhealthy', 'unknown'
   - `lastCheck` - Timestamp of last health check
   - `responseTime` - Response time in ms

4. **Add health check scheduler**: Background task checking all apps every 60 seconds
   - Updates health status in app metadata
   - Emits health status changes via Socket.IO

#### [MODIFY] [public/index.html](file:///c:/dev/minipaas/public/index.html) (Future Enhancement)
Add visual health indicators to the UI (documented for future implementation, not in this phase).

---

## Verification Plan

### Automated Tests

1. **Environment Variables**
   ```bash
   # Test without .env file - should fail gracefully
   Remove-Item .env -ErrorAction SilentlyContinue
   npm start
   # Expected: Error message about missing JWT_SECRET
   
   # Test with .env file - should start successfully
   Copy-Item .env.example .env
   # Edit .env to add JWT_SECRET=test-secret-key
   npm start
   # Expected: Server starts successfully
   ```

2. **Rate Limiting**
   ```bash
   # Test login rate limiting via PowerShell
   1..10 | ForEach-Object {
       Invoke-WebRequest -Uri "http://localhost:5050/api/auth/login" `
           -Method POST `
           -ContentType "application/json" `
           -Body '{"email":"test@test.com","password":"wrong"}'
   }
   # Expected: First 5 requests return 401, subsequent requests return 429 (Too Many Requests)
   ```

3. **Path Traversal Protection**
   ```bash
   # Attempt to access files outside app directory
   Invoke-WebRequest -Uri "http://localhost:5050/api/apps/testapp/files?path=../../server.js" `
       -Headers @{Authorization="Bearer YOUR_TOKEN"}
   # Expected: 403 Forbidden
   ```

4. **Git Deployment**
   ```bash
   # Deploy from Git repository
   Invoke-WebRequest -Uri "http://localhost:5050/api/apps" `
       -Method POST `
       -ContentType "application/json" `
       -Headers @{Authorization="Bearer YOUR_TOKEN"} `
       -Body '{"name":"git-test","gitUrl":"https://github.com/user/repo.git","branch":"main"}'
   # Expected: App deployed successfully from Git
   ```

5. **Version Control & Rollback**
   ```bash
   # Deploy version 1
   # Deploy version 2
   # List versions
   Invoke-WebRequest -Uri "http://localhost:5050/api/apps/testapp/versions" `
       -Headers @{Authorization="Bearer YOUR_TOKEN"}
   
   # Rollback to version 1
   Invoke-WebRequest -Uri "http://localhost:5050/api/apps/testapp/rollback" `
       -Method POST `
       -ContentType "application/json" `
       -Headers @{Authorization="Bearer YOUR_TOKEN"} `
       -Body '{"versionId":"v1234567890"}'
   # Expected: App rolled back to version 1
   ```

6. **Health Checks**
   ```bash
   # Check platform health
   Invoke-WebRequest -Uri "http://localhost:5050/health"
   # Expected: {"status":"healthy","uptime":123,"dbStatus":"connected",...}
   
   # Check app health
   Invoke-WebRequest -Uri "http://localhost:5050/api/apps/testapp/health" `
       -Headers @{Authorization="Bearer YOUR_TOKEN"}
   # Expected: {"status":"healthy","responseTime":45,...}
   ```

### Manual Verification

1. Verify `.env` file is created and documented
2. Confirm rate limiting prevents brute force attacks by attempting multiple failed logins
3. Test Git deployment with both public and private repositories
4. Deploy multiple versions of an app and verify rollback functionality
5. Monitor health check updates in real-time via the dashboard
6. Verify all features work correctly after server restart
