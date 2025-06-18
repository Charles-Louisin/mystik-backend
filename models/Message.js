const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  sender: {
    nickname: {
      type: String,
      default: 'Anonyme'
    },
    ipAddress: String,
    location: {
      country: String,
      city: String
    },
    identityRevealed: {
      type: Boolean,
      default: false
    },
    nameDiscovered: {
      type: Boolean,
      default: false
    },
    // Changer la définition pour utiliser userId pour l'ID et realUser comme booléen
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    realUser: {
      type: Boolean,
      default: false
    },
    partialInfo: {
      firstLetter: String,
      blurredImage: String,
      approximateLocation: String
    }
  },
  content: {
    type: String,
    required: true
  },
  emotionalFilter: {
    type: String,
    enum: ['amour', 'colère', 'admiration', 'regret', 'joie', 'tristesse', 'neutre'],
    default: 'neutre'
  },
  clues: {
    hint: String,
    emoji: String,
    riddle: {
      question: String,
      answer: String
    },
    discoveredHints: [{
      type: {
        type: String,
        enum: ['letter_0', 'letter_1', 'letter_2', 'letter_3', 'letter_4', 'letter_5', 'letter_6', 'letter_7', 
               'letter_8', 'letter_9', 'letter_10', 'length', 'word_count', 'location', 'emoji', 'hint', 
               'riddle_success', 'sender_hint', 'partial_name']
      },
      value: String,
      description: String
    }]
  },
  revealCondition: {
    type: {
      type: String,
      enum: ['devinette', 'mini-jeu', 'défi', 'paiement', 'clé', 'aucune'],
      default: 'aucune'
    },
    details: mongoose.Schema.Types.Mixed,
    completed: {
      type: Boolean,
      default: false
    }
  },
  customMask: {
    type: String,
    default: null
  },
  scheduled: {
    isScheduled: {
      type: Boolean,
      default: false
    },
    revealDate: Date
  },
  isPublic: {
    type: Boolean,
    default: false
  },
  likes: {
    type: Number,
    default: 0
  },
  aiAnalysis: {
    emotionalIntent: String,
    summary: String,
    suggestionForReply: String
  },
  read: {
    type: Boolean,
    default: false
  },
  recipientLink: {
    type: String,
    required: true
  },
  isRead: {
    type: Boolean,
    default: false
  },
  hasVoiceMessage: {
    type: Boolean,
    default: false
  },
  voiceMessagePath: String,
  voiceFilter: {
    type: String,
    enum: ['normal', 'robot', 'grave', 'aiguë', 'alien', 'anonyme'],
    default: 'normal'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

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

module.exports = mongoose.model('Message', MessageSchema); 