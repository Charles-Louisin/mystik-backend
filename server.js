const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const multer = require('multer');
const fs = require('fs');

// Routes
const authRoutes = require('./routes/auth');
const messageRoutes = require('./routes/messages');
const userRoutes = require('./routes/users');

// Configuration
dotenv.config({ path: path.resolve(__dirname, '.env') });
const app = express();
const PORT = process.env.PORT || 5000;

// Vérification des variables d'environnement
console.log('MongoDB URI:', process.env.MONGODB_URI ? process.env.MONGODB_URI.substring(0, 20) + '...' : 'Non défini');
console.log('MongoDB URL:', process.env.MONGODB_URL ? process.env.MONGODB_URL.substring(0, 20) + '...' : 'Non défini');
console.log('Port:', PORT);
console.log('Environnement:', process.env.NODE_ENV || 'development');
console.log('Variables disponibles:', Object.keys(process.env).filter(key => key.includes('MONGO')).join(', '));

// Middleware pour la journalisation des requêtes
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.originalUrl} - ${res.statusCode} - ${duration}ms`);
  });
  next();
});

// Middleware pour gérer les erreurs CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Middleware CORS personnalisé
const corsMiddleware = require('./middleware/cors');
app.use(corsMiddleware);

// Garder cors comme fallback pour la compatibilité
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' })); // Pour parser application/x-www-form-urlencoded

// Middleware pour gérer les erreurs de parsing JSON
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'JSON invalide' });
  }
  next(err);
});

// Créer le dossier uploads s'il n'existe pas
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('Dossier uploads créé');
}

// Fonction pour se connecter à MongoDB avec retry
async function connectWithRetry(retries = 5, delay = 5000) {
  let lastError;
  
  for (let i = 0; i < retries; i++) {
    try {
      // Vérifier les deux variables d'environnement possibles
      const mongoUri = process.env.MONGODB_URI || process.env.MONGODB_URL;
      
      if (!mongoUri) {
        throw new Error("Variable d'environnement MONGODB_URI ou MONGODB_URL non définie");
      }
      
      await mongoose.connect(mongoUri, {
        serverSelectionTimeoutMS: 5000, // Timeout après 5s
        socketTimeoutMS: 45000, // Fermer les sockets après 45s d'inactivité
      });
      
    console.log('Connexion à MongoDB établie');
    
    // Vérifier que la base de données est bien créée
    try {
      // Récupérer les collections existantes
      const collections = await mongoose.connection.db.listCollections().toArray();
      
      if (collections.length === 0) {
        console.log('Base de données vide, initialisation des collections...');
        
        // Créer les collections principales si elles n'existent pas
        await mongoose.connection.db.createCollection('users');
        await mongoose.connection.db.createCollection('messages');
        
        console.log('Collections créées avec succès');
      } else {
        console.log('Collections existantes:', collections.map(c => c.name).join(', '));
      }
    } catch (err) {
      console.error('Erreur lors de la vérification des collections:', err);
    }
      
      return; // Sortir de la fonction si la connexion réussit
    } catch (err) {
      console.error(`Tentative de connexion ${i+1}/${retries} échouée:`, err.message);
      lastError = err;
      
      if (i < retries - 1) {
        console.log(`Nouvelle tentative dans ${delay/1000} secondes...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  console.error('Toutes les tentatives de connexion ont échoué:', lastError);
  
  // En production, ne pas quitter le processus mais continuer avec une base de données non disponible
  if (process.env.NODE_ENV === 'production') {
    console.warn('Serveur démarré sans connexion à la base de données en mode production');
  } else {
    process.exit(1); // Arrêter le serveur en cas d'échec de connexion en développement
  }
}

// Appeler la fonction de connexion
connectWithRetry();

// Gérer les erreurs de connexion MongoDB après la connexion initiale
mongoose.connection.on('error', err => {
  console.error('Erreur MongoDB:', err);
});

mongoose.connection.on('disconnected', () => {
  console.warn('Déconnecté de MongoDB, tentative de reconnexion...');
  connectWithRetry(3, 3000);
  });

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/users', userRoutes);

// Route de base
app.get('/', (req, res) => {
  res.send('API Mystik fonctionne correctement');
});

// Route pour vérifier l'état du serveur (health check)
app.get('/api/health', (req, res) => {
  const health = {
    uptime: process.uptime(),
    timestamp: Date.now(),
    status: 'UP',
    memory: process.memoryUsage(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  };
  
  res.json(health);
});

// Route pour vérifier l'état de la base de données
app.get('/api/status', async (req, res) => {
  try {
    // Vérifier la connexion à MongoDB
    if (mongoose.connection.readyState !== 1) {
      return res.status(500).json({ 
        status: 'error', 
        message: 'Non connecté à MongoDB',
        readyState: mongoose.connection.readyState
      });
    }
    
    // Récupérer des informations sur la base de données
    const collections = await mongoose.connection.db.listCollections().toArray();
    const dbName = mongoose.connection.db.databaseName;
    
    res.json({
      status: 'ok',
      database: {
        name: dbName,
        collections: collections.map(c => c.name),
        connection: 'Établie'
      }
    });
  } catch (error) {
    console.error('Erreur lors de la vérification du statut:', error);
    res.status(500).json({ 
      status: 'error', 
      message: error.message 
    });
  }
});

// Middleware pour gérer les routes non trouvées
app.use((req, res, next) => {
  res.status(404).json({ error: `Route non trouvée: ${req.originalUrl}` });
});

// Middleware de gestion des erreurs
app.use((err, req, res, next) => {
  console.error('Erreur non gérée:', err);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Erreur interne du serveur' : err.message,
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack
  });
});

// Démarrage du serveur avec gestion des erreurs
const server = app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});

// Gérer les erreurs du serveur
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Le port ${PORT} est déjà utilisé. Tentative avec le port ${PORT + 1}...`);
    setTimeout(() => {
      server.close();
      app.listen(PORT + 1, () => {
        console.log(`Serveur démarré sur le port ${PORT + 1} (port alternatif)`);
      });
    }, 1000);
  } else {
    console.error('Erreur du serveur:', err);
  }
});

// Gérer les signaux d'arrêt proprement
process.on('SIGTERM', async () => {
  console.log('Signal SIGTERM reçu. Arrêt gracieux...');
  server.close(async () => {
    try {
      await mongoose.connection.close();
      console.log('Connexion MongoDB fermée');
      process.exit(0);
    } catch (err) {
      console.error('Erreur lors de la fermeture de la connexion MongoDB:', err);
      process.exit(1);
    }
  });
});

process.on('SIGINT', async () => {
  console.log('Signal SIGINT reçu. Arrêt gracieux...');
  server.close(async () => {
    try {
      await mongoose.connection.close();
      console.log('Connexion MongoDB fermée');
      process.exit(0);
    } catch (err) {
      console.error('Erreur lors de la fermeture de la connexion MongoDB:', err);
      process.exit(1);
    }
  });
});

// Gérer les rejets de promesses non gérées
process.on('unhandledRejection', (reason, promise) => {
  console.error('Promesse rejetée non gérée:', reason);
  // En production, ne pas quitter le processus
  if (process.env.NODE_ENV !== 'production') {
    // process.exit(1);
  }
});

// Gérer les exceptions non gérées
process.on('uncaughtException', (err) => {
  console.error('Exception non gérée:', err);
  // En production, ne pas quitter le processus immédiatement
  if (process.env.NODE_ENV !== 'production') {
    // process.exit(1);
  }
});