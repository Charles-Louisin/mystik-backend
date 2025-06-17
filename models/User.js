const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 30
  },
  phoneNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  uniqueLink: {
    type: String,
    unique: true
  },
  profileImage: {
    type: String,
    default: null
  },
  location: {
    country: String,
    city: String,
    default: {}
  },
  revealedSenders: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  }],
  revealKeys: {
    type: Number,
    default: 0
  },
  premium: {
    type: Boolean,
    default: false
  },
  emotionalProfile: {
    traits: [String],
    lastUpdated: Date
  },
  publicMessages: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  }],
  achievements: [{
    type: {
      type: String,
      enum: ['referral', 'share', 'ad_view', 'login_streak']
    },
    date: {
      type: Date,
      default: Date.now
    },
    details: mongoose.Schema.Types.Mixed
  }],
  favoriteMessages: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  }],
  customMasks: [{
    name: String,
    imageUrl: String,
    isPremium: {
      type: Boolean,
      default: false
    },
    active: {
      type: Boolean,
      default: false
    }
  }],
  localEmotionalRadar: {
    enabled: {
      type: Boolean,
      default: true
    },
    lastUpdated: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Hash du mot de passe avant sauvegarde
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    
    // Création du lien unique basé sur le username
    if (!this.uniqueLink && this.username) {
      this.uniqueLink = `@${this.username}`;
    }
    
    next();
  } catch (error) {
    next(error);
  }
});

// Méthode pour comparer les mots de passe
UserSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw error;
  }
};

module.exports = mongoose.model('User', UserSchema); 