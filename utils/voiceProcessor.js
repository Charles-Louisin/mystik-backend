const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const util = require('util');
const execPromise = util.promisify(exec);

/**
 * Applique un filtre vocal à un fichier audio
 * @param {string} inputPath - Chemin du fichier audio d'origine
 * @param {string} outputPath - Chemin du fichier audio traité
 * @param {string} filterType - Type de filtre à appliquer (normal, robot, grave, aiguë, alien, anonyme)
 * @returns {Promise<void>}
 */
const processVoice = async (inputPath, outputPath, filterType = 'normal') => {
  try {
    // Vérifier que ffmpeg est installé
    try {
    await execPromise('which ffmpeg');
    } catch (ffmpegError) {
      console.warn('FFMPEG n\'est pas installé sur ce système. Le traitement des effets audio ne sera pas disponible.');
      console.warn('Pour installer ffmpeg sur Ubuntu/Debian: sudo apt-get install ffmpeg');
      console.warn('Pour installer ffmpeg sur MacOS: brew install ffmpeg');
      console.warn('Pour installer ffmpeg sur Windows: téléchargez-le depuis https://ffmpeg.org/download.html');
      
      // Continuer sans ffmpeg, juste copier le fichier
      fs.copyFileSync(inputPath, outputPath);
      return outputPath;
    }
    
    let ffmpegCommand = '';
    
    switch (filterType) {
      case 'robot':
        // Effet robotique avec modulation de la voix
        ffmpegCommand = `ffmpeg -i "${inputPath}" -af "aecho=0.8:0.88:60:0.4,asetrate=44100*0.9,atempo=1.1,aresample=44100" "${outputPath}"`;
        break;
        
      case 'grave':
        // Voix plus grave
        ffmpegCommand = `ffmpeg -i "${inputPath}" -af "asetrate=44100*0.8,atempo=1.25,aresample=44100" "${outputPath}"`;
        break;
        
      case 'aiguë':
        // Voix plus aiguë
        ffmpegCommand = `ffmpeg -i "${inputPath}" -af "asetrate=44100*1.4,atempo=0.7,aresample=44100" "${outputPath}"`;
        break;
        
      case 'alien':
        // Effet extraterrestre
        ffmpegCommand = `ffmpeg -i "${inputPath}" -af "aecho=0.8:0.88:60:0.6,asetrate=44100*1.3,atempo=0.75,aresample=44100,vibrato=5:0.5" "${outputPath}"`;
        break;
        
      case 'anonyme':
        // Brouillage complet pour anonymisation
        ffmpegCommand = `ffmpeg -i "${inputPath}" -af "rubberband=pitch=1.5,chorus=0.5:0.9:50|60|40:0.4|0.32|0.3:0.25|0.4|0.3:2|2.3|1.3,asetrate=44100*0.95,atempo=1.1,aresample=44100" "${outputPath}"`;
        break;
        
      case 'normal':
      default:
        // Copie simple sans traitement (mais convertit au format wav si nécessaire)
        ffmpegCommand = `ffmpeg -i "${inputPath}" -c:a aac -b:a 128k "${outputPath}"`;
        break;
    }
    
    try {
    // Exécuter la commande ffmpeg
    await execPromise(ffmpegCommand);
      console.log(`Audio traité avec succès avec le filtre "${filterType}"`);
    } catch (cmdError) {
      console.error('Erreur lors de l\'exécution de la commande ffmpeg:', cmdError);
      // En cas d'échec, simplement copier le fichier original
      fs.copyFileSync(inputPath, outputPath);
    }
    
    return outputPath;
  } catch (error) {
    console.error('Erreur générale lors du traitement audio:', error);
    
    // Si le traitement échoue pour une raison quelconque, copier simplement le fichier
    try {
      if (!fs.existsSync(outputPath) && fs.existsSync(inputPath)) {
      fs.copyFileSync(inputPath, outputPath);
      }
    } catch (copyError) {
      console.error('Erreur lors de la copie du fichier audio:', copyError);
    }
    
    return outputPath;
  }
};

module.exports = { processVoice }; 