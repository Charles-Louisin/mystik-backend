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

module.exports = mongoose.model('Message', MessageSchema); 