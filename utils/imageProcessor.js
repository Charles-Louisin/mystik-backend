/**
 * Utilitaire pour traiter les images
 * Pour l'instant c'est un stub - à implémenter si nécessaire
 */

/**
 * Traite une image (redimensionnement, compression, etc.)
 * @param {Buffer} imageBuffer - Buffer de l'image à traiter
 * @returns {Promise<Buffer>} - Buffer de l'image traitée
 */
const processImage = async (imageBuffer) => {
  // Pour l'instant, on retourne simplement l'image d'origine
  return imageBuffer;
};

module.exports = { processImage }; 