const { app, BrowserWindow, Menu, Tray, nativeImage, net, protocol, screen, session, ipcMain } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const isMac = process.platform === 'darwin';
const hideLabel = isMac ? '隐藏到菜单栏' : '隐藏到托盘';
const root = path.join(__dirname, '..', 'prototype');
const origin = 'cfs://app';
const preload = path.join(__dirname, 'preload.cjs');
let main, pet, tray, sizePanel, sizePanelReady, quitting = false, lastView = 'overview';
let pinned = true, scale = 100, drag, bubblesBelow = false, bubbleShift = 0;
let ignoresMouse;
let pointerOverPet = false;
const petWidth = 190;
const petHeight = 212;
const petInset = 8;

protocol.registerSchemesAsPrivileged([{ scheme: 'cfs', privileges: { standard: true, secure: true } }]);
if (process.platform === 'win32') app.setAppUserModelId('ComfortFromSalary.Desktop');

function petSize() {
  return { width: Math.ceil(274 * scale / 100), height: Math.ceil(424 * scale / 100) };
}

function clampRect(bounds, area) {
  const x = Math.max(area.x, Math.min(area.x + area.width - bounds.width, bounds.x));
  const y = Math.max(area.y, Math.min(area.y + area.height - bounds.height, bounds.y));
  return { ...bounds, x, y };
}

function petBody(bounds = pet.getContentBounds()) {
  const factor = scale / 100;
  const width = petWidth * factor;
  const height = petHeight * factor;
  return {
    width: Math.ceil(width), height: Math.ceil(height),
    x: Math.round(bounds.x + (bounds.width - width) / 2),
    y: Math.round(bounds.y + (bubblesBelow ? petInset : bounds.height - petInset - height)),
  };
}

function placePet(x, y, display) {
  const area = display.workArea;
  const size = petSize();
  const factor = scale / 100;
  const width = petWidth * factor;
  const height = petHeight * factor;
  const body = clampRect({ x: Math.round(x), y: Math.round(y), width: Math.ceil(width), height: Math.ceil(height) }, area);
  const above = body.y - area.y;
  const below = area.y + area.height - body.y - body.height;
  const nextBelow = above < size.height - height - petInset && below > above;
  const bubbleWidth = 230 * factor;
  const center = body.x + width / 2;
  const bubbleCenter = Math.max(area.x + bubbleWidth / 2, Math.min(area.x + area.width - bubbleWidth / 2, center));
  const nextShift = Math.round((bubbleCenter - center) / factor);
  const bounds = {
    ...size,
    x: Math.round(body.x - (size.width - width) / 2),
    y: Math.round(body.y - (nextBelow ? petInset : size.height - petInset - height)),
  };
  // Transparent padding may extend past an edge. Only the visible pet needs
  // to fit inside the display's work area, which excludes the taskbar.
  const current = pet.getBounds();
  if (Object.keys(bounds).some(key => bounds[key] !== current[key])) pet.setBounds(bounds);
  if (nextBelow !== bubblesBelow || nextShift !== bubbleShift) {
    bubblesBelow = nextBelow;
    bubbleShift = nextShift;
    pet.webContents.send('cfs:control', 'bubbles', { below: bubblesBelow, shift: bubbleShift });
  }
  updateMouseTarget();
}

function keepPetOnScreen() {
  const body = petBody();
  placePet(body.x, body.y, screen.getDisplayMatching(body));
}

function resetPetPosition() {
  const display = screen.getPrimaryDisplay();
  const area = display.workArea;
  const body = petBody();
  placePet(area.x + area.width - body.width - 24, area.y + area.height - body.height - 24, display);
}

function updateMouseTarget() {
  if (!pet?.isVisible()) return;
  const { x, y, width } = petBody();
  const cursor = screen.getCursorScreenPoint();
  const overPet = cursor.x >= x - 1 && cursor.x <= x + width &&
    cursor.y >= y - 1 && cursor.y <= y + petWidth * scale / 100;
  if (pointerOverPet !== overPet) {
    pointerOverPet = overPet;
    pet.webContents.send('cfs:control', 'hover', overPet);
  }
  const ignore = !drag && !overPet;
  if (ignore === ignoresMouse) return;
  ignoresMouse = ignore;
  pet.setIgnoreMouseEvents(ignore, { forward: true });
}

function resizePet(value) {
  if (!pet || !Number.isFinite(value)) return;
  const next = Math.max(50, Math.min(125, Math.round(value)));
  if (next === scale) return;
  const old = petBody();
  const display = screen.getDisplayMatching(old);
  scale = next;
  placePet(
    old.x + (old.width - petWidth * scale / 100) / 2,
    old.y + old.height - petHeight * scale / 100,
    display,
  );
}

function show(view = lastView) {
  lastView = view;
  if (view === 'pet') {
    main.hide();
    keepPetOnScreen();
    pet.showInactive();
    updateMouseTarget();
  } else {
    sizePanel?.hide();
    drag = undefined;
    pet.hide();
    main.webContents.send('cfs:control', 'page', view);
    main.show();
    main.focus();
  }
}

function hide() {
  drag = undefined;
  sizePanel?.hide();
  main.hide();
  pet.hide();
}

function togglePin(window) {
  const value = !window.isAlwaysOnTop();
  window.setAlwaysOnTop(value);
  if (window === pet) pinned = value;
  window.webContents.send('cfs:control', 'pin', value);
}

const actionTitles = {
  before: ['播放通勤小动作', 'commute'],
  working: ['播放砸桌小动作', 'working-animation'],
  lunch: ['播放吃饭小动作', 'lunch-animation'],
  after: ['播放翻身小动作', 'after-animation'],
  rest: ['播放落日合影', 'rest-animation'],
};

async function showSizePanel() {
  if (!sizePanel) {
    sizePanel = createWindow({
      width: 310, height: 126, resizable: false, skipTaskbar: true,
      alwaysOnTop: true, backgroundColor: '#f3f8fd',
    }, () => sizePanel.hide());
    sizePanelReady = sizePanel.loadURL(origin + '/index.html?desktop=size');
  }
  await sizePanelReady;
  if (!pet.isVisible()) return;
  const cursor = screen.getCursorScreenPoint();
  const bounds = sizePanel.getBounds();
  sizePanel.setBounds(clampRect({ ...bounds, x: cursor.x - bounds.width / 2, y: cursor.y - bounds.height - 12 }, screen.getDisplayNearestPoint(cursor).workArea));
  sizePanel.webContents.send('cfs:control', 'scale', scale);
  sizePanel.show();
  sizePanel.focus();
}

function openPetMenu(state) {
  const action = Object.hasOwn(actionTitles, state) ? actionTitles[state] : null;
  const template = [
    { label: '打开完整窗口', click: () => show('overview') },
    { label: '薪资与作息', click: () => show('settings') },
    { label: '置顶桌宠', type: 'checkbox', checked: pinned, click: () => togglePin(pet) },
    { label: '调整桌宠大小…', click: () => showSizePanel().catch(console.error) },
  ];
  if (action) template.splice(2, 0, {
    label: action[0],
    click: () => pet.webContents.send('cfs:control', 'play', action[1]),
  });
  template.push(
    { type: 'separator' },
    { label: hideLabel, click: hide },
    { label: '退出', click: () => app.quit() },
  );
  Menu.buildFromTemplate(template).popup({ window: pet });
}

function registerControls() {
  const senderWindow = event => BrowserWindow.fromWebContents(event.sender);
  ipcMain.on('cfs:command', (event, action) => {
    const source = senderWindow(event);
    if (source === sizePanel && action === 'close-size') {
      sizePanel.hide();
      return;
    }
    if (source !== main && source !== pet) return;
    if (action === 'overview' || action === 'settings' || action === 'pet') show(action);
    if (action === 'pin') togglePin(source);
    if (action === 'hide') hide();
  });
  ipcMain.on('cfs:menu', (event, state) => {
    if (senderWindow(event) === pet && typeof state === 'string') openPetMenu(state);
  });
  ipcMain.on('cfs:scale', (event, value) => {
    const source = senderWindow(event);
    if (source !== pet && source !== sizePanel) return;
    resizePet(value);
    if (source === sizePanel) pet.webContents.send('cfs:control', 'scale', scale);
  });
  ipcMain.on('cfs:drag', (event, phase) => {
    if (senderWindow(event) !== pet || !pet.isVisible()) return;
    const cursor = screen.getCursorScreenPoint();
    if (phase === 'start') {
      const body = petBody();
      drag = { x: cursor.x - body.x, y: cursor.y - body.y };
    } else if (phase === 'move' && drag) {
      placePet(cursor.x - drag.x, cursor.y - drag.y, screen.getDisplayNearestPoint(cursor));
    } else if (phase === 'end') {
      drag = undefined;
      keepPetOnScreen();
    }
    updateMouseTarget();
  });
}

function createWindow(options, onClose = hide) {
  const window = new BrowserWindow({
    show: false,
    frame: false,
    webPreferences: { preload, contextIsolation: true, sandbox: true, nodeIntegration: false },
    ...options,
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.on('close', event => {
    if (!quitting) {
      event.preventDefault();
      onClose();
    }
  });
  return window;
}

async function start() {
  protocol.handle('cfs', request => {
    const url = new URL(request.url);
    if (url.hostname !== 'app') return new Response(null, { status: 404 });
    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    const relative = path.relative(root, file);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      return new Response(null, { status: 404 });
    }
    return net.fetch(pathToFileURL(file).href);
  });
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_details, callback) => callback({ cancel: true }));
  Menu.setApplicationMenu(isMac ? Menu.buildFromTemplate([
    { role: 'appMenu' },
    { role: 'editMenu' },
  ]) : null);
  registerControls();

  const area = screen.getPrimaryDisplay().workArea;
  main = createWindow({
    width: Math.min(920, area.width), height: Math.min(680, area.height),
    minWidth: 480, minHeight: 420, backgroundColor: '#eef6fc',
  });
  const size = petSize();
  pet = createWindow({
    ...size,
    x: area.x + area.width - size.width - 24,
    y: area.y + area.height - size.height - 20,
    transparent: true, resizable: false, maximizable: false, skipTaskbar: true,
    hasShadow: false, alwaysOnTop: pinned, acceptFirstMouse: isMac,
  });
  pet.on('show', () => pet.webContents.send('cfs:control', 'visibility', true));
  pet.on('hide', () => {
    pointerOverPet = false;
    pet.webContents.send('cfs:control', 'visibility', false);
  });
  const icon = nativeImage.createFromPath(path.join(__dirname, 'tray.png'));
  tray = new Tray(isMac ? icon.resize({ width: 18, height: 18 }) : icon);
  tray.setToolTip('Comfort-From-Salary');
  if (!isMac) tray.on('click', () => show());
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开完整窗口', click: () => show('overview') },
    { label: '显示桌宠', click: () => show('pet') },
    { label: '重置桌宠位置', click: () => { resetPetPosition(); show('pet'); } },
    { label: hideLabel, click: hide },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() },
  ]));

  await Promise.all([
    main.loadURL(origin + '/index.html?desktop=main'),
    pet.loadURL(origin + '/index.html?desktop=pet'),
  ]);
  show('overview');
  if (isMac) app.on('activate', () => { if (!quitting) show(); });
  screen.on('display-removed', keepPetOnScreen);
  screen.on('display-metrics-changed', keepPetOnScreen);
  const pointerTimer = setInterval(updateMouseTarget, 32);
  app.once('will-quit', () => clearInterval(pointerTimer));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('before-quit', () => { quitting = true; });
  app.on('second-instance', () => { if (tray) show(); });
  app.whenReady().then(start).catch(error => {
    console.error(error);
    app.exit(1);
  });
}
