
const fs = require('fs');
const AdmZip = require('adm-zip');

const API_URL = 'http://localhost:5050/api';
const ADMIN_EMAIL = 'debug@example.com';
const ADMIN_PASSWORD = 'password123';

async function run() {
    try {
        // 1. Login
        console.log('Logging in...');
        const loginRes = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
        });

        if (!loginRes.ok) throw new Error(`Login failed: ${loginRes.statusText}`);
        const loginData = await loginRes.json();
        const token = loginData.token;
        console.log('Logged in.');

        // 2. Create ZIP
        const zip = new AdmZip();
        zip.addFile("package.json", Buffer.from(JSON.stringify({
            name: "test-deploy-app",
            version: "1.0.0",
            scripts: { start: "node server.js" }
        }, null, 2)));
        zip.addFile("server.js", Buffer.from("const http = require('http'); http.createServer((req, res) => res.end('Hello')).listen(process.env.PORT || 3000);"));

        const zipBuffer = zip.toBuffer();
        const blob = new Blob([zipBuffer], { type: 'application/zip' });

        // 3. Upload
        console.log('Uploading app...');
        const formData = new FormData();
        formData.append('name', 'test-deploy-app');
        formData.append('zipFile', blob, 'test-deploy-app.zip');

        const deployRes = await fetch(`${API_URL}/apps`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData
        });

        const deployData = await deployRes.json();
        console.log('Deploy Status:', deployRes.status);
        console.log('Deploy Response:', JSON.stringify(deployData, null, 2));

    } catch (e) {
        console.error('Error:', e);
    }
}

run();
