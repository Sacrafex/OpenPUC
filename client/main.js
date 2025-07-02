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
      console.log('Starting comprehensive update from GitHub...');
      
      // First, get the latest file structure from GitHub
      const repoStructure = await getRepoStructure();
      
      const baseUrl = 'https://raw.githubusercontent.com/Sacrafex/OpenPUC/main/';
      const backupDir = path.join(__dirname, 'backup');
      const clientDir = __dirname;
      const parentDir = path.dirname(__dirname);
      
      // Create backup directory
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      // Backup entire client directory
      await backupDirectory(clientDir, path.join(backupDir, 'client'));
      
      // Update/add files in client directory
      for (const file of repoStructure.client) {
        const url = baseUrl + 'client/' + file;
        const filePath = path.join(clientDir, file);
        
        // Create subdirectories if needed
        const fileDir = path.dirname(filePath);
        if (!fs.existsSync(fileDir)) {
          fs.mkdirSync(fileDir, { recursive: true });
        }
        
        console.log(`Downloading: client/${file}`);
        await downloadFile(url, filePath);
      }
      
      // Update/add files in parent directory (if any)
      for (const file of repoStructure.root) {
        const url = baseUrl + file;
        const filePath = path.join(parentDir, file);
        
        // Create subdirectories if needed
        const fileDir = path.dirname(filePath);
        if (!fs.existsSync(fileDir)) {
          fs.mkdirSync(fileDir, { recursive: true });
        }
        
        console.log(`Downloading: ${file}`);
        await downloadFile(url, filePath);
      }
      
      // Remove files that are no longer in the repository
      await cleanupOldFiles(clientDir, repoStructure.client, 'client');
      await cleanupOldFiles(parentDir, repoStructure.root, 'root');

      resolve();
    } catch (error) {
      console.error('Update failed, restoring backup:', error);
      // Restore backup on error
      await restoreBackup(backupDir, __dirname, path.dirname(__dirname));
      reject(error);
    }
  });
}

function getRepoStructure() {
  return new Promise((resolve, reject) => {
    // Get repository contents via GitHub API
    const options = {
      hostname: 'api.github.com',
      path: '/repos/Sacrafex/OpenPUC/contents',
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
      res.on('end', async () => {
        try {
          const rootContents = JSON.parse(data);
          const structure = {
            root: [],
            client: []
          };
          
          // Get root level files
          for (const item of rootContents) {
            if (item.type === 'file' && shouldUpdateFile(item.name)) {
              structure.root.push(item.name);
            }
          }
          
          // Get client directory contents
          const clientContents = await getDirectoryContents('client');
          structure.client = clientContents;
          
          resolve(structure);
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

function getDirectoryContents(dirPath) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/Sacrafex/OpenPUC/contents/${dirPath}`,
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
          const contents = JSON.parse(data);
          const files = [];
          
          for (const item of contents) {
            if (item.type === 'file' && shouldUpdateFile(item.name)) {
              files.push(item.name);
            }
          }
          
          resolve(files);
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

function shouldUpdateFile(filename) {
  const excludedFiles = [
    'backup',
    '.git',
    '.gitignore',
    'node_modules',
    '.DS_Store'
  ];
  
  return !excludedFiles.some(excluded => filename.includes(excluded));
}

function backupDirectory(sourceDir, backupDir) {
  return new Promise((resolve, reject) => {
    try {
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
      
      const items = fs.readdirSync(sourceDir);
      
      for (const item of items) {
        const sourcePath = path.join(sourceDir, item);
        const backupPath = path.join(backupDir, item);
        
        if (item === 'backup') continue; // Don't backup the backup folder
        
        const stat = fs.statSync(sourcePath);
        
        if (stat.isDirectory()) {
          fs.mkdirSync(backupPath, { recursive: true });
          // Recursively backup subdirectories (simplified for now)
          const subItems = fs.readdirSync(sourcePath);
          for (const subItem of subItems) {
            const subSourcePath = path.join(sourcePath, subItem);
            const subBackupPath = path.join(backupPath, subItem);
            if (fs.statSync(subSourcePath).isFile()) {
              fs.copyFileSync(subSourcePath, subBackupPath);
            }
          }
        } else {
          fs.copyFileSync(sourcePath, backupPath);
        }
      }
      
      resolve();
    } catch (error) {
      reject(error);
    }
  });
}

function cleanupOldFiles(targetDir, expectedFiles, dirType) {
  return new Promise((resolve, reject) => {
    try {
      if (!fs.existsSync(targetDir)) {
        resolve();
        return;
      }
      
      const currentFiles = fs.readdirSync(targetDir);
      
      for (const file of currentFiles) {
        const filePath = path.join(targetDir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isFile() && shouldUpdateFile(file)) {
          if (!expectedFiles.includes(file)) {
            console.log(`Removing obsolete file: ${dirType}/${file}`);
            fs.unlinkSync(filePath);
          }
        }
      }
      
      resolve();
    } catch (error) {
      reject(error);
    }
  });
}

function restoreBackup(backupDir, clientDir, parentDir) {
  return new Promise((resolve, reject) => {
    try {
      const clientBackupDir = path.join(backupDir, 'client');
      
      if (fs.existsSync(clientBackupDir)) {
        const files = fs.readdirSync(clientBackupDir);
        for (const file of files) {
          const backupPath = path.join(clientBackupDir, file);
          const targetPath = path.join(clientDir, file);
          
          if (fs.statSync(backupPath).isFile()) {
            fs.copyFileSync(backupPath, targetPath);
          }
        }
      }
      
      resolve();
    } catch (error) {
      reject(error);
    }
  });
}

app.on('ready', () => {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
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
      event.sender.send('update-status', { status: 'starting', message: 'Preparing update...' });
      
      event.sender.send('update-status', { status: 'downloading', message: 'Fetching repository structure...' });
      await updateFromGitHub();
      
      event.sender.send('update-status', { status: 'saving', message: 'Saving version information...' });
      const latestRelease = await checkForUpdates();
      setSetting('appVersion', latestRelease.version);
      
      event.sender.send('update-status', { status: 'complete', message: 'Update complete! Application has been updated with all latest files.' });
    } catch (error) {
      console.error('Error installing update:', error);
      event.sender.send('update-status', { status: 'error', message: `Update failed: ${error.message}. Backup restored.` });
    }
  });

  // Check for updates on startup
  setTimeout(() => {
    mainWindow.webContents.send('check-updates-on-startup');
  }, 2000);

  ipcMain.on('search-documentation', (event, query) => {
    if (!query || query.trim().length < 2) {
      event.sender.send('documentation-results', { error: 'Query too short' });
      return;
    }

    // Documentation sources
    const docSources = [
      {
        name: 'WPILib Documentation',
        url: `https://docs.wpilib.org/en/stable/search.html?q=${encodeURIComponent(query)}`,
        description: 'Official WPILib documentation and API reference'
      },
      {
        name: 'FRC Programming Done Right',
        url: `https://frc-pdr.readthedocs.io/en/latest/search.html?q=${encodeURIComponent(query)}`,
        description: 'Community-driven FRC programming guide'
      },
      {
        name: 'Chief Delphi',
        url: `https://www.chiefdelphi.com/search?q=${encodeURIComponent(query)}`,
        description: 'FRC community forum discussions'
      },
      {
        name: 'FRC Game Manual',
        url: `https://www.firstinspires.org/resource-library/frc/competition-manual-qa-system`,
        description: 'Official FRC game rules and manual'
      },
      {
        name: 'GitHub FRC Examples',
        url: `https://github.com/search?q=${encodeURIComponent(query)}+topic%3Afrc&type=repositories`,
        description: 'Example code repositories on GitHub'
      }
    ];

    event.sender.send('documentation-results', { results: docSources, query });
  });

  ipcMain.on('open-url', (event, url) => {
    require('electron').shell.openExternal(url);
  });

  ipcMain.on('get-built-in-docs', (event) => {
    try {
      const docsPath = path.join(__dirname, 'docs.json');
      if (fs.existsSync(docsPath)) {
        const docsData = fs.readFileSync(docsPath, 'utf8');
        const docs = JSON.parse(docsData);
        event.sender.send('built-in-docs-loaded', docs);
      } else {
        event.sender.send('built-in-docs-error', 'Documentation file not found');
      }
    } catch (error) {
      console.error('Error loading built-in docs:', error);
      event.sender.send('built-in-docs-error', error.message);
    }
  });
});
