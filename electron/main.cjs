const {
  app,
  BrowserWindow,
  globalShortcut,
  session,
  desktopCapturer,
  ipcMain,
  screen,
  powerSaveBlocker,
} = require("electron");
const path = require("path");
const { spawn, exec } = require("child_process");
const fs = require("fs");

const devServerUrl = process.env.VITE_DEV_SERVER_URL || "http://localhost:5173";
let backendProcess = null;
let mainWindow = null;
let floatWindow = null;

function killBackend() {
  if (backendProcess) {
    if (process.platform === "win32") {
      exec(`taskkill /pid ${backendProcess.pid} /T /F`);
    } else {
      backendProcess.kill();
    }
    backendProcess = null;
  }
}

function startBackend() {
  const isDev = !app.isPackaged;
  let backendPath;
  let cwd;

  if (isDev) {
    // 开发环境下使用 go run
    backendPath = "go";
    const args = ["run", "./cmd/server/main.go"];
    cwd = path.join(__dirname, "..", "..", "backend");

    console.log("Starting backend in dev mode...");
    backendProcess = spawn(backendPath, args, {
      cwd,
      env: { ...process.env, GIN_MODE: "debug" },
      shell: true,
    });
  } else {
    // 生产环境下运行编译好的二进制文件
    // 假设二进制文件被打包在 resources 目录下
    backendPath = path.join(process.resourcesPath, "server.exe");
    cwd = process.resourcesPath;

    backendProcess = spawn(backendPath, [], {
      cwd,
      env: process.env,
    });
  }

  const logFile = path.join(__dirname, "backend.log");
  fs.writeFileSync(
    logFile,
    `Starting backend at ${new Date().toISOString()}\n`,
  );

  backendProcess.stdout.on("data", (data) => {
    console.log(`Backend: ${data}`);
    fs.appendFileSync(logFile, `[STDOUT] ${data}`);
  });

  backendProcess.stderr.on("data", (data) => {
    console.error(`Backend Error: ${data}`);
    fs.appendFileSync(logFile, `[STDERR] ${data}`);
  });

  backendProcess.on("close", (code) => {
    console.log(`Backend process exited with code ${code}`);
    fs.appendFileSync(logFile, `[EXIT] Code ${code}\n`);
    backendProcess = null;
  });
}

function createWindow() {
  // 创建浏览器窗口
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1200,
    minHeight: 800,
    useContentSize: true,
    frame: false, // 无边框窗口，使用自定义标题栏
    titleBarStyle: "hidden", // macOS 隐藏标题栏
    resizable: true, // 允许调整大小
    movable: true, // 允许移动
    alwaysOnTop: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true, // 启用上下文隔离
      nodeIntegration: false, // 禁用 Node.js 集成以提高安全性
      backgroundThrottling: true, // 禁用后台节流，确保最小化时音频采集不中断
      preload: path.join(__dirname, "preload.cjs"), // 预加载脚本
      devTools: !app.isPackaged, // 生产环境下彻底禁用开发者工具
    },
  });

  mainWindow.setMenu(null);

  // 设置显示媒体请求处理器，允许 getDisplayMedia 工作
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer
      .getSources({ types: ["screen", "window"] })
      .then((sources) => {
        // 默认选择第一个屏幕并允许音频采集
        if (sources.length > 0) {
          callback({ video: sources[0], audio: "loopback" });
        } else {
          callback(null);
        }
      });
  });

  // 默认开启控制台以方便调试
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  // 注册全局快捷键
  mainWindow.on("focus", () => {
    const isDev = !app.isPackaged;

    // 只有开发模式下允许 F12 和 Ctrl+Shift+I
    if (isDev) {
      globalShortcut.register("F12", () => {
        mainWindow.webContents.toggleDevTools();
      });
      globalShortcut.register("CommandOrControl+Shift+I", () => {
        mainWindow.webContents.toggleDevTools();
      });
    }

    // F5: 重新加载页面
    globalShortcut.register("F5", () => {
      mainWindow.webContents.reload();
    });
    // Ctrl+R: 重新加载页面
    globalShortcut.register("CommandOrControl+R", () => {
      mainWindow.webContents.reload();
    });
  });

  // 窗口失去焦点时注销快捷键，避免干扰其他应用
  mainWindow.on("blur", () => {
    globalShortcut.unregisterAll();
  });

  if (process.env.ELECTRON_START_URL) {
    mainWindow.loadURL(process.env.ELECTRON_START_URL);
  } else {
    // 优先尝试加载本地开发服务器
    mainWindow.loadURL(devServerUrl).catch(() => {
      mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
    });
  }
}

function createFloatWindow() {
  if (floatWindow) {
    floatWindow.focus();
    return;
  }

  floatWindow = new BrowserWindow({
    width: 800,
    height: 150,
    frame: false, // 恢复无边框
    transparent: true, // 恢复透明
    alwaysOnTop: true,
    skipTaskbar: true, // 恢复隐藏任务栏图标
    show: false, // 改回 false，配合 ready-to-show
    backgroundColor: "#00000000",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false, // 悬浮窗也禁用节流
      preload: path.join(__dirname, "preload.cjs"),
      devTools: !app.isPackaged, // 生产环境下彻底禁用开发者工具
    },
  });

  // 默认显示在屏幕底部居中
  const { x, y, width, height } = screen.getPrimaryDisplay().workArea;
  const [winWidth, winHeight] = floatWindow.getSize();
  const newX = x + Math.round((width - winWidth) / 2);
  const newY = y + height - winHeight; // 距离底部 50px
  floatWindow.setPosition(newX, newY);

  floatWindow.once("ready-to-show", () => {
    floatWindow.show();
  });

  const url = process.env.ELECTRON_START_URL
    ? `${process.env.ELECTRON_START_URL}?mode=float`
    : `${devServerUrl}?mode=float`;

  floatWindow.loadURL(url).catch((err) => {
    floatWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"), {
      query: { mode: "float" },
    });
  });

  floatWindow.on("closed", () => {
    floatWindow = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("float-window-closed");
    }
  });
}

ipcMain.on("open-float", () => {
  createFloatWindow();
});

ipcMain.on("close-float", () => {
  if (floatWindow) {
    floatWindow.close();
  }
});

// 窗口控制 IPC 处理
ipcMain.on("window-minimize", () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on("window-maximize", () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on("window-close", () => {
  if (mainWindow) mainWindow.close();
});

// 获取桌面源列表
ipcMain.handle("get-desktop-sources", async () => {
  const sources = await desktopCapturer.getSources({
    types: ["window", "screen"],
    thumbnailSize: { width: 300, height: 300 },
  });
  return sources.map((source) => ({
    id: source.id,
    name: source.name,
    thumbnail: source.thumbnail.toDataURL(),
    type: source.id.startsWith("screen") ? "screen" : "window",
  }));
});

let lastPositionMode = null;

ipcMain.on("update-float-data", (event, data) => {
  // console.log('Main process received update-float-data')
  if (floatWindow) {
    floatWindow.webContents.send("float-data-updated", data);

    // 处理自动定位逻辑
    if (data.settings && data.settings.positionMode) {
      const { positionMode } = data.settings;

      // 只有当位置模式发生变化时，才重新定位
      // 这样可以允许用户在当前模式下自由拖拽，而不会被每秒多次的 ASR 更新重置位置
      if (positionMode !== lastPositionMode) {
        const primaryDisplay = screen.getPrimaryDisplay();
        const {
          x: workX,
          y: workY,
          width: workW,
          height: workH,
        } = primaryDisplay.workArea;

        const winBounds = floatWindow.getBounds();
        // 计算居中的 X 坐标 (相对于工作区)
        let x = workX + Math.floor((workW - winBounds.width) / 2);
        let y = winBounds.y;

        if (positionMode === "bottom") {
          y = workY + workH - winBounds.height - 40;
        } else if (positionMode === "top") {
          y = workY + 40;
        }

        floatWindow.setPosition(x, y);
        lastPositionMode = positionMode;
      }
    }
  }
});

// 强制禁用后台限流
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");

app.whenReady().then(() => {
  // 阻止系统进入休眠，确保后台任务持续运行
  powerSaveBlocker.start("prevent-app-suspension");

  if (process.env.AUTO_START_BACKEND === "1") {
    startBackend();
  }
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  killBackend();
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  killBackend();
});
