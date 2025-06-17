const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  try {
    // Récupérer le token du header
    let token = req.header('x-auth-token');
    
    // Vérifier aussi le format Authorization: Bearer token
    if (!token && req.header('Authorization')) {
      const authHeader = req.header('Authorization');
      // Le format est "Bearer TOKEN"
      if (authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }
    
    if (!token) {
      return res.status(401).json({ msg: 'Pas de token, autorisation refusée' });
    }

    // Vérifier et décoder le token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Ajouter l'utilisateur à la requête
    req.user = decoded.user;
    
    next();
  } catch (err) {
    res.status(401).json({ msg: 'Token non valide' });
  }
};