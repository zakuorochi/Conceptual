// api/analizar-pdf.js
const pdfParse = require('pdf-parse');
const crypto = require('crypto');

module.exports = async (req, res) => {
  // Manejo de CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // 1. Extraer el texto del PDF
    const { pdfBase64, fileName } = req.body;
    if (!pdfBase64) return res.status(400).json({ error: 'No PDF file provided' });

    const buffer = Buffer.from(pdfBase64, 'base64');
    const pdfData = await pdfParse(buffer);
    const textContent = pdfData.text.slice(0, 100000); // Límite de seguridad de texto

    // 2. Definir el System Prompt riguroso en Inglés (Academic Knowledge Synthesizer)
    const systemPrompt = `You are a senior academic thesis evaluator and thesis advisor specializing in research methodology. 
Your task is NOT to write a simple summary, but to perform a deep CRITICAL KNOWLEDGE SYNTHESIS of the provided thesis manuscript.
Extract, evaluate, and synthesize the essential core knowledge for each of the 10 structural components below.

CRITICAL INSTRUCTIONS:
- You must output strictly valid JSON conforming to the requested schema.
- Do not invent information. If a section is missing in the paper, explicitly state "Section or component not identified in the manuscript."
- Your output must be written in high-level, constructive, and rigorous Spanish so the evaluator can use it directly in feedback.
- Format each component as clean Markdown text with bullet points, main thesis claims, methodologies, and critical observations.`;

    // 3. Schema estricto en JSON para garantizar los 10 botones
    const jsonSchema = {
      type: "object",
      properties: {
        introduccion: { type: "string" },
        problema: { type: "string" },
        realidadProblematica: { type: "string" },
        marcoTeorico: { type: "string" },
        metodologia: { type: "string" },
        resultados: { type: "string" },
        analisis: { type: "string" },
        discusion: { type: "string" },
        conclusiones: { type: "string" },
        recomendaciones: { type: "string" }
      },
      required: [
        "introduccion", "problema", "realidadProblematica", "marcoTeorico",
        "metodologia", "resultados", "analisis", "discusion", "conclusiones", "recomendaciones"
      ]
    };

    // 4. Construir Payload según OpenAPI Spec de Runware (Kimi K2.6)
    const runwarePayload = [
      {
        taskType: "textInference",
        taskUUID: crypto.randomUUID(),
        model: "moonshotai:kimi@k2.6",
        outputFormat: "JSON",
        jsonSchema: jsonSchema,
        settings: {
          systemPrompt: systemPrompt,
          temperature: 0.2, // Baja temperatura para máximo rigor y precisión
          maxTokens: 4000,
          thinkingLevel: "medium", // Aprovecha la capacidad de razonamiento de Kimi K2.6
          promptCacheKey: "thesis-evaluation-v1" // Para aprovechar la tarifa reducida de cache ($0.13/M)
        },
        messages: [
          {
            role: "user",
            content: `Analyze the following academic thesis text and perform the knowledge synthesis for all 10 components:\n\nDOCUMENT CONTENT:\n${textContent}`
          }
        ]
      }
    ];

    // 5. Llamada a la API de Runware
    const RUNWARE_API_KEY = process.env.RUNWARE_API_KEY;
    const apiResponse = await fetch("https://api.runware.ai/v1", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RUNWARE_API_KEY}`
      },
      body: JSON.stringify(runwarePayload)
    });

    const responseData = await apiResponse.json();

    if (!apiResponse.ok) {
      console.error("Runware API Error:", responseData);
      return res.status(apiResponse.status).json({ error: "Error contacting Runware API", details: responseData });
    }

    // 6. Retornar el análisis parseado
    const outputText = responseData.data[0].content || responseData.data[0].text;
    const parsedAnalysis = typeof outputText === 'string' ? JSON.parse(outputText) : outputText;

    return res.status(200).json({
      success: true,
      fileName: fileName,
      analysis: parsedAnalysis
    });

  } catch (err) {
    console.error("Internal Error:", err);
    return res.status(500).json({ error: "Failed to process thesis PDF", details: err.message });
  }
};
