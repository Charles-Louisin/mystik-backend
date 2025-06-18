// Test pour vérifier l'envoi de devinette avec audio
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

// Configuration
const API_URL = 'http://localhost:5000'; // Port mis à jour
const RECIPIENT_LINK = '@Charles'; // Remplacez par un lien de destinataire valide

// Fonction de test
async function testAudioRiddle() {
  try {
    console.log('=== TEST D\'ENVOI DE MESSAGE AVEC AUDIO ET DEVINETTE ===');
    
    // Créer un fichier audio de test s'il n'existe pas déjà
    const testAudioPath = path.join(__dirname, 'test_audio.webm');
    if (!fs.existsSync(testAudioPath)) {
      console.log('Création d\'un fichier audio de test...');
      // Créer un fichier binaire vide de 1KB
      const buffer = Buffer.alloc(1024);
      fs.writeFileSync(testAudioPath, buffer);
      console.log('Fichier audio de test créé');
    }
    
    // Créer un FormData
    const formData = new FormData();
    
    // Ajouter les données de base
    formData.append('recipientLink', RECIPIENT_LINK);
    formData.append('content', 'Ceci est un message de test avec audio et devinette');
    formData.append('emotionalFilter', 'joie');
    
    // Ajouter les informations cachées
    formData.append('nickname', 'Testeur');
    formData.append('hint', 'Indice de test');
    formData.append('emoji', '🧪');
    
    // Ajouter la devinette
    console.log('Ajout de la devinette au FormData - TEST');
    const riddleQuestion = 'Quelle est la couleur du cheval blanc d\'Henri IV?';
    const riddleAnswer = 'blanc';
    
    // Ajouter les champs séparément
    formData.append('riddleQuestion', riddleQuestion);
    formData.append('riddleAnswer', riddleAnswer);
    
    // Ajouter aussi en tant qu'objet JSON stringifié
    const riddle = {
      question: riddleQuestion,
      answer: riddleAnswer
    };
    formData.append('riddle', JSON.stringify(riddle));
    
    // Logs détaillés pour déboguer
    console.log('Devinette - Question:', riddleQuestion);
    console.log('Devinette - Réponse:', riddleAnswer);
    console.log('Devinette - JSON:', JSON.stringify(riddle));
    
    // Ajouter le message vocal
    formData.append('voiceMessage', fs.createReadStream(testAudioPath));
    formData.append('voiceFilter', 'normal');
    
    console.log('Envoi de la requête...');
    
    // Envoyer la requête
    const response = await axios.post(`${API_URL}/api/messages/send`, formData, {
      headers: {
        ...formData.getHeaders()
      }
    });
    
    console.log('Réponse reçue:', response.data);
    
    // Vérifier si la devinette a été correctement traitée
    if (response.data.details && response.data.details.hasRiddle) {
      console.log('✅ TEST RÉUSSI: La devinette a été correctement traitée!');
    } else {
      console.log('❌ TEST ÉCHOUÉ: La devinette n\'a pas été correctement traitée.');
    }
    
    // Récupérer le message créé pour vérifier que la devinette est bien enregistrée
    if (response.data.messageId) {
      try {
        console.log('Vérification du message enregistré...');
        
        // Cette partie nécessiterait une authentification, donc on simule juste la vérification
        console.log('Pour vérifier complètement, vous devriez récupérer le message depuis la base de données');
        console.log('et vérifier que message.clues.riddle contient bien la question et la réponse.');
      } catch (error) {
        console.error('Erreur lors de la vérification du message:', error);
      }
    }
    
    return response.data;
  } catch (error) {
    console.error('Erreur lors du test:', error.message);
    if (error.response) {
      console.error('Détails de l\'erreur:', error.response.data);
    }
    throw error;
  }
}

// Exécuter le test
testAudioRiddle()
  .then(() => {
    console.log('Test terminé');
  })
  .catch((error) => {
    console.error('Test échoué:', error);
  }); 