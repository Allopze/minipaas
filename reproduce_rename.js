
const API_URL = 'http://localhost:5050/api';
const ADMIN_EMAIL = 'admin@example.com'; // Change if needed
const ADMIN_PASSWORD = 'password123'; // Change if needed

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
        console.log('Logged in. Token obtained.');

        // 2. List Apps
        const appsRes = await fetch(`${API_URL}/apps`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const apps = await appsRes.json();
        console.log('Apps:', apps.map(a => a.name));

        if (apps.length === 0) {
            console.log('No apps to rename. Please deploy an app first.');
            return;
        }

        const targetApp = apps[0];
        const newName = targetApp.name + '-renamed';

        console.log(`Attempting to rename ${targetApp.name} to ${newName}...`);

        // 3. Rename
        const renameRes = await fetch(`${API_URL}/apps/${targetApp.name}/rename`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ newName: newName })
        });

        const renameData = await renameRes.json();
        console.log('Rename response:', renameData);

        if (!renameRes.ok) {
            console.error('Rename failed:', renameData);
            return;
        }

        // 4. Verify
        const appsRes2 = await fetch(`${API_URL}/apps`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const apps2 = await appsRes2.json();
        const renamedApp = apps2.find(a => a.name === newName);

        if (renamedApp) {
            console.log('SUCCESS: App renamed successfully.');
            // Rename back
            await fetch(`${API_URL}/apps/${newName}/rename`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ newName: targetApp.name })
            });
            console.log('Restored original name.');
        } else {
            console.error('FAILURE: Renamed app not found in list.');
        }

    } catch (e) {
        console.error('Error:', e);
    }
}

run();
