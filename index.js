const {
	app,
	BrowserWindow,
	dialog,
	Menu,
	shell,
	ipcMain,
} = require('electron');
const windowStateKeeper = require('electron-window-state');
const {
	hasScreenCapturePermission,
	openSystemPreferences,
} = require('mac-screen-capture-permissions');
const { autoUpdater } = require('electron-updater');
const fs = require('fs');
const path = require('path');

// https://discuss.atom.io/t/how-to-catch-the-event-of-clicking-the-app-windows-close-button-in-electron-app/21425
let win;
let willQuitApp;

// Create window
function createWindow() {
	// Window state
	let mainWindowState = windowStateKeeper({
		defaultWidth: 1000,
		defaultHeight: 800,
	});

	// Create the browser window.
	win = new BrowserWindow({
		icon: path.join(__dirname, 'icon.icns'),
		x: mainWindowState.x,
		y: mainWindowState.y,
		width: mainWindowState.width,
		height: mainWindowState.height,
		minWidth: 350,
		minHeight: 100,
		titleBarStyle: 'hiddenInset',
		// hide until ready
		show: false,
		// Enables DRM
		webPreferences: {
			plugins: true,
			nodeIntegration: false,
			contextIsolation: false,
			sandbox: true,
		},
	});

	// Load the preloads scripts
	win.webContents.session.setPreloads([
		path.join(__dirname, 'preload-badge-count.js'),
		path.join(__dirname, 'preload-get-display-media-polyfill.js'),
	]);

	// Bypass browser permission checks
	win.webContents.session.setPermissionCheckHandler(async () => {
		return true;
	});

	win.webContents.session.setPermissionRequestHandler(
		async (webContents, permission, callback) => {
			callback(true);
		}
	);

	// Let us register listeners on the window, so we can update the state
	// automatically (the listeners will be removed when the window is closed)
	// and restore the maximized or full screen state
	mainWindowState.manage(win);
	// hides toolbar
	win.setMenuBarVisibility(false);
	// allows you to open toolbar by pressing alt
	win.setAutoHideMenuBar(true);

	win.loadURL('https://discord.com/app', {
		userAgent:
			'Mozilla/5.0 (Macintosh; Intel Mac OS X 11_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/95.0.4638.54 Safari/537.36',
	});

	// Inject custom JavaScript into Discord
	injectJavascript();

	win.webContents.setWindowOpenHandler(({ url }) => {
		shell.openExternal(url);

		return {
			action: 'deny',
		};
	});

	// shows when ready
	win.once('ready-to-show', () => {
		win.show();
	});

	// Mirror behaviour of real app by only hiding the window
	win.on('close', (e) => {
		if (willQuitApp) {
			/* the user tried to quit the app */
			win = null;
		} else {
			/* the user only tried to close the window */
			e.preventDefault();
			win.hide();
		}
	});
}

let checkedForUpdate = false;

autoUpdater.on('update-downloaded', ({ version }) => {
	if (checkedForUpdate) return;
	checkedForUpdate = true;

	setTimeout(() => {
		// Remind in 24 hours
		checkedForUpdate = false;
	}, 24 * 60 * 60 * 1000);

	dialog
		.showMessageBox(win, {
			type: 'info',
			buttons: ['Yes', 'Later'],
			defaultId: 0,
			cancelId: 1,
			title: 'Update available',
			detail: `A new version of Discord-M1 has been downloaded, would you like to install it now?\n\nCurrent version: ${app.getVersion()}\nLatest version: ${version}`,
		})
		.then(({ response }) => {
			if (response === 0) {
				willQuitApp = true;
				autoUpdater.quitAndInstall();
			}
		});
});

app.whenReady().then(() => {
	setAppMenu();
	autoUpdater.checkForUpdates();

	setInterval(() => {
		if (checkedForUpdate) return;

		autoUpdater.checkForUpdates();
	}, 60 * 60 * 1000);

	createWindow();
});

// Show the window again once user clicks on dock icon
app.on('activate', () => {
	win.show();
});

/* 'before-quit' is emitted when Electron receives
  the signal to exit and wants to start closing windows */
app.on('before-quit', () => (willQuitApp = true));

ipcMain.on('checkScreenPermission', async () => {
	if (!hasScreenCapturePermission()) {
		await openSystemPreferences();
	}
});

ipcMain.on('updateBadgeCount', (e, args) => {
	app.dock.setBadge(String(args.count));
});

function onAppReload() {
	win.reload();
	injectJavascript();
	console.log('Done reloading and injecting again!');
}

function injectJavascript() {
	const filesToInject = [
		'discord-badge-count.js',
		'discord-context-menu.js',
		'discord-platform-osx.js',
		'discord-downloadapps-icon.js',
	];

	filesToInject.forEach((file) => {
		let injectFilePath = path.join(process.resourcesPath, file);

		if (!fs.existsSync(injectFilePath)) injectFilePath = `./${file}`;

		fs.readFile(injectFilePath, 'utf-8', (_, data) => {
			win.webContents.executeJavaScript(data);
		});
	});
}

function setAppMenu() {
	const menuTemplate = [
		{
			label: 'Discord',
			submenu: [
				{
					role: 'about'
				},
				{
					type: 'separator'
				},
				{
					role: 'services',
					submenu: []
				},
				{
					type: 'separator'
				},
				{
					role: 'hide'
				},
				{
					role: 'hideothers'
				},
				{
					role: 'unhide'
				},
				{
					type: 'separator'
				},
				{
					label: 'Reload Discord',
					accelerator: 'CommandOrControl+R',
					click: onAppReload,
				},

				{
					label: 'Force-reload Discord',
					accelerator: 'CommandOrControl+Shift+R',
					click: onAppReload,
				},
				{
					role: 'quit'
				}
			]
		},
		{
			label: 'Edit',
			submenu: [
				{
					role: 'undo'
				},
				{
					role: 'redo'
				},
				{
					type: 'separator'
				},
				{
					role: 'cut'
				},
				{
					role: 'copy'
				},
				{
					role: 'paste'
				},
				{
					role: 'pasteandmatchstyle'
				},
				{
					role: 'delete'
				},
				{
					role: 'selectall'
				}
			]
		},
		{
			label: 'View',
			submenu: [
				{
					role: 'toggledevtools'
				},
				{
					type: 'separator'
				},
				{
					role: 'resetzoom'
				},
				{
					role: 'zoomin'
				},
				{
					role: 'zoomout'
				},
				{
					type: 'separator'
				},
				{
					role: 'togglefullscreen'
				}
			]
		},
		{
			role: 'window',
			submenu: [
				{
					role: 'minimize'
				},
				{
					role: 'close'
				}
			]
		},
		{
			role: 'help',
			submenu: [
				{
					label: 'Learn More',
					click () {
						shell.openExternal('https://electron.atom.io');
					}
				},
				{
					label: 'Documentation',
					click () {
						shell.openExternal(
							`https://github.com/electron/electron/tree/v${process.versions.electron}/docs#readme`
						);
					}
				},
				{
					label: 'Community Discussions',
					click () {
						shell.openExternal('https://discuss.atom.io/c/electron');
					}
				},
				{
					label: 'Search Issues',
					click () {
						shell.openExternal('https://github.com/electron/electron/issues');
					}
				}
			]
		}
	];
	
	Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));
}
