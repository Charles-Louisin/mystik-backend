// Code à ajouter dans routes/messages.js pour améliorer le traitement des devinettes avec FormData

// Logs détaillés pour la devinette
console.log('=== DONNÉES DE DEVINETTE REÇUES ===');
console.log('req.body.riddle:', req.body.riddle);
console.log('req.body.riddleQuestion:', req.body.riddleQuestion);
console.log('req.body.riddleAnswer:', req.body.riddleAnswer);
console.log('================================');

// Traitement spécial pour la devinette
let riddleData = null;

// Cas 1: riddle est une chaîne JSON
if (req.body.riddle && typeof req.body.riddle === 'string') {
  try {
    riddleData = JSON.parse(req.body.riddle);
    console.log('Devinette parsée depuis JSON string:', riddleData);
  } catch (error) {
    console.error('Erreur de parsing de la devinette:', error);
  }
} 
// Cas 2: riddle est déjà un objet
else if (req.body.riddle && typeof req.body.riddle === 'object') {
  riddleData = req.body.riddle;
  console.log('Devinette reçue comme objet:', riddleData);
}
// Cas 3: riddleQuestion et riddleAnswer sont fournis séparément
else if (req.body.riddleQuestion && req.body.riddleAnswer) {
  riddleData = {
    question: req.body.riddleQuestion,
    answer: req.body.riddleAnswer
  };
  console.log('Devinette construite à partir des champs séparés:', riddleData);
}

// Plus loin dans le code, lors de la création du message:

// Ajouter la devinette si elle existe
if (riddleData && riddleData.question && riddleData.answer) {
  console.log('Ajout de la devinette au message:', riddleData);
  newMessage.clues.riddle = {
    question: riddleData.question,
    answer: riddleData.answer
  };
}

// Dans la réponse:
hasRiddle: !!(riddleData && riddleData.question && riddleData.answer), 