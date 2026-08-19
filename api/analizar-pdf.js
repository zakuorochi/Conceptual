// api/analizar-pdf.js
const pdfParse = require('pdf-parse');

// OPCIONAL: Solo funciona si pasas tu cuenta de Vercel a Pro (extiende el límite de 10s a 60s)
// export const maxDuration = 60; 

module.exports = async (req, res) => {
  // 1. Manejo estricto de CORS para permitir que tu frontend HTML se comunique
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  try {
    const { pdfBase64, fileName } = req.body;
    
    // Defensa contra payloads vacíos
    if (!pdfBase64) {
      return res.status(400).json({ error: 'No se envió ningún archivo PDF en la petición' });
    }

    // 2. Extraer el texto del PDF
    const buffer = Buffer.from(pdfBase64, 'base64');
    const pdfData = await pdfParse(buffer);
    
    // Limitamos los caracteres extraídos para asegurar velocidad y evitar el timeout de Vercel Hobby (10s)
    const textContent = pdfData.text.slice(0, 80000); 

    // 3. System Prompt (Instrucciones de personalidad y formato)
    const systemPrompt = `You are a senior academic thesis evaluator and thesis advisor specializing in research methodology. 
Your task is NOT to write a simple summary, but to perform a deep CRITICAL KNOWLEDGE SYNTHESIS of the provided thesis manuscript.
Extract, evaluate, and synthesize the essential core knowledge for each of the 10 structural components requested.

CRITICAL INSTRUCTIONS:
- You must output strictly valid JSON.
- Do not invent information. If a section is missing in the paper, explicitly state "Sección no identificada en el manuscrito."
- Your output must be written in high-level, constructive, and rigorous Spanish so the evaluator can use it directly in feedback.
- Format each component as clean text (you can use basic markdown like bullet points).
- The JSON must contain exactly these 10 keys: introduccion, problema, realidadProblematica, marcoTeorico, metodologia, resultados, analisis, discusion, conclusiones, recomendaciones.`;

    // 4. Configurar la llamada a la API de Gemini 3.5 Flash-Lite
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    
    if (!GEMINI_API_KEY) {
      throw new Error("La variable de entorno GEMINI_API_KEY no está configurada en Vercel.");
    }

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;

    const geminiPayload = {
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
      contents: [
        {
          role: "user",
          parts: [{ text: `Analiza el siguiente texto de la tesis y genera el JSON con las 10 secciones:\n\nCONTENIDO DEL DOCUMENTO:\n${textContent}` }]
        }
      ],
      generationConfig: {
        temperature: 0.1, // Baja temperatura para máximo rigor académico
        responseMimeType: "application/json" // Fuerza a Gemini a devolver solo un JSON puro
      }
    };

    // 5. Ejecutar la petición HTTP a Google
    const apiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(geminiPayload)
    });

    const responseData = await apiResponse.json();

    if (!apiResponse.ok) {
      console.error("Gemini API Error:", responseData);
      return res.status(apiResponse.status).json({ error: "Error en la API de Gemini", details: responseData });
    }

    // 6. Limpiar y parsear la respuesta de Gemini
    const outputText = responseData.candidates[0].content.parts[0].text;
    let parsedAnalysis;

    try {
      // Al usar responseMimeType: "application/json", el texto ya debería ser un JSON válido, 
      // pero agregamos una limpieza de seguridad por si envuelve la respuesta en Markdown
      const cleanJsonString = outputText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsedAnalysis = JSON.parse(cleanJsonString);
    } catch (parseError) {
      console.error("Error parseando el JSON de Gemini:", outputText);
      throw new Error("El modelo generó un formato inválido que no pudo ser convertido a JSON.");
    }

    // 7. Enviar la respuesta exitosa al frontend
    return res.status(200).json({
      success: true,
      fileName: fileName,
      analysis: parsedAnalysis
    });

  } catch (err) {
    console.error("Error del servidor local:", err.message);
    return res.status(500).json({ error: "Fallo al procesar el PDF", details: err.message });
  }
};
