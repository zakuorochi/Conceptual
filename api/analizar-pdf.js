// api/analizar-pdf.js

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  try {
    const { pdfBase64, fileName } = req.body;
    
    if (!pdfBase64) {
      return res.status(400).json({ error: 'No se envió ningún archivo PDF' });
    }

    const systemPrompt = `You are a senior academic thesis evaluator and thesis advisor specializing in research methodology. 
Your task is NOT to write a simple summary, but to perform a deep CRITICAL KNOWLEDGE SYNTHESIS of the provided thesis manuscript.
Extract, evaluate, and synthesize the essential core knowledge for each of the 10 structural components requested.

CRITICAL INSTRUCTIONS:
- You must output strictly valid JSON.
- Do not invent information. If a section is missing in the paper, explicitly state "Sección no identificada en el manuscrito."
- Your output must be written in high-level, constructive, and rigorous Spanish so the evaluator can use it directly in feedback.
- Format each component as clean text (you can use basic markdown like bullet points).
- The JSON must contain exactly these 10 keys: introduccion, problema, realidadProblematica, marcoTeorico, metodologia, resultados, analisis, discusion, conclusiones, recomendaciones.`;

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) throw new Error("API Key no configurada");

    // NOTA: Si el modelo 3.5-flash-lite te da error 404, usa gemini-1.5-flash que es la versión de producción actual
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;

    const geminiPayload = {
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
      contents: [
        {
          role: "user",
          parts: [
            // LA MAGIA OCURRE AQUÍ: Enviamos el PDF completo como archivo nativo
            {
              inlineData: {
                mimeType: "application/pdf",
                data: pdfBase64
              }
            },
            { 
              text: `Analiza el documento adjunto y genera el JSON con las 10 secciones solicitadas.` 
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json"
      }
    };

    const apiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiPayload)
    });

    const responseData = await apiResponse.json();

    if (!apiResponse.ok) {
      console.error("Gemini Error:", responseData);
      return res.status(apiResponse.status).json({ error: "Error en Gemini", details: responseData });
    }

    const outputText = responseData.candidates[0].content.parts[0].text;
    
    // Limpieza de seguridad
    const cleanJsonString = outputText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsedAnalysis = JSON.parse(cleanJsonString);

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
