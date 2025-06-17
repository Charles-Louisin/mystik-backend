const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { check, validationResult } = require('express-validator');

// @route   POST /api/auth/register
// @desc    Register user and get token
// @access  Public
router.post('/register', [
  check('username', 'Nom d\'utilisateur requis').notEmpty(),
  check('username', 'Le nom d\'utilisateur doit contenir entre 3 et 30 caractères').isLength({ min: 3, max: 30 }),
  check('phone', 'Numéro de téléphone valide requis').notEmpty(),
  check('password', 'Mot de passe de 6 caractères minimum requis').isLength({ min: 6 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { username, phone, password } = req.body;

  try {
    // Vérifier si l'utilisateur existe déjà
    let userByPhone = await User.findOne({ phoneNumber: phone });
    if (userByPhone) {
      return res.status(400).json({ msg: 'Ce numéro de téléphone est déjà utilisé' });
    }
    
    // Vérifier si le nom d'utilisateur existe déjà
    let userByUsername = await User.findOne({ username });
    if (userByUsername) {
      return res.status(400).json({ msg: 'Ce nom d\'utilisateur est déjà pris' });
    }

    // Créer un nouvel utilisateur
    user = new User({
      username,
      phoneNumber: phone,
      password,
    });

    // Sauvegarder l'utilisateur
    await user.save();

    // Générer un JWT
    const payload = {
      user: {
        id: user.id
      }
    };

    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: '7d' },
      (err, token) => {
        if (err) throw err;
        res.json({
          token,
          user: {
            id: user.id,
            username: user.username,
            uniqueLink: user.uniqueLink,
          }
        });
      }
    );
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erreur serveur');
  }
});

// @route   POST /api/auth/check-username
// @desc    Check if username is available
// @access  Public
router.post('/check-username', async (req, res) => {
  const { username } = req.body;
  
  if (!username || username.length < 3) {
    return res.json({ available: false, message: 'Le nom d\'utilisateur doit contenir au moins 3 caractères' });
  }
  
  try {
    const user = await User.findOne({ username });
    if (user) {
      return res.json({ available: false, message: 'Ce nom d\'utilisateur est déjà pris' });
    }
    
    res.json({ available: true });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erreur serveur');
  }
});

// @route   GET /api/auth/check-username/:username
// @desc    Check if username is available (GET method)
// @access  Public
router.get('/check-username/:username', async (req, res) => {
  const { username } = req.params;
  
  if (!username || username.length < 3) {
    return res.json({ available: false, message: 'Le nom d\'utilisateur doit contenir au moins 3 caractères' });
  }
  
  try {
    const user = await User.findOne({ username });
    if (user) {
      return res.json({ available: false, message: 'Ce nom d\'utilisateur est déjà pris' });
    }
    
    res.json({ available: true });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erreur serveur');
  }
});

// @route   POST /api/auth/check-phone
// @desc    Check if phone number is available
// @access  Public
router.post('/check-phone', async (req, res) => {
  const { phone } = req.body;
  
  if (!phone) {
    return res.json({ available: false, message: 'Numéro de téléphone requis' });
  }
  
  try {
    const user = await User.findOne({ phoneNumber: phone });
    if (user) {
      return res.json({ available: false, message: 'Ce numéro de téléphone est déjà utilisé' });
    }
    
    res.json({ available: true });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erreur serveur');
  }
});

// @route   GET /api/auth/check-phone/:phone
// @desc    Check if phone number is available (GET method)
// @access  Public
router.get('/check-phone/:phone', async (req, res) => {
  const { phone } = req.params;
  
  if (!phone) {
    return res.json({ available: false, message: 'Numéro de téléphone requis' });
  }
  
  try {
    const user = await User.findOne({ phoneNumber: phone });
    if (user) {
      return res.json({ available: false, message: 'Ce numéro de téléphone est déjà utilisé' });
    }
    
    res.json({ available: true });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erreur serveur');
  }
});

// @route   POST /api/auth/login
// @desc    Authenticate user & get token
// @access  Public
router.post('/login', async (req, res) => {
  const { phone, password } = req.body;

  try {
    // Vérifier si l'utilisateur existe
    let user = await User.findOne({ phoneNumber: phone });

    if (!user) {
      return res.status(400).json({ msg: 'Identifiants invalides' });
    }

    // Vérifier le mot de passe
    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
      return res.status(400).json({ msg: 'Identifiants invalides' });
    }

    // Générer un JWT
    const payload = {
      user: {
        id: user.id
      }
    };

    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: '7d' },
      (err, token) => {
        if (err) throw err;
        res.json({
          token,
          user: {
            id: user.id,
            username: user.username,
            uniqueLink: user.uniqueLink,
          }
        });
      }
    );
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erreur serveur');
  }
});

// @route   GET /api/auth/me
// @desc    Get authenticated user
// @access  Private
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json({ user });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erreur serveur');
  }
});

module.exports = router; 