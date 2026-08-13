// main.js
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const pdfParse = require('pdf-parse');
const crypto = require('crypto');

function createWindow () {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Carga tu diseño de interfaz
  mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// === AQUÍ VIVE LA LÓGICA QUE ANTES ESTABA EN VERCEL ===
ipcMain.handle('analizar-tesis', async (event, { pdfBase64, fileName }) => {
  try {
    const buffer = Buffer.from(pdfBase64, 'base64');
    const pdfData = await pdfParse(buffer);
    const textContent = pdfData.text.slice(0, 80000); // Puedes procesar más texto porque no hay límite de tiempo

    const systemPrompt = `You are a senior academic thesis evaluator... (TU PROMPT AQUÍ)`;
    
    // (Mismo JSON schema que ya tenías)
    const jsonSchema = { /* ... */ };

    const runwarePayload = [
      {
        taskType: "textInference",
        taskUUID: crypto.randomUUID(),
        model: "moonshotai:kimi@k2.6",
        outputFormat: "JSON",
        jsonSchema: jsonSchema,
        settings: {
          systemPrompt: systemPrompt,
          temperature: 0.1,
          maxTokens: 4000,
          thinkingLevel: "medium", // Ahora sí puedes usar medium porque no hay Vercel que te corte
          promptCacheKey: "thesis-evaluation-v1"
        },
        messages: [{ role: "user", content: textContent }]
      }
    ];

    // IMPORTANTE: Aquí pones tu clave directamente
    const RUNWARE_API_KEY = "TU_CLAVE_DE_RUNWARE_AQUI"; 

    const apiResponse = await fetch("https://api.runware.ai/v1", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RUNWARE_API_KEY}`
      },
      body: JSON.stringify(runwarePayload)
    });

    const responseData = await apiResponse.json();
    const outputText = responseData.data[0].content || responseData.data[0].text;
    
    let parsedAnalysis;
    if (typeof outputText === 'string') {
      const cleanJsonString = outputText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsedAnalysis = JSON.parse(cleanJsonString);
    } else {
      parsedAnalysis = outputText;
    }

    return { success: true, analysis: parsedAnalysis };

  } catch (error) {
    console.error("Error local:", error);
    return { success: false, error: error.message };
  }
});
