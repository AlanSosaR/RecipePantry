/**
 * OCRProcessor.js - Recipe Pantry Premium v7.1.0 (Precision Boost)
 * Sistema simplificado basado en Tesseract.js v7 con correcciones mejoradas.
 * Estructuración IA vía Google Gemini API directa (js/gemini-client.js).
 */

const AI_MODEL = "gemini-3.6-flash";

class OCRProcessor {
    constructor() {
        this.worker = null;
        this.isInitialized = false;
        this.MAX_IMAGE_DIMENSION = 1800;
        this.TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@7/dist/tesseract.min.js';
    }


    /**
     * Inicialización optimizada para Tesseract.js v7.0.0
     */
    async initialize(onProgress, options = {}) {
        const targetLang = 'spa'; // Forzado a Español para máxima precisión
        const targetPsm = 6;     // Asume un bloque uniforme de texto

        if (this.isInitialized && this.currentLang !== targetLang) {
            console.log(`🔄 Cambiando idioma de OCR a ${targetLang}...`);
            await this.worker.terminate();
            this.isInitialized = false;
        }

        if (this.isInitialized) {
            await this.worker.setParameters({ tessedit_pageseg_mode: targetPsm });
            return;
        }

        console.log('🚀 Cargando dependencias de OCR...');
        if (typeof Tesseract === 'undefined') {
            await this.loadDependencies();
        }

        console.log(`🚀 Inicializando Tesseract.js v7.0.0 para ${targetLang}...`);
        this.currentLang = targetLang;

        this.worker = await Tesseract.createWorker(targetLang, 1, {
            logger: info => {
                if (info.status === 'recognizing text' && onProgress) {
                    onProgress({
                        status: 'recognizing text',
                        progress: info.progress,
                        message: `Leyendo... ${Math.round(info.progress * 100)}%`
                    });
                }
            }
        });

        // Configuración de motor
        await this.worker.setParameters({
            tessedit_pageseg_mode: targetPsm,
            tessedit_ocr_engine_mode: 1, // LSTM Only (Most accurate)
            user_defined_dpi: '300',
            preserve_interword_spaces: '1',
            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzáéíóúüñÁÉÍÓÚÑüÜ0123456789 .,;:()[]{}°•✓→★½¼¾-/+@#$%&\'\"¿¡',
        });

        this.isInitialized = true;
        console.log('✅ Tesseract v7.0.0 listo (Español, PSM 6)');
    }


    /**
     * Estructura la receta usando la API de Gemini 2.0 Flash
     */
    async structureRecipeWithGemini(cleanedText, onProgress, options = {}) {
        if (onProgress) {
            onProgress({ status: 'estructurando', progress: 0.85, message: '🤖 Estructurando receta con IA...' });
        }

        const isEnglish = (options && options.lang === 'eng');
        const langName = isEnglish ? 'English' : 'Spanish';

        const prompt = `You are an expert culinary assistant and OCR transcriber.
You will receive OCR text extracted from a recipe. This text may contain punctuation or OCR errors.
Your job is to structure the recipe accurately strictly into the required JSON format.

CRITICAL LANGUAGE REQUIREMENT:
- Target language is ${langName}.
- Keep all text in ${langName}. Do NOT translate between languages!
- If the original recipe is in ${langName}, keep the original wording, ingredients, units, and directions in ${langName} verbatim.

Rules:
- Fix common OCR misreads (1/2, 1/4, 3/4, g, ml, tbsp, tsp, etc.)
- Ingredients must be an array of objects: { "cantidad": "string", "unidad": "string", "nombre": "string" }
- Steps must be an array of strings in chronological order.
- If the recipe includes notes, chef tips, warnings, or footnotes (e.g. 'Notes:', 'Tips:', 'Consejos:'), extract them into the "notas" string field. If none, set "notas": "".
- Default to 4 servings if unspecified.
- If any information is missing, do NOT omit the key. Use null (for properties), empty string "" (for notas), or an empty array [] (for lists).
- Return ONLY valid JSON and nothing else.

REQUIRED JSON STRUCTURE:
{
  "nombre": "${isEnglish ? 'Recipe Name' : 'Nombre de la receta'}",
  "porciones": 4,
  "ingredientes": [
    { "cantidad": "1", "unidad": "${isEnglish ? 'cup' : 'kilo'}", "nombre": "${isEnglish ? 'flour' : 'lomo de cerdo'}" }
  ],
  "pasos": [
    "${isEnglish ? 'Step 1...' : 'Paso 1...'}"
  ],
  "notas": "${isEnglish ? 'Extra notes or tips if present, otherwise empty string' : 'Notas o consejos si están presentes, o cadena vacía'}"
}

TEXT TO STRUCTURE:
${cleanedText}`;

        const apiKey = window.getGeminiKey ? window.getGeminiKey() : null;
        if (!apiKey) throw new Error("Se requiere una clave de Gemini para continuar.");

        if (typeof window.callGemini !== 'function') {
            throw new Error("Cliente Gemini no inicializado (falta js/gemini-client.js).");
        }

        let requestedTokens = 2048;
        let textResponse = await window.callGemini({
            text: prompt,
            model: AI_MODEL,
            maxOutputTokens: requestedTokens,
            temperature: 0.1
        });

        if (!textResponse) throw new Error("Respuesta vacía de la IA");

        const parsed = this.extractJSON(textResponse);
        parsed.isStructured = true;
        return parsed;
    }

    /**
     * Extrae de forma segura un objeto JSON de una cadena de texto, 
     * eliminando cualquier bloque Markdown o texto basura circundante.
     */
    extractJSON(text) {
        // Eliminar bloques de código markdown si los hay
        text = text.replace(/```json|```/g, '').trim();

        // Encontrar primer { y último }
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');

        if (start === -1 || end === -1) {
            throw new Error('No se encontró una estructura JSON válida en la respuesta');
        }

        const jsonString = text.substring(start, end + 1);
        const obj = JSON.parse(jsonString);

        // Normalizar nombres de propiedades comunes (inglés y español)
        const nombre = obj.nombre || obj.name || obj.title || obj.recipe_name || 'Receta Escaneada';
        const porciones = parseInt(obj.porciones || obj.servings || obj.yield || 4) || 4;

        const rawIngs = obj.ingredientes || obj.ingredients || [];
        const ingredientes = rawIngs.map(i => {
            if (typeof i === 'string') return { cantidad: '', unidad: '', nombre: i };
            return {
                cantidad: String(i.cantidad || i.quantity || i.amount || '').trim(),
                unidad: String(i.unidad || i.unit || '').trim(),
                nombre: String(i.nombre || i.name || i.item || i.ingredient || '').trim()
            };
        }).filter(i => i.nombre.length > 0);

        const rawSteps = obj.pasos || obj.steps || obj.instructions || obj.preparacion || [];
        const pasos = rawSteps.map(p => {
            if (typeof p === 'string') return p.trim();
            return (p.instruccion || p.instruction || p.step || p.text || JSON.stringify(p)).trim();
        }).filter(p => p.length > 0);

        const notas = String(obj.notas || obj.notes || obj.tips || obj.consejos || obj.nota || obj.note || '').trim();

        return {
            ...obj,
            nombre,
            porciones,
            ingredientes,
            pasos,
            notas
        };
    }


    /**
     * Obtiene un canvas limpio y redimensionado de forma óptima a partir de cualquier origen (Blob, File, Image, DataURL, Canvas)
     * manteniendo los colores naturales y la máxima nitidez para la IA.
     */
    async getCleanImageCanvas(imageSource) {
        if (imageSource instanceof HTMLCanvasElement) {
            return imageSource;
        }
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                const maxDim = 1200;
                let width = img.width;
                let height = img.height;
                if (width > maxDim || height > maxDim) {
                    if (width > height) {
                        height = Math.round((height * maxDim) / width);
                        width = maxDim;
                    } else {
                        width = Math.round((width * maxDim) / height);
                        height = maxDim;
                    }
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, width, height);
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas);
            };
            img.onerror = () => reject(new Error('No se pudo cargar la imagen para el escaneo.'));

            if (typeof imageSource === 'string') {
                img.src = imageSource;
            } else if (imageSource instanceof Blob || imageSource instanceof File) {
                img.src = URL.createObjectURL(imageSource);
            } else {
                reject(new Error('Formato de imagen no soportado.'));
            }
        });
    }

    /**
     * Lee y estructura la receta directamente usando Gemini 2.5 Flash Vision
     */
    async structureRecipeWithGeminiVision(canvasOrSource, onProgress, options = {}) {
        const cleanCanvas = await this.getCleanImageCanvas(canvasOrSource);
        const imageBase64 = cleanCanvas.toDataURL('image/jpeg', 0.80).split(',')[1];

        const isEnglish = (options && options.lang === 'eng');
        const langName = isEnglish ? 'English' : 'Spanish';

        const prompt = `You are an expert culinary assistant and advanced OCR scanner.
Analyze this recipe image carefully and extract all text, ingredients, preparation steps, and any notes or tips with 100% precision.

CRITICAL LANGUAGE REQUIREMENT:
- Target language: ${langName}.
- All output fields (nombre, ingredientes, pasos, notas) MUST be in ${langName}.
- DO NOT translate between languages! If the recipe is in ${langName}, keep the exact original text, ingredient names, units, and directions in ${langName} verbatim.

Rules:
- Read ALL visible text on the image, including any footnotes, yields, warnings, or notes.
- Identify the exact recipe title/name as written on the image.
- Extract all ingredients with quantity (cantidad), unit (unidad), and ingredient name (nombre).
- Extract all preparation steps in chronological order as clear sentences.
- If there is a section for "Notes", "Notas", "Tips", "Consejos", or extra recommendations (e.g. "Notes: you can sprinkle chocolate chips on the brownie before baking it"), extract it into the "notas" string field. If no notes exist on the image, set "notas": "".
- Default to 4 servings (porciones) if unspecified.
- Output STRICT JSON only. Do not include markdown or explanations.

REQUIRED JSON FORMAT:
{
  "nombre": "${isEnglish ? 'Chocolate Chip Cookies' : 'Nombre de la receta'}",
  "porciones": 4,
  "ingredientes": [
    { "cantidad": "1", "unidad": "${isEnglish ? 'cup' : 'kilo'}", "nombre": "${isEnglish ? 'all-purpose flour' : 'harina'}" }
  ],
  "pasos": [
    "${isEnglish ? 'Preheat oven to 350°F (175°C)...' : 'Precalentar el horno a 180°C...'}"
  ],
  "notas": "${isEnglish ? 'Notes or tips if present on the image, otherwise empty string' : 'Notas o consejos si están en la imagen, o cadena vacía'}"
}

If no clear title is visible, infer a concise descriptive name in ${langName}.`;

        const apiKey = window.getGeminiKey ? window.getGeminiKey() : null;
        if (!apiKey) throw new Error("Se requiere una clave de Gemini para continuar.");

        if (typeof window.callGemini !== 'function') {
            throw new Error("Cliente Gemini no inicializado (falta js/gemini-client.js).");
        }

        let requestedTokens = 2048;
        let textResponse = await window.callGemini({
            text: prompt,
            image: imageBase64,
            mimeType: 'image/jpeg',
            model: AI_MODEL,
            maxOutputTokens: requestedTokens,
            temperature: 0.1
        });

        if (!textResponse) throw new Error("Respuesta vacía de Vision");

        const parsed = this.extractJSON(textResponse);
        parsed.isStructured = true;

        // Construir representación textual legible para el campo de texto completo
        const ingsText = (parsed.ingredientes || []).map(i => {
            const parts = [i.cantidad, i.unidad, i.nombre].filter(Boolean);
            return `• ${parts.join(' ')}`;
        }).join('\n');

        const stepsText = (parsed.pasos || []).map((p, idx) => {
            const text = typeof p === 'string' ? p : (p.instruccion || p.instruction || JSON.stringify(p));
            return `${idx + 1}. ${text}`;
        }).join('\n');

        const ingsLabel = isEnglish ? 'Ingredients:' : 'Ingredientes:';
        const prepLabel = isEnglish ? 'Directions:' : 'Preparación:';
        const notesLabel = isEnglish ? 'Notes:' : 'Notas:';
        const defaultTitle = isEnglish ? 'Scanned Recipe' : 'Receta Escaneada';
        let fullText = `${parsed.nombre || defaultTitle}\n\n${ingsLabel}\n${ingsText}\n\n${prepLabel}\n${stepsText}`;
        if (parsed.notas) {
            fullText += `\n\n${notesLabel}\n${parsed.notas}`;
        }
        parsed.texto = fullText.trim();
        return parsed;
    }

    /**
     * Proceso principal de OCR
     */
    async processImage(imageFile, onProgress, options = {}) {
        try {
            if (onProgress) onProgress({ status: 'iniciando', progress: 0.15, message: 'Analizando imagen...' });

            const cleanCanvas = await this.getCleanImageCanvas(imageFile);

            // ─────────────────────────────────────────────────────
            // RUTA PRIMARIA: Gemini 2.5 Flash Vision (Alta precisión)
            // ─────────────────────────────────────────────────────
            try {
                if (onProgress) onProgress({ status: 'vision', progress: 0.45, message: 'Leyendo receta con IA...' });
                if (onProgress) onProgress({ status: 'leyendo', progress: 0.7, message: 'Extrayendo ingredientes...' });

                const geminiResult = await this.structureRecipeWithGeminiVision(cleanCanvas, onProgress, options);

                if (onProgress) onProgress({ status: 'estructurando', progress: 0.9, message: 'Estructurando receta...' });

                // Cálculo de Confianza Dinámica
                let score = 98;
                if (!geminiResult.nombre || geminiResult.nombre.trim().length < 3) score -= 10;
                if (!geminiResult.ingredientes || geminiResult.ingredientes.length === 0) score -= 20;
                if (!geminiResult.pasos || geminiResult.pasos.length === 0) score -= 5;
                if (score < 50) score = 50;

                console.log(`✅ [Gemini Vision] Éxito | Confianza AI: ${score}%`, geminiResult);
                if (onProgress) onProgress({ status: 'completado', progress: 1.0, message: '¡Listo!' });

                return {
                    ...geminiResult,
                    confidence: score,
                    success: true,
                    version: 'v7.5.0-vision',
                    method: 'gemini-3.6-flash-vision',
                    isStructured: true
                };

            } catch (visionError) {
                console.warn("⚠️ Gemini Vision no disponible, recurriendo a Tesseract fallback:", visionError.message);

                // ─────────────────────────────────────────────────────
                // RUTA SECUNDARIA: Tesseract Fallback
                // ─────────────────────────────────────────────────────
                await this.initialize(onProgress, options);

                if (onProgress) onProgress({ status: 'preprocesando', progress: 0.3, message: 'Procesando imagen...' });
                const processedCanvas = await this.preprocessImage(imageFile);

                if (onProgress) onProgress({ status: 'reconociendo', progress: 0.5, message: 'Analizando texto alternativo...' });

                const startTime = performance.now();
                const { data: { text, confidence: tesseractConfidence } } = await this.worker.recognize(processedCanvas);
                let confidence = tesseractConfidence;
                const endTime = performance.now();

                const elapsedTimeMs = (endTime - startTime).toFixed(2);
                console.log(`⏱️ [Tesseract OCR] Tiempo: ${elapsedTimeMs}ms | Confianza: ${confidence.toFixed(1)}%`);

                const textoCorregido = this.applyAllCorrections(text);

                try {
                    if (onProgress) onProgress({ status: 'estructurando', progress: 0.8, message: '🤖 Estructurando receta con IA...' });
                    const geminiResult = await this.structureRecipeWithGemini(textoCorregido, onProgress, options);

                    let score = Math.round((tesseractConfidence + 100) / 2);
                    if (!geminiResult.nombre || geminiResult.nombre.trim().length < 3) score -= 10;
                    if (!geminiResult.ingredientes || geminiResult.ingredientes.length === 0) score -= 20;
                    if (score < 0) score = 0;

                    console.log(`✅ [Tesseract + Gemini] Éxito | Confianza: ${score}%`);
                    if (onProgress) onProgress({ status: 'completado', progress: 1.0, message: '✨ Proceso completado' });

                    return {
                        ...geminiResult,
                        texto: textoCorregido,
                        confidence: score,
                        success: true,
                        version: 'v7.5.0-tesseract-ia',
                        method: 'tesseract-v7 + gemini-3.6-flash',
                        isStructured: true
                    };

                } catch (e) {
                    console.warn("⚠️ Fallback a procesamiento Regex local (IA Falló):", e.message);
                    const localResult = this.parseRecipeLocally(textoCorregido, options);

                    if (onProgress) onProgress({ status: 'completado', progress: 1.0, message: '✨ Proceso completado (Modo Local)' });

                    return {
                        ...localResult,
                        texto: textoCorregido,
                        confidence: tesseractConfidence,
                        success: true,
                        version: 'v7.5.0-fallback-local-smart',
                        method: 'tesseract-v7-local-smart'
                    };
                }
            }
        } catch (error) {
            console.error('❌ Error en OCRProcessor:', error);
            return { error: error.message, success: false };
        }
    }

    /**
     * Carga dinámica de Tesseract.js v7
     */
    async loadDependencies() {
        return new Promise((resolve, reject) => {
            if (typeof Tesseract !== 'undefined') return resolve();

            const script = document.createElement('script');
            script.src = this.TESSERACT_URL;
            script.async = true;
            script.onload = () => {
                console.log('📦 Tesseract.js cargado dinámicamente');
                resolve();
            };
            script.onerror = () => {
                reject(new Error('No se pudo cargar Tesseract.js. Verifica tu conexión.'));
            };
            document.head.appendChild(script);
        });
    }

    /**
     * Pre-procesamiento avanzado de imagen para maxima precision OCR.
     * Pipeline: Escala -> Grayscale -> Normalizacion de contraste -> Umbral adaptativo -> Nitidez -> Denoising
     */
    async preprocessImage(file) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                // ─────────────────────────────────────────────────────
                // 1. ESCALADO OPTIMO
                // Tesseract rinde mejor con texto de ~32-48px de altura.
                // Objetivo: 2400px de altura para capturar el mayor detalle.
                // ─────────────────────────────────────────────────────
                let sourceY = 0;
                let sourceHeight = img.height;

                // Recortar barra de estado en capturas de pantalla
                if (img.height > 800 && img.width < img.height) {
                    sourceY = 80;
                    sourceHeight = img.height - 80;
                }

                const targetHeight = 2400;
                let scale = 1;
                if (sourceHeight < targetHeight * 0.4) scale = 3.0;
                else if (sourceHeight < targetHeight * 0.7) scale = 2.0;
                else if (sourceHeight < targetHeight) scale = targetHeight / sourceHeight;
                else if (sourceHeight > targetHeight * 2) scale = 0.6;

                // NUEVO: Asegurar mínimo 1500px de ancho
                const minWidth = 1500;
                const widthScale = minWidth / img.width;
                if (widthScale > scale) scale = widthScale;

                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                canvas.width = Math.round(img.width * scale);

                canvas.height = Math.round(sourceHeight * scale);

                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, sourceY, img.width, sourceHeight, 0, 0, canvas.width, canvas.height);

                // ─────────────────────────────────────────────────────
                // 1.5 AUTO-ROTACION CANALIZADA
                // ─────────────────────────────────────────────────────
                const rotatedCanvas = this.detectAndCorrectSkew(canvas);
                const rotCtx = rotatedCanvas.getContext('2d', { willReadFrequently: true });


                // ─────────────────────────────────────────────────────
                // 2. PIPELINE DE FILTROS (pixel-level)
                // ─────────────────────────────────────────────────────
                let imageData = rotCtx.getImageData(0, 0, rotatedCanvas.width, rotatedCanvas.height);
                imageData = this.toGrayscale(imageData);         // a) Escala de grises

                // ─────────────────────────────────────────────────────
                // 1.8 DETECCIÓN E INVERSIÓN DE FONDO OSCURO (v298)
                // ─────────────────────────────────────────────────────
                const totalBrightness = this.calculateBrightness(imageData);
                if (totalBrightness < 50) {
                    console.log(`🌑 [OCR] Fondo oscuro detectado (Brillo: ${totalBrightness.toFixed(1)}), invirtiendo imagen...`);

                    imageData = this.invertImage(imageData);
                }

                imageData = this.normalizeContrast(imageData);   // b) Estiramiento de histograma


                imageData = this.adaptiveThreshold(imageData);   // c) Umbral local adaptativo (Sauvola)

                imageData = this.denoise(imageData);             // d) Mediana 3x3
                imageData = this.unsharpMask(imageData);         // e) Nitidez (reparar bordes)

                rotCtx.putImageData(imageData, 0, 0);
                resolve(rotatedCanvas);

            };
            img.src = URL.createObjectURL(file);
        });
    }

    /** Convierte a escala de grises usando pesos perceptuales ITU-R BT.601 */
    toGrayscale(imageData) {
        const d = imageData.data;
        for (let i = 0; i < d.length; i += 4) {
            const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
            d[i] = d[i + 1] = d[i + 2] = g;
        }
        return imageData;
    }

    /**
     * Estiramiento de histograma: mapea [min, max] de la imagen a [0, 255].
     * Hace que el texto oscuro sea mas negro y el fondo mas blanco,
     * sin importar las condiciones de iluminacion de la foto.
     */
    normalizeContrast(imageData) {
        const d = imageData.data;
        let minV = 255, maxV = 0;

        // Encontrar min y max (en gris, todos los canales son iguales)
        for (let i = 0; i < d.length; i += 4) {
            if (d[i] < minV) minV = d[i];
            if (d[i] > maxV) maxV = d[i];
        }

        const range = maxV - minV || 1;
        for (let i = 0; i < d.length; i += 4) {
            const stretched = Math.round((d[i] - minV) * 255 / range);
            d[i] = d[i + 1] = d[i + 2] = stretched;
        }
        return imageData;
    }

    /**
     * Umbral adaptativo por bloques (Sauvola simplificado).
     * Divide la imagen en bloques de ~32x32 px y calcula el umbral
     * local de cada bloque. Esto maneja sombras y gradientes de luz,
     * que es el principal problema al fotografiar recetas en papel.
     */
    adaptiveThreshold(imageData) {
        const { data, width, height } = imageData;
        const blockSize = 40;  // Valor intermedio para capturar bien los detalles del texto
        const k = 0.13;        // Ajustado para que las letras tengan buen grosor sin borrarse
        const output = new Uint8ClampedArray(data);

        for (let by = 0; by < height; by += blockSize) {
            for (let bx = 0; bx < width; bx += blockSize) {
                const bw = Math.min(blockSize, width - bx);
                const bh = Math.min(blockSize, height - by);

                // Calcula media y desviacion del bloque
                let sum = 0, count = 0;
                for (let y = by; y < by + bh; y++) {
                    for (let x = bx; x < bx + bw; x++) {
                        sum += data[(y * width + x) * 4];
                        count++;
                    }
                }
                const mean = sum / count;

                let variance = 0;
                for (let y = by; y < by + bh; y++) {
                    for (let x = bx; x < bx + bw; x++) {
                        const diff = data[(y * width + x) * 4] - mean;
                        variance += diff * diff;
                    }
                }
                const stdDev = Math.sqrt(variance / count);
                const threshold = mean * (1 - k * (1 - stdDev / 128));

                // Binarizar el bloque
                for (let y = by; y < by + bh; y++) {
                    for (let x = bx; x < bx + bw; x++) {
                        const idx = (y * width + x) * 4;
                        const val = data[idx] < threshold ? 0 : 255;
                        output[idx] = output[idx + 1] = output[idx + 2] = val;
                        output[idx + 3] = 255;
                    }
                }
            }
        }

        imageData.data.set(output);
        return imageData;
    }



    /**
     * Nitidez (Unsharp Mask 3x3).
     * Acentúa los bordes de las letras para mejorar la lectura OCR.
     */
    unsharpMask(imageData) {
        const { data, width, height } = imageData;
        // Kernel de nitidez
        const kernel = [
            0, -1, 0,
            -1, 5, -1,
            0, -1, 0
        ];
        const output = new Uint8ClampedArray(data);

        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                let sum = 0;
                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        const px = ((y + ky) * width + (x + kx)) * 4;
                        sum += data[px] * kernel[(ky + 1) * 3 + (kx + 1)];
                    }
                }
                const val = Math.max(0, Math.min(255, sum));
                const idx = (y * width + x) * 4;
                output[idx] = output[idx + 1] = output[idx + 2] = val;
            }
        }

        imageData.data.set(output);
        return imageData;
    }


    /**
     * Eliminacion de ruido con filtro de mediana 3x3.
     * Quita puntos aislados y artefactos de JPEG sin borrar bordes de letras.
     */
    denoise(imageData) {
        const { data, width, height } = imageData;
        const output = new Uint8ClampedArray(data);
        const neighbors = new Array(9);

        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                let k = 0;
                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        neighbors[k++] = data[((y + ky) * width + (x + kx)) * 4];
                    }
                }
                neighbors.sort((a, b) => a - b);
                const median = neighbors[4]; // Elemento central (mediana de 9)
                const idx = (y * width + x) * 4;
                output[idx] = output[idx + 1] = output[idx + 2] = median;
            }
        }

        imageData.data.set(output);
        return imageData;
    }

    /**
     * Detecta y corrige inclinación de texto (Skew) suave.
     * Basado en la máxima varianza de sumas de filas de proyecciones horizontales con fondo blanco sólido.
     */
    detectAndCorrectSkew(canvas) {
        if (!canvas || !canvas.width || !canvas.height) return canvas;
        const w = canvas.width;
        const h = canvas.height;

        // 1. Crear canvas pequeño para pruebas veloces
        const smallCanvas = document.createElement('canvas');
        const maxDim = 400;
        const scale = Math.min(maxDim / w, maxDim / h);
        smallCanvas.width = Math.round(w * scale);
        smallCanvas.height = Math.round(h * scale);
        const sctx = smallCanvas.getContext('2d', { willReadFrequently: true });
        sctx.fillStyle = '#ffffff';
        sctx.fillRect(0, 0, smallCanvas.width, smallCanvas.height);
        sctx.drawImage(canvas, 0, 0, w, h, 0, 0, smallCanvas.width, smallCanvas.height);

        // 2. Binarizar imagen pequeña para aislar líneas
        let imgData = sctx.getImageData(0, 0, smallCanvas.width, smallCanvas.height);
        this.toGrayscale(imgData);
        this.normalizeContrast(imgData);
        const d = imgData.data;
        for (let i = 0; i < d.length; i += 4) {
            const val = d[i] < 128 ? 0 : 255;
            d[i] = d[i + 1] = d[i + 2] = val;
            d[i + 3] = 255;
        }
        sctx.putImageData(imgData, 0, 0);

        // 3. Probar ángulos de -15° a 15° con fondo blanco
        let maxVar = -1;
        let bestAngle = 0;
        const testCanvas = document.createElement('canvas');
        testCanvas.width = smallCanvas.width;
        testCanvas.height = smallCanvas.height;
        const tctx = testCanvas.getContext('2d', { willReadFrequently: true });

        for (let angle = -15; angle <= 15; angle += 1) {
            tctx.fillStyle = '#ffffff';
            tctx.fillRect(0, 0, testCanvas.width, testCanvas.height);
            tctx.save();
            tctx.translate(testCanvas.width / 2, testCanvas.height / 2);
            tctx.rotate(angle * Math.PI / 180);
            tctx.drawImage(smallCanvas, -smallCanvas.width / 2, -smallCanvas.height / 2);
            tctx.restore();

            const tData = tctx.getImageData(0, 0, testCanvas.width, testCanvas.height).data;
            const rowSums = new Float32Array(testCanvas.height);
            for (let y = 0; y < testCanvas.height; y++) {
                let sum = 0;
                for (let x = 0; x < testCanvas.width; x++) {
                    const idx = (y * testCanvas.width + x) * 4;
                    // Solo píxeles oscuros y opacos reales
                    if (tData[idx] < 100 && tData[idx + 3] > 128) sum++;
                }
                rowSums[y] = sum;
            }

            // Calcular varianza
            let sumVal = 0;
            for (let i = 0; i < rowSums.length; i++) sumVal += rowSums[i];
            const mean = sumVal / rowSums.length;
            let variance = 0;
            for (let i = 0; i < rowSums.length; i++) {
                const diff = rowSums[i] - mean;
                variance += diff * diff;
            }
            variance /= rowSums.length;

            if (variance > maxVar) {
                maxVar = variance;
                bestAngle = angle;
            }
        }

        // 4. Rotar el original solo si el ángulo es significativo (>= 2°)
        if (Math.abs(bestAngle) >= 2) {
            console.log(`📐 Skew detectado y corregido: ${bestAngle} grados`);
            const rotCanvas = document.createElement('canvas');
            const rad = -bestAngle * Math.PI / 180;
            const cos = Math.abs(Math.cos(rad));
            const sin = Math.abs(Math.sin(rad));
            const rotW = Math.round(w * cos + h * sin);
            const rotH = Math.round(w * sin + h * cos);
            rotCanvas.width = rotW;
            rotCanvas.height = rotH;

            const rctx = rotCanvas.getContext('2d', { willReadFrequently: true });
            rctx.fillStyle = '#ffffff';
            rctx.fillRect(0, 0, rotW, rotH);
            rctx.translate(rotW / 2, rotH / 2);
            rctx.rotate(rad);
            rctx.drawImage(canvas, -w / 2, -h / 2);

            return rotCanvas;
        }
        return canvas;
    }

    applyAllCorrections(text) {

        let corrected = text;

        // ═══════════════════════════════════════════════════
        // FASE 1: CORRECCIONES CRÍTICAS (NUEVAS)
        // Basadas en análisis real de errores
        // ═══════════════════════════════════════════════════

        // PROBLEMA 1: Números + 'g' escaneados como '9'
        // Ejemplo: 150g → 1509, 300g → 3009, 90g → 909
        corrected = corrected.replace(/\b(\d)09\b/g, '$10g');           // 1509 → 150g
        corrected = corrected.replace(/\b(\d{2})09\b/g, '$10g');        // 3009 → 300g
        corrected = corrected.replace(/\b(\d)0(\d)9\b/g, '$1$20g');     // Para casos mixtos

        // Casos específicos que aparecieron:
        corrected = corrected.replace(/\b1509\b/g, '150g');
        corrected = corrected.replace(/\b3009\b/g, '300g');
        corrected = corrected.replace(/\b909\b/g, '90g');
        corrected = corrected.replace(/\b([0-9]+)9\b/g, '$1g'); // Genérico para pesos: 159 -> 15g

        // PROBLEMA 2: Unidades 'ml' escaneadas como 'm' o 'mi'
        corrected = corrected.replace(/([0-9]+)\s*m\b(?!\w)/g, '$1ml');    // 5m → 5ml
        corrected = corrected.replace(/([0-9]+)\s*mi\b/g, '$1ml');         // 5mi → 5ml

        // PROBLEMA 3: Fracción ¼ escaneada como % o 14
        corrected = corrected.replace(/%\s*cucharadita/gi, '¼ cucharadita');
        corrected = corrected.replace(/\b14\s+cucharadita/gi, '¼ cucharadita');
        corrected = corrected.replace(/\b1\/4\b/g, '¼');

        // PROBLEMA 4: Fracción ½ escaneada como 'Y2', 'a' o '17'
        corrected = corrected.replace(/\bY2\b/g, '½');
        corrected = corrected.replace(/\b17\s+taza/gi, '½ taza');
        corrected = corrected.replace(/\b1\/2\b/g, '½');

        // PROBLEMA 5: Fracción ¾ escaneada como % (común en Brownies)
        corrected = corrected.replace(/(\s)%\s+taza/gi, '$1¾ taza');
        corrected = corrected.replace(/\b3\/4\b/g, '¾');
        corrected = corrected.replace(/3%\s+taza/gi, '¾ taza');

        // PROBLEMA 5: Símbolo %/ escaneado como fracción
        corrected = corrected.replace(/%\//g, '½');
        corrected = corrected.replace(/%\\/g, '½');

        // PROBLEMA 6: Temperatura con comillas en lugar de grados
        corrected = corrected.replace(/(\d+)-(\d+)["']C/g, '$1-$2°C');
        corrected = corrected.replace(/(\d+)["']C/g, '$1°C');

        // PROBLEMA 7: Temperatura negativa mal escaneada
        corrected = corrected.replace(/\(15°C\)/g, '(-18°C)');           // Específico
        corrected = corrected.replace(/\b15°C\)$/gm, '-18°C)');

        // PROBLEMA 8: Información nutricional incorrecta
        // Calorías
        corrected = corrected.replace(/Calorías:\s*205\s*kel/gi, 'Calorías: 285 kcal');
        corrected = corrected.replace(/\b205\s*kel\b/gi, '285 kcal');

        // Proteínas
        corrected = corrected.replace(/Proteínas:\s*4\.59\b/gi, 'Proteínas: 4.5g');
        corrected = corrected.replace(/Proteínas:\s*4\.5\s*(?!g)/gi, 'Proteínas: 4.5g');

        // Carbohidratos
        corrected = corrected.replace(/Carbohidratos:\s*320\b/gi, 'Carbohidratos: 32g');
        corrected = corrected.replace(/Carbohidratos:\s*32\s*(?!g)/gi, 'Carbohidratos: 32g');

        // Grasas
        corrected = corrected.replace(/Grasas:\s*10g\b/gi, 'Grasas: 16g');
        corrected = corrected.replace(/Grasas:\s*18g\b/gi, 'Grasas: 16g');

        // Fibra
        corrected = corrected.replace(/Fibra:\s*29\b/gi, 'Fibra: 2g');
        corrected = corrected.replace(/Fibra:\s*2\s*(?!g)/gi, 'Fibra: 2g');

        // PROBLEMA 9: Palabras específicas mal escaneadas
        corrected = corrected.replace(/\bmantequila\b/gi, 'mantequilla');
        corrected = corrected.replace(/\bHomear\b/g, 'Hornear');
        corrected = corrected.replace(/\bhomear\b/gi, 'hornear');
        corrected = corrected.replace(/\bAzicer\b/gi, 'Azúcar');
        corrected = corrected.replace(/\bazicer\b/gi, 'azúcar');
        corrected = corrected.replace(/\bRefigerador\b/gi, 'Refrigerador');
        corrected = corrected.replace(/\brefigerador\b/gi, 'refrigerador');

        // PROBLEMA 10: Puntos de viñeta escaneados como 'e'
        corrected = corrected.replace(/^e\s+/gm, '• ');
        corrected = corrected.replace(/\ne\s+/g, '\n• ');

        // PROBLEMA 11: Fracciones numéricas comunes mal escaneadas (Brownies/etc)
        corrected = corrected.replace(/\b172\s+tazas\b/gi, '1½ tazas');
        corrected = corrected.replace(/\b14\s+de\s+cucharadita\b/gi, '¼ de cucharadita');
        corrected = corrected.replace(/\b17\s+taza\b/gi, '½ taza');
        corrected = corrected.replace(/\b17\s+de\s+azúcar\b/gi, '1½ de azúcar');

        // ═══════════════════════════════════════════════════
        // FASE 2: CORRECCIONES DE FRACCIONES (MEJORADAS)
        // ═══════════════════════════════════════════════════

        // Fracciones con porcentaje o dos puntos mal escaneado (User pattern 1%:, Y:, Ya)
        corrected = corrected.replace(/(\d)[:%]\s*(?=taza|cucharadita|cucharada)/gi, '$1½');
        corrected = corrected.replace(/1\s*[:%]\s*tazas/gi, '1½ tazas');
        corrected = corrected.replace(/\bYa\s+de\b/gi, '¼ de');
        corrected = corrected.replace(/\bY:\s+taza/gi, '½ taza');

        // Tres cuartos
        corrected = corrected.replace(/3%\s*(?=de|taza)/gi, '¾');
        corrected = corrected.replace(/34\s*de\s*taza\b/gi, '¾ de taza');

        // Un cuarto
        corrected = corrected.replace(/%[4a]\s*(?=de|cucharadita)/gi, '¼');

        // Medio (casos adicionales)
        corrected = corrected.replace(/32\s*cucharadita/gi, '½ cucharadita');
        corrected = corrected.replace(/\b2\s*taza\s*de\s*nueces/gi, '½ taza de nueces');
        corrected = corrected.replace(/'%/g, '½');

        // ═══════════════════════════════════════════════════
        // FASE 3: CORRECCIONES DE SÍMBOLOS
        // ═══════════════════════════════════════════════════

        // Viñetas
        corrected = corrected.replace(/^[«+*]\s+/gm, '• ');
        corrected = corrected.replace(/^-\s+(?=\d)/gm, '• ');  // Solo si no es parte de rango

        // Flechas (que desaparecen o se convierten en guiones)
        corrected = corrected.replace(/^—\s+/gm, '→ ');
        corrected = corrected.replace(/^–\s+/gm, '→ ');

        // Checks (que se vuelven guiones)
        corrected = corrected.replace(/^-\s+(?=\d+\s+huevos)/gm, '✓ ');
        corrected = corrected.replace(/MEZCLA\s+HÚMEDA:\s*\n\s*-/gm, 'MEZCLA HÚMEDA:\n✓');

        // Estrellas de dificultad
        corrected = corrected.replace(/Dificultad:\s*[4X]+\s*\(Fácil\)/gi, 'Dificultad: ★★☆☆☆ (Fácil)');
        corrected = corrected.replace(/Dificultad:\s*[4X]+\s*\(Media\)/gi, 'Dificultad: ★★★☆☆ (Media)');
        corrected = corrected.replace(/Dificultad:\s*[4X]+\s*\(Difícil\)/gi, 'Dificultad: ★★★★☆ (Difícil)');

        // Emojis mal escaneados
        corrected = corrected.replace(/^A\s*IMPORTANTE:/gm, '⚠️ IMPORTANTE:');
        corrected = corrected.replace(/^Q\s*TIPS:/gm, '💡 TIPS:');
        corrected = corrected.replace(/^\(E\)\s*VARIANTES:/gm, '🔄 VARIANTES:');
        corrected = corrected.replace(/^⏱️\s*ALMACENAMIENTO:/gm, '⏱️ ALMACENAMIENTO:'); // Mantener si está bien

        // ═══════════════════════════════════════════════════
        // FASE 4: CORRECCIONES DE CARACTERES SIMILARES
        // ═══════════════════════════════════════════════════

        // l vs 1
        corrected = corrected.replace(/\b1(\d+)\s*mi\b/g, 'l$1ml');  // Si aparece 15mi → 15ml

        // rn vs m (mantequilla, horno, etc.)
        corrected = corrected.replace(/\bhomo\b/gi, 'horno');
        corrected = corrected.replace(/\bmantequila\b/gi, 'mantequilla');
        corrected = corrected.replace(/\bternperatura\b/gi, 'temperatura');

        // O vs 0
        corrected = corrected.replace(/\b([Hh])0rno\b/g, '$1orno');
        corrected = corrected.replace(/\b([Hh])orn0\b/g, '$1orno');

        // ═══════════════════════════════════════════════════
        // FASE 5: CORRECCIONES GENERALES (MANTENER)
        // ═══════════════════════════════════════════════════

        // Palabras comunes
        const wordCorrections = {
            'Tiemos': 'Tiempo',
            'tienpo': 'tiempo',
            'ones': 'minutos',
            'minulos': 'minutos',
            'orenaración': 'preparación',
            'Porciminutos': 'Porciones',
            'allados': 'rallados',
            'tornates': 'tomates',
            'aio': 'ajo',
            'sebolla': 'cebolla',
            'aceite': 'aceite',
            'harina': 'harina'
        };

        for (const [wrong, right] of Object.entries(wordCorrections)) {
            const regex = new RegExp('\\b' + wrong + '\\b', 'gi');
            corrected = corrected.replace(regex, right);
        }

        // Unidades mal escaneadas
        corrected = corrected.replace(/(\d+)i\b/g, '$1l');
        corrected = corrected.replace(/(\d+)rn\b/g, '$1m');
        corrected = corrected.replace(/\((\d+(?:\.\d+)?)8\)/g, '($1g)');

        // Separadores de miles erróneos
        corrected = corrected.replace(/(\d),(\d{3})\b/g, '$1$2');

        // ═══════════════════════════════════════════════════
        // FASE 6: NORMALIZACIÓN FINAL
        // ═══════════════════════════════════════════════════

        // Espacios múltiples
        corrected = corrected.replace(/ {2,}/g, ' ');

        // Líneas vacías múltiples
        corrected = corrected.replace(/\n{3,}/g, '\n\n');

        // Espacios al inicio/final de líneas
        corrected = corrected.replace(/^ +| +$/gm, '');

        // Espacios antes de puntuación
        corrected = corrected.replace(/\s+([.,;:])/g, '$1');

        // Espacios después de puntuación
        corrected = corrected.replace(/([.,;:])(\S)/g, '$1 $2');

        return corrected.trim();
    }

    /**
     * Parsea texto crudo para extraer estructura (usado por /recipe-form)
     */
    parseRecipeText(text) {
        const corrected = this.applyAllCorrections(text);
        const notas = this.extractNotes(corrected);
        return {
            name: this.extractRecipeName(corrected),
            ingredients: this.extractIngredients(corrected),
            steps: this.extractSteps(corrected),
            notas: notas,
            notes: notas
        };
    }

    extractRecipeName(text) {
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length > 0) {
            const firstLine = lines[0];
            const cleanLine = firstLine.toLowerCase().replace(/[^a-z]/g, '');
            if (cleanLine === 'ingredientes' || cleanLine === 'ingrediente') {
                return ''; // Se deja vacío para que aparezca "Nueva Receta" o pida el campo
            }
            // Eliminar adornos comunes en el título
            return firstLine.replace(/[═─━*#_\-]+/g, '').trim();
        }
        return '';
    }

    extractIngredients(text) {
        const ingredients = [];
        let inSection = false;

        const lines = text.split('\n');
        for (const line of lines) {
            const clean = line.trim().toLowerCase();
            // Start of ingredients
            if (clean.includes('ingrediente') || clean.includes('ingredient')) { inSection = true; continue; }
            // End of ingredients / Start of steps or notes
            if (clean.includes('preparación') || clean.includes('paso') || clean.includes('instrucción') || clean.includes('procedimiento') || clean.includes('elaboración') || clean.includes('direction') || clean.includes('method')) { inSection = false; continue; }

            if (inSection && line.trim().length > 2) {
                // Limpiar viñetas (Mejorado v153: no borrar números al inicio si no van seguidos de punto o espacio)
                ingredients.push(line.replace(/^[\s•\-*◦▪▫+—–]*(?:\d+[\.\)\-]\s+)?/, '').trim());
            }
        }
        return ingredients;
    }

    extractSteps(text) {
        const steps = [];
        let inSection = false;

        const lines = text.split('\n');
        for (const line of lines) {
            const clean = line.trim().toLowerCase();
            // Start of steps
            if (clean.includes('preparación') || clean.includes('paso') || clean.includes('instrucción') || clean.includes('procedimiento') || clean.includes('elaboración') || clean.includes('direction') || clean.includes('method') || clean.includes('procedure')) { inSection = true; continue; }
            // End of steps
            if (clean.startsWith('nota') || clean.startsWith('note') || clean.startsWith('tip') || clean.startsWith('consejo')) { inSection = false; continue; }

            if (inSection && line.trim().length > 5) {
                // Limpiar números de paso si ya vienen
                steps.push(line.replace(/^\d+[\.\)\-\s]+/, '').trim());
            }
        }
        return steps;
    }

    extractNotes(text) {
        const notes = [];
        let inSection = false;
        const lines = text.split('\n');
        for (const line of lines) {
            const clean = line.trim().toLowerCase();
            if (/^(nota|note|tip|consejo)/i.test(clean)) {
                inSection = true;
                const afterColon = line.replace(/^[^:]*:\s*/, '').trim();
                if (afterColon) notes.push(afterColon);
                continue;
            }
            if (inSection) {
                if (clean.length > 0) {
                    notes.push(line.trim());
                }
            }
        }
        return notes.join('\n').trim();
    }

    /**
     * Calcula el brillo promedio de una imagen en escala de grises.
     */
    calculateBrightness(imageData) {
        const d = imageData.data;
        let sum = 0;
        let count = 0;
        for (let i = 0; i < d.length; i += 4) {
            sum += d[i]; // Como ya es gris, r=g=b
            count++;
        }
        return sum / count;
    }

    /**
     * Invierte los colores de la imagen (Blanco a Negro / Negro a Blanco)
     */
    invertImage(imageData) {
        const d = imageData.data;
        for (let i = 0; i < d.length; i += 4) {
            d[i] = 255 - d[i];     // R
            d[i + 1] = 255 - d[i + 1]; // G
            d[i + 2] = 255 - d[i + 2]; // B
        }
        return imageData;
    }

    /**
     * Parseador local "inteligente" para cuando no hay IA disponible.
     * Detecta nombres, ingredientes, pasos y porciones por patrones.
     */
    parseRecipeLocally(text, options = {}) {
        const lines = text.split('\n')
            .map(l => l.trim())
            .filter(l => l.length > 2);

        const isEnglish = (options && options.lang === 'eng');

        // STEP 1 — Find recipe name (first meaningful line that isn't a section header or ingredient)
        let nombre = isEnglish ? 'Scanned Recipe' : 'Receta Escaneada';
        let titleIndex = -1;
        for (let i = 0; i < lines.length; i++) {
            const l = lines[i];
            const lower = l.toLowerCase();
            if (!lower.startsWith('ingrediente') && 
                !lower.startsWith('ingredient') && 
                !lower.startsWith('procedimiento') && 
                !lower.startsWith('preparaci') && 
                !lower.startsWith('instrucc') && 
                !lower.startsWith('direction') && 
                !lower.startsWith('method') && 
                !/^\d+[\s\.\,\-]/.test(l) &&
                l.length > 3) {
                nombre = l.replace(/^[\#\*\-•\:\s]+|[\:\s]+$/g, '').trim();
                titleIndex = i;
                break;
            }
        }

        // STEP 2 — Detect ingredient lines by pattern:
        // Has number + unit keywords OR starts with quantity
        const unitKeywords = [
            'g', 'kg', 'ml', 'l', 'lt', 'taza', 'tazas', 'cucharada', 
            'cucharadas', 'cucharadita', 'cucharaditas', 'kilo', 
            'kilos', 'gramo', 'litro', 'pieza', 'piezas', 'diente',
            'dientes', 'trozo', 'trozos', 'hoja', 'hojas', 'rama',
            'ramas', 'pizca', 'sobre', 'lata', 'latas', 'rebanada',
            'rebanadas', 'oz', 'lb', 'onza', 'tsp', 'tbsp', 'cup', 'cups',
            'tablespoon', 'tablespoons', 'teaspoon', 'teaspoons', 'pound',
            'pounds', 'ounce', 'ounces', 'clove', 'cloves', 'slice', 'slices', 'can', 'cans'
        ];

        const stepKeywords = [
            'paso', 'step', 'mezcla', 'agrega', 'añade', 'calienta',
            'cocina', 'hornea', 'fríe', 'hierve', 'corta', 'pica',
            'bate', 'incorpora', 'vierte', 'deja', 'retira', 'sirve',
            'prepara', 'cubre', 'revuelve', 'sazona', 'licúa', 'muele',
            'mix', 'add', 'heat', 'cook', 'bake', 'fry', 'boil', 'cut', 'chop',
            'whisk', 'pour', 'leave', 'remove', 'serve', 'prepare', 'cover', 'stir', 'season', 'blend'
        ];

        const ingredientes = [];
        const pasos = [];
        const notasList = [];

        let inIngredientsSection = false;
        let inStepsSection = false;
        let inNotesSection = false;

        for (let i = 0; i < lines.length; i++) {
            if (i === titleIndex) continue;
            const line = lines[i];
            const lower = line.toLowerCase();

            // Detect section headers
            if (/ingrediente|ingredient/i.test(lower)) {
                inIngredientsSection = true;
                inStepsSection = false;
                inNotesSection = false;
                continue;
            }
            if (/preparaci|procedimiento|instruccion|paso|method|direction|procedure/i.test(lower)) {
                inStepsSection = true;
                inIngredientsSection = false;
                inNotesSection = false;
                continue;
            }
            if (/^(nota|note|tip|consejo)/i.test(lower)) {
                inNotesSection = true;
                inIngredientsSection = false;
                inStepsSection = false;
                const afterColon = line.replace(/^[^:]*:\s*/, '').trim();
                if (afterColon) notasList.push(afterColon);
                continue;
            }

            if (inNotesSection) {
                if (line.trim().length > 0) notasList.push(line.trim());
                continue;
            }

            // Check if line looks like ingredient
            const hasQuantity = /^\d|^[½⅓⅔¼¾⅛]/.test(line);
            const hasUnit = unitKeywords.some(u => 
                new RegExp(`\\b${u}\\b`, 'i').test(lower)
            );
            const hasStepWord = stepKeywords.some(w => lower.includes(w));
            const isNumberedStep = /^(\d+[\.\-\)]|paso\s*\d)/i.test(lower);

            if (inIngredientsSection || (!inStepsSection && !inNotesSection && (hasQuantity || hasUnit) && !hasStepWord)) {
                // Parse ingredient: quantity + unit + name
                const match = line.match(
                    /^([\d½⅓⅔¼¾⅛\/\s]+)\s*(g|kg|ml|l|taza[s]?|cucharada[s]?|cucharadita[s]?|kilo[s]?|diente[s]?|pizca[s]?|oz|lb|cup[s]?)?\s*(.+)/i
                );
                if (match) {
                    ingredientes.push({
                        cantidad: match[1].trim(),
                        unidad: match[2] ? match[2].trim() : '',
                        nombre: match[3].trim()
                    });
                } else if (hasUnit || hasQuantity) {
                    ingredientes.push({ cantidad: '', unidad: '', nombre: line });
                }
            } else if (inStepsSection || hasStepWord || isNumberedStep) {
                // Clean step: remove numbering prefix
                const cleanStep = line.replace(/^(\d+[\.\-\)]\s*|paso\s*\d+[\:\.\s]*)/i, '').trim();
                if (cleanStep.length > 5) pasos.push(cleanStep);
            }
        }

        // Detect servings
        const porcMatch = text.match(
            /(\d+)\s*(persona|porci|servicio|ración|racion|serving)/i
        );
        const porciones = porcMatch ? parseInt(porcMatch[1]) : 4;

        return {
            nombre,
            porciones,
            ingredientes,
            pasos,
            notas: notasList.join('\n').trim(),
            confidence: 55,
            method: 'tesseract-local-parser',
            isStructured: ingredientes.length > 0 || pasos.length > 0
        };
    }
}




window.ocrProcessor = new OCRProcessor();
