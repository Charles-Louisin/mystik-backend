// Code à ajouter à la fin du fichier models/Message.js, juste avant module.exports

// Hook pre-save pour vérifier et corriger la structure de la devinette
MessageSchema.pre('save', function(next) {
  console.log('Pre-save hook: vérification de la structure de la devinette');
  
  // Si nous avons des données de devinette mais pas dans la structure attendue
  if (this.clues) {
    console.log('Structure actuelle de clues:', JSON.stringify(this.clues));
    
    // Si riddle est null mais que nous avons riddleQuestion et riddleAnswer
    if (!this.clues.riddle && this._doc.riddleQuestion && this._doc.riddleAnswer) {
      console.log('Reconstruction de la devinette à partir de riddleQuestion et riddleAnswer');
      this.clues.riddle = {
        question: this._doc.riddleQuestion,
        answer: this._doc.riddleAnswer
      };
    }
    
    // Vérifier si la devinette est bien structurée
    if (this.clues.riddle && (!this.clues.riddle.question || !this.clues.riddle.answer)) {
      console.log('Structure de devinette incorrecte, tentative de correction');
      
      // Si riddle est une chaîne, essayer de la parser
      if (typeof this.clues.riddle === 'string') {
        try {
          const parsedRiddle = JSON.parse(this.clues.riddle);
          if (parsedRiddle.question && parsedRiddle.answer) {
            this.clues.riddle = parsedRiddle;
            console.log('Devinette parsée avec succès:', this.clues.riddle);
          }
        } catch (error) {
          console.error('Erreur lors du parsing de la devinette:', error);
        }
      }
    }
    
    console.log('Structure finale de clues.riddle:', this.clues.riddle);
  }
  
  next();
}); 