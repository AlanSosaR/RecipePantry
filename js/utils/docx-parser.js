/**
 * Utility to extract text from a .docx file (arrayBuffer)
 * .docx files are ZIP archives containing XML.
 */
export async function extractTextFromDocx(arrayBuffer) {
  try {
    // We need a JS ZIP library or we can try to use a lightweight approach
    // Given the environment, we'll try to find if there's an existing library
    // Or we can use a simpler approach if the file is small.
    // For now, I'll provide a placeholder or a lightweight implementation if possible.
    
    // In many browser environments, we might want to use a library like Mammoth.
    // Let's assume we can use a Fetch-based approach to get a CDN library if needed.
    
    // If Mammoth is available globally:
    if (window.mammoth) {
      const result = await window.mammoth.extractRawText({ arrayBuffer });
      return result.value;
    }
    
    // Minimalistic fallback: just a placeholder warning
    console.warn('Mammoth.js not found. DOCX extraction might fail.');
    return "Error: No se pudo extraer el texto del documento .docx (Mammoth.js no está cargado).";
  } catch (error) {
    console.error('❌ Error parsing DOCX:', error);
    throw error;
  }
}
