const { app, BrowserWindow, ipcMain, Tray, dialog } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const https = require('https');

let mainWindow;
let tray;

// Storage file path
const userDataPath = app.getPath('userData');
const settingsPath = path.join(userDataPath, 'settings.json');

// Storage functions
function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading settings:', error);
  }
  return {};
}

function saveSettings(settings) {
  try {
    // Ensure the directory exists
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving settings:', error);
    return false;
  }
}

function getSetting(key, defaultValue = null) {
  const settings = loadSettings();
  return settings[key] !== undefined ? settings[key] : defaultValue;
}

function setSetting(key, value) {
  const settings = loadSettings();
  settings[key] = value;
  return saveSettings(settings);
}

// GitHub updater functions
function checkForUpdates() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: '/repos/Sacrafex/OpenPUC/releases/latest',
      method: 'GET',
      headers: {
        'User-Agent': 'OpenPUC-Client'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const release = JSON.parse(data);
          resolve({
            version: release.tag_name,
            url: release.html_url,
            publishedAt: release.published_at,
            body: release.body
          });
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
}

function downloadFile(url, filePath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filePath);
    const request = https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Handle redirect
        return downloadFile(response.headers.location, filePath).then(resolve).catch(reject);
      }
      
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    });

    request.on('error', (error) => {
      fs.unlink(filePath, () => {}); // Delete the file on error
      reject(error);
    });
  });
}

function updateFromGitHub() {
  return new Promise(async (resolve, reject) => {
    try {
      const filesToUpdate = [
        'main.js',
        'index.html',
        'package.json'
      ];

      const baseUrl = 'https://raw.githubusercontent.com/Sacrafex/OpenPUC/main/client/';
      const backupDir = path.join(__dirname, 'backup');
      
      // Create backup directory
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir);
      }

      // Backup current files
      for (const file of filesToUpdate) {
        const currentPath = path.join(__dirname, file);
        const backupPath = path.join(backupDir, file);
        if (fs.existsSync(currentPath)) {
          fs.copyFileSync(currentPath, backupPath);
        }
      }

      // Download new files
      for (const file of filesToUpdate) {
        const url = baseUrl + file;
        const filePath = path.join(__dirname, file);
        await downloadFile(url, filePath);
      }

      resolve();
    } catch (error) {
      // Restore backup on error
      const backupDir = path.join(__dirname, 'backup');
      const filesToRestore = ['main.js', 'index.html', 'package.json'];
      
      for (const file of filesToRestore) {
        const backupPath = path.join(backupDir, file);
        const currentPath = path.join(__dirname, file);
        if (fs.existsSync(backupPath)) {
          fs.copyFileSync(backupPath, currentPath);
        }
      }
      
      reject(error);
    }
  });
}

app.on('ready', () => {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    icon: path.join(__dirname, 'icon.png')
  });

  mainWindow.loadFile('index.html');

  mainWindow.on('minimize', (event) => {
    event.preventDefault();
    mainWindow.hide();
  });

  tray = new Tray(path.join(__dirname, 'icon.png'));
  tray.setToolTip('Client App');
  tray.on('click', () => {
    mainWindow.show();
  });

  ipcMain.on('select-folder', async (event) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    });
    if (!result.canceled && result.filePaths.length > 0) {
      event.sender.send('folder-selected', result.filePaths[0]);
    }
  });

  ipcMain.on('ping-roborio', (event, teamNumber) => {
    if (!teamNumber) {
      event.sender.send('roborio-status', { connected: false, error: 'No team number provided' });
      return;
    }
    
    // Multiple possible roboRIO addresses
    const addresses = [
      `roboRIO-${teamNumber}-FRC.local`,
      `10.${Math.floor(teamNumber / 100)}.${teamNumber % 100}.2`, // Static IP format
      `172.22.11.2`, // USB connection
      `roborio-${teamNumber}-frc.local` // Alternative mDNS format
    ];
    
    let attemptCount = 0;
    
    function tryNextAddress() {
      if (attemptCount >= addresses.length) {
        event.sender.send('roborio-status', { 
          connected: false, 
          error: `Unable to reach roboRIO. Tried: ${addresses.join(', ')}` 
        });
        return;
      }
      
      const address = addresses[attemptCount];
      const pingCommand = process.platform === 'win32' ? `ping -n 1 -w 3000 ${address}` : `ping -c 1 -W 3 ${address}`;
      
      console.log(`Attempting to ping ${address} (attempt ${attemptCount + 1}/${addresses.length})`);
      
      exec(pingCommand, (error, stdout, stderr) => {
        if (error) {
          console.log(`Ping failed for ${address}: ${error.message}`);
          attemptCount++;
          tryNextAddress();
        } else {
          console.log(`Ping successful to ${address}`);
          event.sender.send('roborio-status', { connected: true, address: address });
        }
      });
    }
    
    tryNextAddress();
  });

  ipcMain.on('save-team-number', (event, teamNumber) => {
    const success = setSetting('teamNumber', teamNumber);
    if (success) {
      console.log(`Team number saved: ${teamNumber}`);
      event.sender.send('setting-saved', { key: 'teamNumber', success: true });
    } else {
      console.error('Failed to save team number');
      event.sender.send('setting-saved', { key: 'teamNumber', success: false, error: 'Failed to save to disk' });
    }
  });

  ipcMain.on('get-setting', (event, key) => {
    const value = getSetting(key);
    event.sender.send('setting-value', { key, value });
  });

  ipcMain.on('get-all-settings', (event) => {
    const settings = loadSettings();
    event.sender.send('all-settings', settings);
  });

  ipcMain.on('save-setting', (event, { key, value }) => {
    const success = setSetting(key, value);
    event.sender.send('setting-saved', { key, success });
  });

  ipcMain.on('check-for-updates', async (event) => {
    try {
      const latestRelease = await checkForUpdates();
      const currentVersion = getSetting('appVersion', '1.0.0');
      
      if (latestRelease.version !== currentVersion) {
        event.sender.send('update-available', {
          currentVersion,
          latestVersion: latestRelease.version,
          releaseInfo: latestRelease
        });
      } else {
        event.sender.send('no-updates-available', { currentVersion });
      }
    } catch (error) {
      console.error('Error checking for updates:', error);
      event.sender.send('update-check-error', { error: error.message });
    }
  });

  ipcMain.on('install-update', async (event) => {
    try {
      event.sender.send('update-status', { status: 'downloading', message: 'Downloading update...' });
      
      await updateFromGitHub();
      
      const latestRelease = await checkForUpdates();
      setSetting('appVersion', latestRelease.version);
      
      event.sender.send('update-status', { status: 'complete', message: 'Update complete! Please restart the application.' });
    } catch (error) {
      console.error('Error installing update:', error);
      event.sender.send('update-status', { status: 'error', message: `Update failed: ${error.message}` });
    }
  });

  // Check for updates on startup
  setTimeout(() => {
    mainWindow.webContents.send('check-updates-on-startup');
  }, 2000);

  ipcMain.on('restart-app', () => {
    app.relaunch();
    app.exit();
  });
});
