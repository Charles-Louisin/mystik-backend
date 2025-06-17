const corsMiddleware = (req, res, next) => {
  // Déterminer l'origine autorisée
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:5000',
    process.env.FRONTEND_URL
  ].filter(Boolean);
  
  const origin = req.headers.origin;
  
  // Vérifier si l'origine est autorisée ou utiliser '*' comme fallback
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    // Pour les requêtes qui ne nécessitent pas de credentials, on peut utiliser '*'
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  // Configuration spéciale pour les requêtes de fichiers audio
  if (req.path.includes('/voice-message') || req.path.includes('/audio')) {
    // Pour les fichiers audio, on n'utilise pas credentials: 'include'
    // donc on peut utiliser '*' pour l'origine
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    // Ajouter les en-têtes de cache pour les fichiers audio
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.setHeader('Vary', 'Origin');
  }
  
  // Headers standards pour CORS
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  // Gérer les requêtes OPTIONS (preflight)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
};

module.exports = corsMiddleware; 