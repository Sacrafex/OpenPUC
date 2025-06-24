const { app, BrowserWindow, ipcMain, Tray, dialog } = require('electron');
const WebSocket = require('ws');
const path = require('path');
const net = require('net');

let mainWindow;
let tray;
let ws;
let port;

function findAvailablePort(startPort, callback) {
  const server = net.createServer();
  server.listen(startPort, () => {
    port = startPort;
    server.close(() => callback(port));
  });
  server.on('error', () => {
    findAvailablePort(startPort + 1, callback);
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

  findAvailablePort(8080, (availablePort) => {
    port = availablePort;
    mainWindow.webContents.send('port-info', port);
  });

  ws = new WebSocket('ws://localhost:8080');

  ws.on('open', () => {
    console.log('Connected to Host');
    mainWindow.webContents.send('host-status', { connected: true, hostIP: ws._socket.remoteAddress });
  });

  ws.on('message', (message) => {
    console.log('Received:', message);
  });

  ws.on('close', () => {
    console.log('Disconnected from Host');
    mainWindow.webContents.send('host-status', { connected: false });
  });

  ws.on('error', (error) => {
    console.error('Error:', error);
  });

  ipcMain.on('select-folder', async (event) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    });
    if (!result.canceled && result.filePaths.length > 0) {
      event.sender.send('folder-selected', result.filePaths[0]);
    }
  });

  ipcMain.on('select-project', (event, projectPath) => {
    console.log(`Project selected: ${projectPath}`);
    ws.send(JSON.stringify({ type: 'project-selected', path: projectPath }));
  });

  ipcMain.on('grant-permission', (event, permission) => {
    console.log(`Permission granted: ${permission}`);
    ws.send(JSON.stringify({ type: 'permission-granted', permission }));
  });
});
