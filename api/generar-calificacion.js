// api/generar-calificacion.js

module.exports = async (req, res) => {
  // Manejo de CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  try {
    const { analisisOriginal, calificaciones } = req.body;

    // Validación de seguridad
    if (!analisisOriginal || !calificaciones) {
      return res.status(400).json({ error: 'Faltan datos de análisis o calificaciones' });
    }

    // 1. Armar el "Expediente" para la IA
    // Juntamos cada texto resumido con la nota que le puso el profesor
    let contextoEvaluacion = "INFORME DE EVALUACIÓN DE TESIS:\n\n";
    
    const nombresSecciones = {
      introduccion: '1. Introducción',
      problema: '2. Problema',
      realidadProblematica: '3. Realidad Problemática',
      marcoTeorico: '4. Marco Teórico',
      metodologia: '5. Metodología',
      resultados: '6. Resultados',
      analisis: '7. Análisis',
      discusion: '8. Discusión',
      conclusiones: '9. Conclusiones',
      recomendaciones: '10. Recomendaciones'
    };

    let sumaNotas = 0;
    for (const key in calificaciones) {
        contextoEvaluacion += `--- ${nombresSecciones[key]} ---\n`;
        contextoEvaluacion += `Resumen del contenido: ${analisisOriginal[key]}\n`;
        contextoEvaluacion += `Calificación del docente: ${calificaciones[key]} / 5\n\n`;
        sumaNotas += calificaciones[key];
    }
    
    const promedio = (sumaNotas / 10).toFixed(1);

    // 2. Definir la Personalidad y Criterio del Evaluador
    // NOTA PARA EL FUTURO: Aquí es donde conectaremos con la base de datos de usuarios
    // y extraeremos el contenido de Drive ("ref-blocks") para inyectarlo en este prompt.
    const systemPrompt = `Eres un catedrático universitario estricto, formal y experimentado evaluando tesis de pregrado y posgrado.
Tu tarea es redactar el DICTAMEN FINAL o veredicto de evaluación del manuscrito.
El sistema te provee el resumen de 10 secciones y la nota (del 1 al 5) que el docente principal le asignó a cada una.
Regla de notas: 1 o 2 = Deficiente/Rehacer. 3 = Regular. 4 o 5 = Excelente/Riguroso.

INSTRUCCIONES CRÍTICAS:
- Redacta un documento académico formal, en prosa estructurada (no hagas simples listas de viñetas).
- Escribe en primera persona del plural ("Consideramos", "Evaluamos") o tercera formal ("Se ha determinado").
- Si una sección tiene 1 o 2, sé implacable en la crítica y exige correcciones metodológicas o teóricas.
- Si tiene 4 o 5, elogia la solidez y el rigor académico en esa área.
- Concluye el documento con un Veredicto General claro (Aprobado, Aprobado con Observaciones Mayores/Menores, o Rechazado/Rehacer) justificándolo en el promedio de las notas.
- Usa formato Markdown (negritas, subtítulos) para estructurar el dictamen.`;

    // 3. Conexión con Gemini 1.5 Flash
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) throw new Error("API Key no configurada");

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    const geminiPayload = {
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
      contents: [
        {
          role: "user",
          parts: [
            { text: `Promedio matemático de la evaluación: ${promedio}/5\n\n${contextoEvaluacion}\n\nPor favor, redacta el dictamen final basándote estrictamente en estas calificaciones.` }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.3 // Temperatura ligeramente mayor (0.3) para darle un estilo de redacción más natural y humano
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
      return res.status(apiResponse.status).json({ error: "Error al redactar el dictamen", details: responseData });
    }

    // 4. Extraer el texto generado
    const veredictoFinal = responseData.candidates[0].content.parts[0].text;

    // 5. Enviar el resultado al frontend
    return res.status(200).json({
      success: true,
      veredicto: veredictoFinal
    });

  } catch (err) {
    console.error("Error del servidor local:", err.message);
    return res.status(500).json({ error: "Fallo general en la generación", details: err.message });
  }
};
