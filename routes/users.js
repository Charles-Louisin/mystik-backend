const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Message = require('../models/Message');
const auth = require('../middleware/auth');

// @route   GET /api/users
// @desc    Get all users (for testing only)
// @access  Private/Admin
router.get('/', auth, async (req, res) => {
  try {
    const users = await User.find().select('-password');
    res.json(users);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erreur serveur');
  }
});

// @route   GET /api/users/me/keys
// @desc    Get user's reveal keys
// @access  Private
router.get('/me/keys', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('revealKeys');
    
    if (!user) {
      return res.status(404).json({ msg: 'Utilisateur non trouvé' });
    }
    
    res.json({ revealKeys: user.revealKeys });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erreur serveur');
  }
});

// @route   GET /api/users/public/:uniqueLink
// @desc    Get user public profile by uniqueLink
// @access  Public
router.get('/public/:uniqueLink', async (req, res) => {
  try {
    let uniqueLink = req.params.uniqueLink;
    
    // Ajouter @ si nécessaire
    if (!uniqueLink.startsWith('@')) {
      uniqueLink = `@${uniqueLink}`;
    }
    
    const user = await User.findOne({ 
      uniqueLink: uniqueLink 
    }).select('uniqueLink profileImage emotionalProfile');

    if (!user) {
      return res.status(404).json({ msg: 'Utilisateur non trouvé' });
    }

    res.json(user);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erreur serveur');
  }
});

// @route   PUT /api/users/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', auth, async (req, res) => {
  const {
    profileImage,
    phoneNumber,
    location
  } = req.body;

  // Build profile object
  const profileFields = {};
  if (profileImage) profileFields.profileImage = profileImage;
  if (phoneNumber) profileFields.phoneNumber = phoneNumber;
  if (location) profileFields.location = location;

  try {
    let user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ msg: 'Utilisateur non trouvé' });
    }

    // Update
    user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: profileFields },
      { new: true }
    ).select('-password');

    res.json(user);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erreur serveur');
  }
});

// @route   PUT /api/users/reveal-keys
// @desc    Update user reveal keys
// @access  Private
router.put('/reveal-keys', auth, async (req, res) => {
  const { operation, amount } = req.body;

  if (!operation || !amount || (operation !== 'add' && operation !== 'subtract')) {
    return res.status(400).json({ msg: 'Opération invalide' });
  }

  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ msg: 'Utilisateur non trouvé' });
    }

    if (operation === 'add') {
      user.revealKeys += amount;
    } else if (operation === 'subtract') {
      if (user.revealKeys < amount) {
        return res.status(400).json({ msg: 'Pas assez de clés' });
      }
      user.revealKeys -= amount;
    }

    await user.save();
    res.json({ revealKeys: user.revealKeys });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erreur serveur');
  }
});

// @route   POST /api/users/reveal-keys
// @desc    Get reveal keys through various methods
// @access  Private
router.post('/earn-keys', auth, async (req, res) => {
  try {
    const { method } = req.body;
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ msg: 'Utilisateur non trouvé' });
    }

    let keysToAdd = 0;

    switch (method) {
      case 'ad':
        keysToAdd = 1;
        break;
      case 'referral':
        keysToAdd = 3;
        break;
      case 'social_share':
        keysToAdd = 2;
        break;
      case 'premium':
        keysToAdd = 10;
        // Logique pour le paiement premium ici
        user.premium = true;
        break;
      default:
        return res.status(400).json({ msg: 'Méthode non valide' });
    }

    user.revealKeys += keysToAdd;
    await user.save();

    res.json({
      revealKeys: user.revealKeys
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erreur serveur');
  }
});

// @route   PUT /api/users/premium
// @desc    Update user premium status
// @access  Private
router.put('/premium', auth, async (req, res) => {
  const { premium } = req.body;

  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ msg: 'Utilisateur non trouvé' });
    }

    user.premium = premium;
    await user.save();

    res.json({ premium: user.premium });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erreur serveur');
  }
});

// @route   PUT /api/users/emotional-profile
// @desc    Update user emotional profile
// @access  Private
router.put('/emotional-profile', auth, async (req, res) => {
  const { traits } = req.body;

  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ msg: 'Utilisateur non trouvé' });
    }

    user.emotionalProfile = {
      traits,
      lastUpdated: Date.now()
    };

    await user.save();
    res.json(user.emotionalProfile);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erreur serveur');
  }
});

// @route   GET /api/users/emotional-profile
// @desc    Generate emotional profile based on received messages
// @access  Private
router.get('/generate-profile', auth, async (req, res) => {
  try {
    const messages = await Message.find({ recipient: req.user.id });
    
    // Simuler une analyse du profil émotionnel basée sur les messages
    const emotionalTraits = [];
    
    const emotions = messages.map(msg => msg.emotionalFilter);
    const emotionCounts = {};
    
    emotions.forEach(emotion => {
      emotionCounts[emotion] = (emotionCounts[emotion] || 0) + 1;
    });
    
    // Déterminer les traits dominants
    if (emotionCounts['amour'] > (messages.length * 0.3)) {
      emotionalTraits.push('Tu inspires l\'amour');
    }
    
    if (emotionCounts['admiration'] > (messages.length * 0.2)) {
      emotionalTraits.push('Les gens t\'admirent');
    }
    
    if (emotionCounts['joie'] > (messages.length * 0.25)) {
      emotionalTraits.push('Tu fais sourire les autres');
    }
    
    // Ajouter un trait par défaut si aucun n'est détecté
    if (emotionalTraits.length === 0) {
      emotionalTraits.push('Tu es mystérieux');
    }
    
    // Mettre à jour le profil émotionnel de l'utilisateur
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { 
        emotionalProfile: {
          traits: emotionalTraits,
          lastUpdated: new Date()
        }
      },
      { new: true }
    );
    
    res.json(user.emotionalProfile);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erreur serveur');
  }
});

// @route   GET /api/users/check/:uniqueLink
// @desc    Check if a uniqueLink exists
// @access  Public
router.get('/check/:uniqueLink', async (req, res) => {
  try {
    let uniqueLink = req.params.uniqueLink;
    
    // Standardiser le format avec @
    if (!uniqueLink.startsWith('@')) {
      uniqueLink = `@${uniqueLink}`;
    }
    
    const user = await User.findOne({ uniqueLink: uniqueLink });
    
    if (user) {
      res.json({
        exists: true,
        uniqueLink: user.uniqueLink
      });
    } else {
      res.json({ exists: false });
    }
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erreur serveur');
  }
});

// @route   GET /api/users/search
// @desc    Search users by username or uniqueLink
// @access  Public
router.get('/search', async (req, res) => {
  try {
    const searchQuery = req.query.q;
    
    if (!searchQuery || searchQuery.trim().length < 2) {
      return res.status(400).json({ msg: 'Le terme de recherche doit contenir au moins 2 caractères' });
    }
    
    // Recherche par nom d'utilisateur ou par lien unique (sans tenir compte de la casse)
    const searchRegex = new RegExp(searchQuery, 'i');
    
    const users = await User.find({
      $or: [
        { username: searchRegex },
        { uniqueLink: searchRegex }
      ]
    }).select('username uniqueLink profileImage').limit(10);
    
    res.json(users);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erreur serveur');
  }
});

// @route   POST /api/users/masks
// @desc    Add a custom mask to user
// @access  Private
router.post('/masks', auth, async (req, res) => {
  try {
    const { name, imageUrl, isPremium } = req.body;

    if (!name || !imageUrl) {
      return res.status(400).json({ msg: 'Nom et image requis' });
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ msg: 'Utilisateur non trouvé' });
    }

    // Vérifier si l'utilisateur peut ajouter un masque premium
    if (isPremium && !user.premium) {
      return res.status(403).json({ msg: 'Abonnement premium requis pour ce masque' });
    }

    // Créer le nouveau masque
    const newMask = {
      name,
      imageUrl,
      isPremium: isPremium || false,
      active: false
    };

    user.customMasks.push(newMask);
    await user.save();

    res.json(user.customMasks);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erreur serveur');
  }
});

// @route   GET /api/users/masks
// @desc    Get all user masks
// @access  Private
router.get('/masks', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ msg: 'Utilisateur non trouvé' });
    }

    res.json(user.customMasks);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erreur serveur');
  }
});

// @route   PUT /api/users/masks/:maskId/activate
// @desc    Set a mask as active
// @access  Private
router.put('/masks/:maskId/activate', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ msg: 'Utilisateur non trouvé' });
    }

    // Désactiver tous les masques
    user.customMasks.forEach(mask => {
      mask.active = false;
    });

    // Trouver et activer le masque spécifié
    const maskIndex = user.customMasks.findIndex(
      mask => mask._id.toString() === req.params.maskId
    );

    if (maskIndex === -1) {
      return res.status(404).json({ msg: 'Masque non trouvé' });
    }

    user.customMasks[maskIndex].active = true;
    await user.save();

    res.json(user.customMasks);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erreur serveur');
  }
});

// @route   DELETE /api/users/masks/:maskId
// @desc    Delete a mask
// @access  Private
router.delete('/masks/:maskId', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ msg: 'Utilisateur non trouvé' });
    }

    // Filtrer pour supprimer le masque
    user.customMasks = user.customMasks.filter(
      mask => mask._id.toString() !== req.params.maskId
    );

    await user.save();
    res.json(user.customMasks);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erreur serveur');
  }
});

// @route   PUT /api/users/emotional-radar
// @desc    Toggle emotional radar setting
// @access  Private
router.put('/emotional-radar', auth, async (req, res) => {
  try {
    const { enabled } = req.body;

    if (enabled === undefined) {
      return res.status(400).json({ msg: 'Paramètre "enabled" requis' });
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ msg: 'Utilisateur non trouvé' });
    }

    user.localEmotionalRadar = {
      enabled: enabled,
      lastUpdated: new Date()
    };

    await user.save();

    res.json(user.localEmotionalRadar);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erreur serveur');
  }
});

// @route   POST /api/users/favorite/:messageId
// @desc    Add a message to favorites
// @access  Private
router.post('/favorite/:messageId', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const message = await Message.findOne({
      _id: req.params.messageId,
      recipient: req.user.id
    });

    if (!user) {
      return res.status(404).json({ msg: 'Utilisateur non trouvé' });
    }

    if (!message) {
      return res.status(404).json({ msg: 'Message non trouvé' });
    }

    // Vérifier si le message est déjà en favori
    if (user.favoriteMessages.includes(req.params.messageId)) {
      return res.status(400).json({ msg: 'Message déjà en favori' });
    }

    user.favoriteMessages.push(req.params.messageId);
    await user.save();

    res.json(user.favoriteMessages);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erreur serveur');
  }
});

// @route   DELETE /api/users/favorite/:messageId
// @desc    Remove a message from favorites
// @access  Private
router.delete('/favorite/:messageId', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ msg: 'Utilisateur non trouvé' });
    }

    // Filtrer pour supprimer des favoris
    user.favoriteMessages = user.favoriteMessages.filter(
      id => id.toString() !== req.params.messageId
    );

    await user.save();
    res.json(user.favoriteMessages);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erreur serveur');
  }
});

// @route   GET /api/users/favorites
// @desc    Get all favorite messages
// @access  Private
router.get('/favorites', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ msg: 'Utilisateur non trouvé' });
    }

    const favoriteMessages = await Message.find({
      _id: { $in: user.favoriteMessages }
    }).sort({ createdAt: -1 });

    res.json(favoriteMessages);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erreur serveur');
  }
});

module.exports = router; 