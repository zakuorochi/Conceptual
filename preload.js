const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  analizarTesis: (datosPdf) => ipcRenderer.invoke('analizar-tesis', datosPdf)
});
