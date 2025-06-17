const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const multer = require('multer');

// Routes
const authRoutes = require('./routes/auth');
const messageRoutes = require('./routes/messages');
const userRoutes = require('./routes/users');

// Configuration
dotenv.config({ path: path.resolve(__dirname, '.env') });
const app = express();
const PORT = process.env.PORT || 5000;

// Vérification des variables d'environnement
console.log('MongoDB URI:', process.env.MONGODB_URI);
console.log('Port:', PORT);

// Middleware
// Utiliser notre middleware CORS personnalisé
const corsMiddleware = require('./middleware/cors');
app.use(corsMiddleware);

// Garder cors comme fallback pour la compatibilité
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Pour parser application/x-www-form-urlencoded

// Database connection
mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
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
  })
  .catch(err => {
    console.error('Erreur de connexion à MongoDB:', err);
    process.exit(1); // Arrêter le serveur en cas d'échec de connexion
  });

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/users', userRoutes);

// Route de base
app.get('/', (req, res) => {
  res.send('API Mystik fonctionne correctement');
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

// Démarrage du serveur
app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});