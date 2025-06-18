/**
 * Utilitaire pour gérer les types MIME des fichiers
 */

// Fonction pour déterminer le type MIME d'un fichier audio en fonction de son extension
const getAudioMimeType = (filename) => {
  if (!filename) return 'audio/mpeg'; // Type par défaut
  
  const ext = filename.toLowerCase().split('.').pop();
  
  const mimeTypes = {
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'ogg': 'audio/ogg',
    'webm': 'audio/webm',
    'mp4': 'audio/mp4',
    'm4a': 'audio/mp4',
    'aac': 'audio/aac',
    'flac': 'audio/flac'
  };
  
  return mimeTypes[ext] || 'audio/mpeg';
};

// Fonction pour vérifier si un type MIME est un format audio
const isAudioMimeType = (mimeType) => {
  if (!mimeType) return false;
  
  const audioMimeTypes = [
    'audio/mpeg',
    'audio/wav',
    'audio/ogg',
    'audio/webm',
    'audio/mp4',
    'audio/aac',
    'audio/flac',
    'video/webm'
  ];
  
  return audioMimeTypes.includes(mimeType) || mimeType.startsWith('audio/');
};

// Fonction pour obtenir les extensions de fichier acceptées pour l'audio
const getAcceptedAudioExtensions = () => {
  return ['.mp3', '.wav', '.ogg', '.webm', '.mp4', '.m4a', '.aac', '.flac'];
};

module.exports = {
  getAudioMimeType,
  isAudioMimeType,
  getAcceptedAudioExtensions
}; 