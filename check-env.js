// Script pour vérifier les variables d'environnement sur Railway
const dotenv = require('dotenv');
const path = require('path');

// Charger les variables d'environnement
dotenv.config({ path: path.resolve(__dirname, '.env') });

console.log('=== VÉRIFICATION DES VARIABLES D\'ENVIRONNEMENT ===');
console.log('NODE_ENV:', process.env.NODE_ENV || 'Non défini');
console.log('PORT:', process.env.PORT || 'Non défini');

// Vérifier MONGODB_URI
console.log('\n=== MONGODB_URI ===');
if (process.env.MONGODB_URI) {
  console.log('MONGODB_URI est défini');
  console.log('Longueur:', process.env.MONGODB_URI.length);
  console.log('Début de l\'URI:', process.env.MONGODB_URI.substring(0, 20) + '...');
  
  // Vérifier si l'URI est valide
  if (process.env.MONGODB_URI.startsWith('mongodb')) {
    console.log('Format de l\'URI semble correct');
  } else {
    console.log('ATTENTION: Format de l\'URI semble incorrect');
  }
} else {
  console.log('ERREUR: MONGODB_URI n\'est pas défini');
}

// Lister toutes les variables liées à MongoDB
console.log('\n=== VARIABLES LIÉES À MONGODB ===');
const mongoVars = Object.keys(process.env).filter(key => key.includes('MONGO'));
if (mongoVars.length > 0) {
  console.log('Variables trouvées:', mongoVars.join(', '));
} else {
  console.log('Aucune variable liée à MongoDB trouvée');
}

// Lister toutes les variables d'environnement (sans valeurs sensibles)
console.log('\n=== TOUTES LES VARIABLES D\'ENVIRONNEMENT ===');
const allVars = Object.keys(process.env);
console.log(`${allVars.length} variables trouvées:`);
allVars.forEach(key => {
  // Ne pas afficher les valeurs des variables sensibles
  if (key.includes('SECRET') || key.includes('KEY') || key.includes('PASSWORD') || key.includes('URI')) {
    console.log(`- ${key}: [Valeur masquée]`);
  } else {
    console.log(`- ${key}: ${process.env[key]}`);
  }
}); 