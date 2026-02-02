const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("rtcaptions", {
  send: (channel, data) => {
    const validChannels = [
      "open-float",
      "close-float",
      "update-float-data",
      "window-minimize",
      "window-maximize",
      "window-close",
    ];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },
  on: (channel, func) => {
    const validChannels = ["float-data-updated", "float-window-closed"];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    }
  },
  getDesktopSources: () => ipcRenderer.invoke("get-desktop-sources"),
});
