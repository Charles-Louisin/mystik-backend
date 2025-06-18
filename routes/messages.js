const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const User = require('../models/User');
const auth = require('../middleware/auth');
const jwt = require('jsonwebtoken');
const { processImage } = require('../utils/imageProcessor');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { processVoice } = require('../utils/voiceProcessor');
const mongoose = require('mongoose');

// Configuration de multer pour les fichiers audio
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'voice-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// Importer l'utilitaire pour vérifier les types MIME audio
const { isAudioMimeType } = require('../utils/mimeTypes');

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    console.log('Type MIME du fichier téléchargé:', file.mimetype);
    
    if (isAudioMimeType(file.mimetype)) {
      cb(null, true);
    } else {
      console.error('Type de fichier non autorisé:', file.mimetype);
      cb(new Error(`Seuls les fichiers audio sont acceptés. Type reçu: ${file.mimetype}`), false);
    }
  }
});

// Importer le service OpenAI pour l'analyse des messages
const openAIService = require('../utils/openaiTest');

// Fonction de fallback pour générer une analyse sans OpenAI
function generateFallbackAnalysis(content, emotion) {
  // Déterminer l'intention émotionnelle basée sur l'émotion choisie
  let emotionalIntent = "";
  let summary = "";
  let suggestionForReply = "";
  
  switch(emotion) {
    case 'amour':
      emotionalIntent = "L'expéditeur semble exprimer des sentiments d'affection ou d'attachement profond.";
      summary = "Ce message contient une expression sincère de sentiments positifs et d'attachement.";
      suggestionForReply = "Tu pourrais répondre avec gratitude et partager tes propres sentiments si tu te sens à l'aise.";
      break;
    case 'colère':
      emotionalIntent = "L'expéditeur semble frustré ou en colère à propos d'une situation.";
      summary = "Ce message exprime du mécontentement ou de la frustration.";
      suggestionForReply = "Tu pourrais répondre avec empathie tout en gardant ton calme, et proposer une discussion constructive.";
      break;
    case 'admiration':
      emotionalIntent = "L'expéditeur semble t'admirer ou valoriser tes qualités.";
      summary = "Ce message exprime du respect et de l'admiration.";
      suggestionForReply = "Tu pourrais remercier l'expéditeur pour ses mots gentils et reconnaître ses propres qualités.";
      break;
    case 'regret':
      emotionalIntent = "L'expéditeur semble exprimer des remords ou des excuses.";
      summary = "Ce message contient des sentiments de regret ou de nostalgie.";
      suggestionForReply = "Tu pourrais répondre avec compréhension et, si approprié, offrir ton pardon ou ton soutien.";
      break;
    case 'joie':
      emotionalIntent = "L'expéditeur semble heureux et enthousiaste.";
      summary = "Ce message exprime de la joie et de l'enthousiasme.";
      suggestionForReply = "Tu pourrais partager sa joie et répondre avec un ton également positif et enjoué.";
      break;
    case 'tristesse':
      emotionalIntent = "L'expéditeur semble triste ou mélancolique.";
      summary = "Ce message exprime de la tristesse ou de la mélancolie.";
      suggestionForReply = "Tu pourrais offrir ton soutien et ton empathie, et peut-être proposer ton aide.";
      break;
    default:
      emotionalIntent = "L'intention émotionnelle n'est pas clairement définie.";
      summary = "Ce message a un ton neutre ou mixte.";
      suggestionForReply = "Tu pourrais répondre de manière équilibrée en reflétant le ton du message.";
  }
  
  // Adapter l'analyse au contenu du message
  const contentLength = content.length;
  if (contentLength < 50) {
    summary += " (message court et concis)";
  } else if (contentLength > 200) {
    summary += " (message détaillé et élaboré)";
  }
  
  // Vérifier si le message contient des questions
  if (content.includes('?')) {
    suggestionForReply += " N'oublie pas de répondre aux questions posées.";
  }
  
  // Vérifier les mots-clés dans le contenu pour personnaliser davantage
  const lowerContent = content.toLowerCase();
  
  if (lowerContent.includes('merci') || lowerContent.includes('remercie')) {
    emotionalIntent += " Il y a une expression de gratitude dans ce message.";
  }
  
  if (lowerContent.includes('désolé') || lowerContent.includes('excuse') || lowerContent.includes('pardon')) {
    emotionalIntent += " L'expéditeur présente des excuses ou exprime des regrets.";
  }
  
  if (lowerContent.includes('urgent') || lowerContent.includes('rapidement') || lowerContent.includes('vite')) {
    summary += " Une réponse rapide semble être attendue.";
  }
  
  return {
    emotionalIntent,
    summary,
    suggestionForReply
  };
}

// @route   POST /api/messages/send
// @desc    Send an anonymous message
// @access  Public
router.post('/send', upload.single('voiceMessage'), async (req, res) => {
  try {
    console.log('Réception de requête POST /api/messages/send');
    console.log('Type de contenu:', req.headers['content-type']);
    console.log('Corps de la requête:', req.body);
    console.log('Fichier reçu:', req.file ? req.file.filename : 'Aucun fichier');
    
    const { 
      recipientLink, 
      content, 
      nickname,
      hint,
      emoji,
      riddle,
      emotionalFilter,
      revealCondition,
      scheduledDate,
      customMask,
      realUserId,
      sendAsAuthenticated
    } = req.body;

    // Validation de base du contenu
    if (!content || content.trim().length < 5) {
      return res.status(400).json({ msg: 'Le message doit contenir au moins 5 caractères' });
    }

    // Vérifier l'authentification si l'utilisateur veut envoyer en tant qu'utilisateur connecté
    let authenticatedUserId = null;
    if (sendAsAuthenticated) {
      // Vérifier si l'en-tête d'autorisation est présent
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ msg: 'Authentification requise pour cette option' });
      }

      // Extraire et vérifier le token
      const token = authHeader.substring(7); // Enlever "Bearer "
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        authenticatedUserId = decoded.user.id;
        
        // Vérifier que l'ID utilisateur fourni correspond à l'utilisateur authentifié
        if (realUserId && realUserId !== authenticatedUserId) {
          return res.status(401).json({ msg: 'ID utilisateur non autorisé' });
        }
      } catch (error) {
        return res.status(401).json({ msg: 'Token non valide' });
      }
    }

    // Trouver le destinataire par son lien unique
    const recipient = await User.findOne({ uniqueLink: recipientLink });
    if (!recipient) {
      return res.status(404).json({ msg: 'Destinataire non trouvé' });
    }

    // Vérifier que l'emotionalFilter est valide
    const validEmotionalFilters = ['amour', 'colère', 'admiration', 'regret', 'joie', 'tristesse', 'neutre'];
    const selectedEmotionalFilter = emotionalFilter && validEmotionalFilters.includes(emotionalFilter) 
      ? emotionalFilter 
      : 'neutre';

    // Créer le message
    const newMessage = new Message({
      recipient: recipient._id,
      recipientLink: recipientLink,
      content: content,
      sender: {
        nickname: nickname || 'Anonyme',
        ipAddress: req.ip,
        location: {
          country: req.body.country || 'Inconnu',
          city: req.body.city || 'Inconnue'
        },
        userId: sendAsAuthenticated && authenticatedUserId ? 
          new mongoose.Types.ObjectId(authenticatedUserId) : 
          (realUserId ? new mongoose.Types.ObjectId(realUserId) : null),
        realUser: !!(sendAsAuthenticated && authenticatedUserId) || !!(realUserId),
        partialInfo: {
          firstLetter: nickname ? nickname.charAt(0) : 'A'
        }
      },
      emotionalFilter: selectedEmotionalFilter,
      clues: {
        hint: hint || null,
        emoji: emoji || null,
        riddle: riddle && riddle.question && riddle.answer ? {
          question: riddle.question,
          answer: riddle.answer
        } : null
      },
      customMask: customMask || null
    });

    // Ajouter la condition de révélation si définie
    if (revealCondition && revealCondition.type) {
      const validRevealTypes = ['devinette', 'mini-jeu', 'défi', 'paiement', 'clé', 'aucune'];
      if (validRevealTypes.includes(revealCondition.type)) {
        newMessage.revealCondition = {
          type: revealCondition.type,
          details: revealCondition.details || {},
          completed: false
        };
      }
    }

    // Ajouter la planification si définie
    if (scheduledDate) {
      try {
        const revealDate = new Date(scheduledDate);
        if (revealDate > new Date()) {
          newMessage.scheduled = {
            isScheduled: true,
            revealDate
          };
        }
      } catch (error) {
        console.error("Erreur de format de date:", error);
      }
    }

    // Enregistrer les données pour le débogage
    console.log("Message créé:", {
      recipientId: recipient._id,
      content: content.substring(0, 20) + "...",
      nickname: nickname || 'Anonyme',
      emotionalFilter: selectedEmotionalFilter,
      emoji: emoji || 'Non défini',
      hint: hint || 'Non défini'
    });

    // Ajouter le message vocal s'il existe
    if (req.file) {
      const voiceFilter = req.body.voiceFilter || 'normal';
      console.log("Fichier audio reçu:", req.file.filename);
      console.log("Filtre vocal:", voiceFilter);
      
      // Ajouter les informations du fichier audio au message selon le schéma existant
      newMessage.hasVoiceMessage = true;
      newMessage.voiceMessagePath = req.file.path;
      newMessage.voiceFilter = voiceFilter;
    }

    // Sauvegarder le message
    await newMessage.save();

    res.json({
      messageId: newMessage._id,
      success: true,
      details: {
        emotionalFilter: selectedEmotionalFilter,
        hasEmoji: !!emoji,
        hasHint: !!hint,
        hasRiddle: !!(riddle && riddle.question && riddle.answer),
        hasVoiceMessage: !!req.file
      }
    });
  } catch (err) {
    console.error("Erreur d'envoi de message:", err);
    
    // Afficher plus de détails sur l'erreur pour le débogage
    if (err.name === 'ValidationError') {
      const validationErrors = {};
      
      // Extraire les messages d'erreur spécifiques
      for (const field in err.errors) {
        validationErrors[field] = err.errors[field].message;
      }
      
      console.error("Erreurs de validation:", validationErrors);
      
      return res.status(400).json({ 
        msg: 'Erreur de validation des données', 
        errors: validationErrors,
        error: err.message
      });
    }
    
    res.status(500).json({ 
      msg: 'Erreur serveur', 
      error: err.message 
    });
  }
});

// @route   GET /api/messages/received
// @desc    Get all messages received by authenticated user
// @access  Private
router.get('/received', auth, async (req, res) => {
  try {
    const messages = await Message.find({ 
      recipient: req.user.id,
      $or: [
        { 'scheduled.isScheduled': false },
        { 'scheduled.revealDate': { $lte: new Date() } }
      ]
    })
    .sort({ createdAt: -1 });

    // Transformer les messages pour assurer que les noms découverts sont correctement affichés
     const processedMessages = messages.map(message => {
       // Créer une copie du message pour pouvoir le modifier
       const processedMessage = message.toObject();
       
       // Ajouter une info si le message vient d'un utilisateur inscrit
       const hasRealUser = processedMessage.sender.realUser;
       
       // Si l'identité a été révélée et le nom découvert, s'assurer que le nom est visible
       if (processedMessage.sender.identityRevealed && processedMessage.sender.nameDiscovered) {
         // Ajouter une propriété displayNickname visible
         processedMessage.sender.displayNickname = processedMessage.sender.nickname;
         // Ajouter un statut pour indiquer que tout est découvert
         processedMessage.sender.revelationStatus = "fully_revealed";
       } else if (processedMessage.sender.identityRevealed && !processedMessage.sender.nameDiscovered) {
         // Si l'identité est révélée mais pas le nom, afficher un message spécial
         processedMessage.sender.displayNickname = processedMessage.sender.nickname;
         // Ajouter un statut pour indiquer qu'il reste le nom d'utilisateur à découvrir
         processedMessage.sender.revelationStatus = "nickname_only";
       } else {
         // Sinon, afficher Anonyme
         processedMessage.sender.displayNickname = "Anonyme";
         processedMessage.sender.revelationStatus = "anonymous";
       }
       
       // Ajouter une propriété pour indiquer si c'est un utilisateur inscrit
       processedMessage.sender.isRegisteredUser = hasRealUser;
       
       return processedMessage;
     });

    res.json(processedMessages);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erreur serveur');
  }
});

// @route   GET /api/messages/scheduled
// @desc    Get future messages count
// @access  Private
router.get('/scheduled', auth, async (req, res) => {
  try {
    const count = await Message.countDocuments({
      recipient: req.user.id,
      'scheduled.isScheduled': true,
      'scheduled.revealDate': { $gt: new Date() }
    });

    res.json({ count });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erreur serveur');
  }
});

// @route   GET /api/messages/scheduled-details
// @desc    Get scheduled messages details for countdown
// @access  Private
router.get('/scheduled-details', auth, async (req, res) => {
  try {
    const messages = await Message.find({
      recipient: req.user.id,
      'scheduled.isScheduled': true,
      'scheduled.revealDate': { $gt: new Date() }
    })
    .select('scheduled createdAt')
    .sort({ 'scheduled.revealDate': 1 });

    res.json({ messages });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erreur serveur');
  }
});

// @route   PATCH /api/messages/:id/read
// @desc    Mark a message as read
// @access  Private
router.patch('/:id/read', auth, async (req, res) => {
  try {
    const message = await Message.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user.id },
      { read: true },
      { new: true }
    );

    if (!message) {
      return res.status(404).json({ msg: 'Message non trouvé' });
    }

    res.json(message);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erreur serveur');
  }
});

// @route   POST /api/messages/:id/reveal
// @desc    Reveal a sender's identity
// @access  Private
router.post('/:id/reveal', auth, async (req, res) => {
  try {
    const { method, answer } = req.body;
    
    console.log(`Révélation d'identité pour le message ${req.params.id} avec la méthode: ${method}`);
    
    // Trouver le message
    const message = await Message.findOne({ 
      _id: req.params.id, 
      recipient: req.user.id
    });
    
    if (!message) {
      return res.status(404).json({ msg: 'Message non trouvé' });
    }
    
    // Si l'identité est déjà révélée, retourner les infos mais masquer le surnom si nameDiscovered est false
    if (message.sender.identityRevealed) {
      console.log("L'identité est déjà révélée, retour des informations");
      return res.json({
        sender: {
          // Le surnom n'est révélé que si nameDiscovered est true
          nickname: message.sender.nameDiscovered ? message.sender.nickname : 'Nom masqué',
          location: message.sender.location,
          identityRevealed: true,
          nameDiscovered: message.sender.nameDiscovered
        }
      });
    }
    
    let authorized = false;
    
    // Vérifier la méthode de révélation
    if (method === 'key') {
      // Vérifier que l'utilisateur a des clés disponibles
      const user = await User.findById(req.user.id);
      
      if (!user) {
        return res.status(404).json({ msg: 'Utilisateur non trouvé' });
      }
      
      if (user.revealKeys <= 0) {
        console.log("L'utilisateur n'a pas de clés disponibles");
        return res.status(400).json({ msg: 'Vous n\'avez pas de clés disponibles' });
      }
      
      // Décrémenter le nombre de clés
      user.revealKeys -= 1;
      await user.save();
      
      console.log(`Clé utilisée, il reste ${user.revealKeys} clés à l'utilisateur`);
      authorized = true;
    } else if (method === 'riddle' && message.clues && message.clues.riddle) {
      // Vérifier la réponse à la devinette
      if (!answer) {
        console.log("Aucune réponse fournie pour la devinette");
        return res.status(400).json({ msg: 'Vous devez fournir une réponse à la devinette' });
      }
      
      const isCorrect = answer.toLowerCase() === message.clues.riddle.answer.toLowerCase();
      
      if (!isCorrect) {
        console.log("Réponse incorrecte à la devinette");
        return res.status(400).json({ msg: 'Réponse incorrecte à la devinette' });
      }
      
      console.log("Réponse correcte à la devinette, révélation autorisée");
      authorized = true;
    } else {
      console.log(`Méthode non reconnue ou non disponible: ${method}`);
      return res.status(400).json({ msg: 'Méthode de révélation non valide' });
    }
    
    if (authorized) {
      // Marquer l'identité comme révélée, mais pas le nom
      message.sender.identityRevealed = true;
      message.sender.nameDiscovered = false;
      
      // Sauvegarder le message
      await message.save();
      
      console.log(`Identité révélée pour le message ${req.params.id}, mais le nom reste masqué`);
      
      // Préparer les indices à retourner
      const discoveredHints = message.discoveredHints || [];
      
      // Si le message n'a pas encore d'indices découverts, on en crée un par défaut
      if (discoveredHints.length === 0 && message.sender.nickname) {
        const nickname = message.sender.nickname;
        
        // Ajouter un indice par défaut: première lettre du surnom
        const defaultHint = {
          type: 'letter_first',
          value: nickname.charAt(0),
          description: 'Première lettre'
        };
        
        message.discoveredHints = [defaultHint];
        await message.save();
        
        console.log("Ajout d'un indice par défaut:", defaultHint);
      }
      
      // Retourner les informations, mais masquer le surnom pour l'affichage
      return res.json({
        sender: {
          nickname: message.sender.nickname, // Renvoyer le vrai surnom pour permettre la vérification côté client
          displayNickname: 'Nom masqué', // Le surnom est masqué dans l'interface jusqu'à ce qu'il soit découvert
          location: message.sender.location,
          identityRevealed: true,
          nameDiscovered: false
        }
      });
    }
    
    res.status(403).json({ msg: 'Non autorisé à révéler cette identité' });
  } catch (err) {
    console.error("Erreur lors de la révélation de l'identité:", err);
    res.status(500).json({ 
      msg: 'Erreur serveur', 
      error: err.message 
    });
  }
});

// @route   POST /api/messages/:id/reveal-partial
// @desc    Reveal partial sender information
// @access  Private
router.post('/:id/reveal-partial', auth, async (req, res) => {
  try {
    const { type, usedHintTypes = [] } = req.body;
    const message = await Message.findOne({ _id: req.params.id, recipient: req.user.id });

    if (!message) {
      return res.status(404).json({ msg: 'Message non trouvé' });
    }

    const user = await User.findById(req.user.id);

    // Vérifier que l'utilisateur a une clé
    if (user.revealKeys <= 0) {
      return res.status(403).json({ msg: 'Vous avez besoin d\'une clé pour cette action' });
    }

    // Générer tous les types d'indices disponibles pour ce message
    const availableHintTypes = [];
    
    // Indices de base toujours disponibles
    availableHintTypes.push('first_letter', 'last_letter');
    
    // Localisation si disponible
    if (message.sender.location && (message.sender.location.country || message.sender.location.city)) {
      availableHintTypes.push('location');
    }
    
    // Emoji si disponible
    if (message.clues && message.clues.emoji) {
      availableHintTypes.push('emoji');
    }
    
    // Indice textuel si disponible
    if (message.clues && message.clues.hint) {
      availableHintTypes.push('hint');
    }
    
    // Indices pour noms composés
    if (message.sender.nickname.includes(' ')) {
      availableHintTypes.push(
        'first_letter_first_word',
        'last_letter_first_word',
        'first_letter_last_word',
        'last_letter_last_word'
      );
    }
    
    // Filtre pour enlever les indices déjà utilisés
    const remainingHintTypes = availableHintTypes.filter(hint => !usedHintTypes.includes(hint));
    
    // Si tous les indices ont été utilisés, envoi d'un message spécial
    if (remainingHintTypes.length === 0) {
      return res.json({
        partialInfo: {
          type: 'all_used',
          value: 'Tous les indices ont été découverts !',
          description: 'Vous avez débloqué tous les indices disponibles'
        },
        hintStats: {
          total: availableHintTypes.length,
          used: usedHintTypes.length,
          remaining: 0
        }
      });
    }
    
    // Sélection du type d'indice
    let selectedType = type;
    
    // Si le type demandé est déjà utilisé ou n'est pas disponible, on en choisit un autre aléatoirement
    if (!type || usedHintTypes.includes(type) || !availableHintTypes.includes(type)) {
      // Sélection aléatoire parmi les indices restants
      const randomIndex = Math.floor(Math.random() * remainingHintTypes.length);
      selectedType = remainingHintTypes[randomIndex];
    }

    // Diminuer le nombre de clés
    user.revealKeys -= 1;
    await user.save();

    // Renvoyer les informations partielles selon le type sélectionné
    let partialInfo = {};
    
    switch(selectedType) {
      case 'first_letter':
        partialInfo = { 
          type: 'first_letter',
          value: message.sender.nickname.charAt(0).toUpperCase(),
          description: 'Première lettre du surnom'
        };
        break;
      case 'last_letter':
        partialInfo = {
          type: 'last_letter',
          value: message.sender.nickname.charAt(message.sender.nickname.length - 1).toUpperCase(),
          description: 'Dernière lettre du surnom'
        };
        break;
      case 'location':
        partialInfo = { 
          type: 'location',
          value: message.sender.location.country || message.sender.location.city || 'Inconnu',
          description: 'Localisation approximative'
        };
        break;
      case 'emoji':
        partialInfo = {
          type: 'emoji',
          value: message.clues.emoji,
          description: 'Emoji représentatif'
        };
        break;
      case 'hint':
        partialInfo = {
          type: 'hint',
          value: message.clues.hint,
          description: 'Indice laissé par l\'expéditeur'
        };
        break;
      case 'first_letter_first_word':
      case 'last_letter_first_word':
      case 'first_letter_last_word':
      case 'last_letter_last_word':
        // Gestion des noms composés
        const words = message.sender.nickname.split(' ');
        const isFirstWord = selectedType.includes('first_word');
        const isFirstLetter = selectedType.includes('first_letter');
        
        const wordIndex = isFirstWord ? 0 : words.length - 1;
        const word = words[wordIndex];
        const letterIndex = isFirstLetter ? 0 : word.length - 1;
        
        partialInfo = {
          type: selectedType,
          value: word.charAt(letterIndex).toUpperCase(),
          description: `${isFirstLetter ? 'Première' : 'Dernière'} lettre du ${isFirstWord ? 'premier' : 'dernier'} mot du surnom composé`
        };
        break;
      default:
        // Cas improbable: renvoyer un indice générique
        partialInfo = {
          type: 'default',
          value: 'Indice mystérieux',
          description: 'Une information cachée'
        };
    }

    // Statistiques sur les indices
    const hintStats = {
      total: availableHintTypes.length,
      used: usedHintTypes.length + 1, // +1 pour l'indice qu'on vient de donner
      remaining: availableHintTypes.length - (usedHintTypes.length + 1)
    };

    res.json({ 
      partialInfo,
      hintStats
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erreur serveur');
  }
});

// @route   POST /api/messages/:id/analyze
// @desc    Analyze a message with AI
// @access  Private
router.post('/:id/analyze', auth, async (req, res) => {
  try {
    // Récupérer le message
    const message = await Message.findOne({ 
      _id: req.params.id, 
      recipient: req.user.id
    });

    if (!message) {
      return res.status(404).json({ msg: 'Message non trouvé' });
    }

    // Récupérer le contenu et l'émotion du message
    const content = message.content;
    const emotion = message.emotionalFilter || 'neutre';
    
    let aiAnalysis = {};
    
    try {
      // Vérifier si le service OpenAI est disponible
      if (openAIService.isServiceAvailable()) {
        // Utiliser le service OpenAI pour analyser le message
        aiAnalysis = await openAIService.analyzeMessage(content, emotion);
        console.log("✅ Analyse OpenAI réussie pour le message:", message._id);
      } else {
        // Fallback si OpenAI n'est pas disponible
        console.log("ℹ️ Service OpenAI non disponible, utilisation de l'analyse fallback");
        aiAnalysis = generateFallbackAnalysis(content, emotion);
      }
    } catch (error) {
      console.error("❌ Erreur lors de l'analyse du message:", error);
      // Utiliser l'analyse de fallback en cas d'erreur
      aiAnalysis = generateFallbackAnalysis(content, emotion);
    }
    
    // Mettre à jour le message avec l'analyse
    message.aiAnalysis = aiAnalysis;
    await message.save();

    res.json({ aiAnalysis });
    
  } catch (err) {
    console.error("Erreur lors de l'analyse du message:", err);
    res.status(500).json({ 
      msg: 'Erreur serveur', 
      error: err.message 
    });
  }
});

// @route   PATCH /api/messages/:id/public
// @desc    Make a message public
// @access  Private
router.patch('/:id/public', auth, async (req, res) => {
  try {
    const message = await Message.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user.id },
      { isPublic: true },
      { new: true }
    );

    if (!message) {
      return res.status(404).json({ msg: 'Message non trouvé' });
    }

    // Ajouter à la liste des messages publics de l'utilisateur
    await User.findByIdAndUpdate(
      req.user.id,
      { $addToSet: { publicMessages: message._id } }
    );

    res.json(message);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erreur serveur');
  }
});

// @route   GET /api/messages/public
// @desc    Get public messages
// @access  Public
router.get('/public', async (req, res) => {
  try {
    const publicMessages = await Message.find({ isPublic: true })
      .sort({ likes: -1, createdAt: -1 })
      .limit(20)
      .populate('recipient', 'uniqueLink');

    res.json(publicMessages);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erreur serveur');
  }
});

// @route   POST /api/messages/:id/like
// @desc    Like a public message
// @access  Public
router.post('/:id/like', async (req, res) => {
  try {
    const message = await Message.findOneAndUpdate(
      { _id: req.params.id, isPublic: true },
      { $inc: { likes: 1 } },
      { new: true }
    );

    if (!message) {
      return res.status(404).json({ msg: 'Message non trouvé ou non public' });
    }

    res.json({ likes: message.likes });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erreur serveur');
  }
});

// @route   POST /api/messages/earn-key
// @desc    Earn a reveal key
// @access  Private
router.post('/earn-key', auth, async (req, res) => {
  try {
    const { method } = req.body;
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ msg: 'Utilisateur non trouvé' });
    }

    // Ajouter une clé basée sur la méthode
    let keyEarned = false;
    let achievementType = '';

    switch (method) {
      case 'ad_view':
        // Simuler la vérification que l'utilisateur a bien vu une publicité
        keyEarned = true;
        achievementType = 'ad_view';
        break;
      case 'referral':
        // Vérifier si un nouveau parrainage a été confirmé
        // Dans un cas réel, on vérifierait dans une table de parrainages
        keyEarned = req.body.referralCompleted === true;
        achievementType = 'referral';
        break;
      case 'share':
        // Simuler la vérification d'un partage sur les réseaux sociaux
        keyEarned = true;
        achievementType = 'share';
        break;
      default:
        return res.status(400).json({ msg: 'Méthode non reconnue' });
    }

    if (keyEarned) {
      user.revealKeys += 1;
      
      // Enregistrer l'achievement
      user.achievements.push({
        type: achievementType,
        date: new Date(),
        details: { method }
      });
      
      await user.save();
      
      return res.json({ 
        success: true, 
        newKeyCount: user.revealKeys,
        message: 'Félicitations! Vous avez gagné une clé de révélation.'
      });
    }

    res.status(400).json({ msg: 'Action non complétée' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erreur serveur');
  }
});

// @route   GET /api/messages/emotional-radar
// @desc    Get emotional radar for local area
// @access  Private
router.get('/emotional-radar', auth, async (req, res) => {
  try {
    // Dans une implémentation réelle, on utiliserait l'IP ou la géolocalisation
    // pour déterminer la région de l'utilisateur
    
    // Pour l'instant, on génère des données fictives
    const emotions = ['amour', 'pardon', 'admiration', 'regret', 'joie'];
    const randomEmotion = emotions[Math.floor(Math.random() * emotions.length)];
    const randomNumber = Math.floor(Math.random() * 10) + 1;
    
    // Récupérer la région depuis les query params, headers ou IP
    const userRegion = req.query.region || 
                       req.headers['x-user-region'] || 
                       'Votre région';
    
    res.json({
      emotion: randomEmotion,
      count: randomNumber,
      region: userRegion,
      message: `${randomNumber} personnes dans ${userRegion} ont reçu un message de ${randomEmotion} aujourd'hui.`
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erreur serveur');
  }
});

// @route   POST /api/messages/:id/notify-sender
// @desc    Notify the sender that their identity has been revealed
// @access  Private
router.post('/:id/notify-sender', auth, async (req, res) => {
  try {
    // Récupérer le message
    const message = await Message.findOne({ 
      _id: req.params.id, 
      recipient: req.user.id,
      'sender.identityRevealed': true // Vérifier que l'identité a bien été révélée
    });

    if (!message) {
      return res.status(404).json({ msg: 'Message non trouvé ou identité non révélée' });
    }

    // Vérifier si l'expéditeur est un utilisateur enregistré
    if (!message.sender.realUser || !message.sender.userId) {
      return res.status(400).json({ msg: "L'expéditeur n'est pas un utilisateur enregistré" });
    }

    // Trouver l'expéditeur dans la base de données
    const sender = await User.findById(message.sender.userId);
    
    if (!sender) {
      return res.status(404).json({ msg: 'Expéditeur non trouvé' });
    }

    // Dans une application réelle, on enverrait une notification push ou un e-mail
    // Pour l'instant, on simule cette notification
    console.log(`Notification envoyée à ${sender.username}: Votre identité a été révélée par ${req.user.id}`);

    // On pourrait également enregistrer cette notification dans la base de données
    // pour l'afficher à l'utilisateur lors de sa prochaine connexion
    
    res.json({ success: true, message: 'Notification envoyée avec succès' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erreur serveur');
  }
});

// @route   PATCH /api/messages/:id/name-discovered
// @desc    Update message when nickname is discovered
// @access  Private
router.patch('/:id/name-discovered', auth, async (req, res) => {
  try {
    // Vérifier si le message existe et appartient à l'utilisateur
    const message = await Message.findOne({ 
      _id: req.params.id, 
      recipient: req.user.id 
    });
    
    if (!message) {
      return res.status(404).json({ msg: 'Message non trouvé' });
    }
    
    // Mettre à jour le statut de découverte du surnom
    message.sender.nameDiscovered = true;
    
    await message.save();
    
    res.json({
      success: true,
      message: 'Surnom découvert avec succès',
      sender: {
        nickname: message.sender.nickname,
        nameDiscovered: true
      }
    });
  } catch (err) {
    console.error("Erreur lors de la mise à jour du statut de découverte du surnom:", err.message);
    res.status(500).json({ 
      msg: 'Erreur serveur', 
      error: err.message 
    });
  }
});

// @route   POST /api/messages/:id/check-user-guess
// @desc    Check if the guessed username is the real sender
// @access  Private
router.post('/:id/check-user-guess', auth, async (req, res) => {
  try {
    const { username } = req.body;
    
    if (!username || username.trim() === '') {
      return res.status(400).json({ msg: 'Nom d\'utilisateur non fourni' });
    }
    
    // Récupérer le message
    const message = await Message.findOne({ 
      _id: req.params.id, 
      recipient: req.user.id
    });
    
    if (!message) {
      return res.status(404).json({ msg: 'Message non trouvé' });
    }
    
    // Vérifier si le message a un expéditeur réel
    if (!message.sender.realUser || !message.sender.userId) {
      return res.json({ 
        correct: false, 
        message: "Ce message n'a pas été envoyé par un utilisateur inscrit."
      });
    }
    
    // Logs pour le débogage
    console.log("Vérification de l'utilisateur:");
    console.log("- Nom d'utilisateur soumis:", username);
    console.log("- ID de l'expéditeur réel:", message.sender.userId);
    
    // Normaliser le nom d'utilisateur
    const normalizedUsername = username.trim().toLowerCase().replace(/\s+/g, '');
    
    // Chercher l'utilisateur par son nom d'utilisateur avec une recherche plus flexible
    // D'abord essayer la correspondance exacte
    let guessedUser = await User.findOne({ 
      username: new RegExp(`^${normalizedUsername}$`, 'i') 
    });
    
    // Si l'utilisateur n'est pas trouvé, essayer une recherche par nom similaire
    if (!guessedUser) {
      // Récupérer tous les utilisateurs pour une comparaison plus flexible
      const allUsers = await User.find({});
      
      // Recherche de correspondance approximative
      for (const user of allUsers) {
        const userNormalized = user.username.toLowerCase().replace(/\s+/g, '');
        
        // Vérifier la similitude
        if (
          // Correspondance exacte sans espaces/casse
          userNormalized === normalizedUsername ||
          // Ou le nom d'utilisateur est contenu dans la recherche
          userNormalized.includes(normalizedUsername) ||
          normalizedUsername.includes(userNormalized)
        ) {
          guessedUser = user;
          console.log("Utilisateur trouvé par correspondance approximative:", user.username);
          break;
        }
      }
    }
    
    // Si l'utilisateur n'existe toujours pas après les recherches flexibles
    if (!guessedUser) {
      return res.json({ 
        correct: false, 
        message: "Cet utilisateur n'existe pas dans notre base de données."
      });
    }
    
    // Vérifier si l'utilisateur deviné correspond à l'expéditeur réel
    const correct = message.sender.userId.toString() === guessedUser._id.toString();
    console.log("- Correspondance:", correct);
    
    if (correct) {
      // Mettre à jour le message pour indiquer que l'identité a été révélée
      message.sender.identityRevealed = true;
      message.sender.nameDiscovered = true;
      await message.save();
      
      return res.json({
        correct: true,
        message: "Félicitations ! Vous avez correctement identifié l'expéditeur.",
        sender: {
          nickname: message.sender.nickname,
          username: guessedUser.username,
          location: message.sender.location
        }
      });
    } else {
      return res.json({
        correct: false,
        message: "Ce n'est pas la bonne personne. Cet utilisateur existe mais n'est pas l'expéditeur de ce message."
      });
    }
  } catch (err) {
    console.error("Erreur lors de la vérification de l'utilisateur:", err.message);
    res.status(500).json({ 
      msg: 'Erreur serveur', 
      error: err.message 
    });
  }
});

// @route   GET /api/messages/:id/hint
// @desc    Get a progressive hint about the sender
// @access  Private
router.get('/:id/hint', auth, async (req, res) => {
  try {
    // Récupérer le message
    const message = await Message.findOne({ 
      _id: req.params.id, 
      recipient: req.user.id
    });
    
    if (!message) {
      return res.status(404).json({ msg: 'Message non trouvé' });
    }
    
    // Liste des indices possibles
    const possibleHints = [];
    
    // 1. Première lettre du surnom
    if (message.sender.nickname && message.sender.nickname.length > 0) {
      possibleHints.push({
        type: 'first_letter',
        value: message.sender.nickname.charAt(0).toUpperCase(),
        description: 'Première lettre du surnom'
      });
    }
    
    // 2. Dernière lettre du surnom
    if (message.sender.nickname && message.sender.nickname.length > 1) {
      possibleHints.push({
        type: 'last_letter',
        value: message.sender.nickname.charAt(message.sender.nickname.length - 1).toUpperCase(),
        description: 'Dernière lettre du surnom'
      });
    }
    
    // 3. Emoji laissé par l'expéditeur
    if (message.clues.emoji) {
      possibleHints.push({
        type: 'emoji',
        value: message.clues.emoji,
        description: 'Emoji laissé par l\'expéditeur'
      });
    }
    
    // 4. Indice laissé par l'expéditeur
    if (message.clues.hint) {
      possibleHints.push({
        type: 'hint',
        value: message.clues.hint,
        description: 'Indice laissé par l\'expéditeur'
      });
    }
    
    // 5. Premier mot de la devinette
    if (message.clues.riddle && message.clues.riddle.question) {
      const words = message.clues.riddle.question.split(' ');
      if (words.length > 0) {
        possibleHints.push({
          type: 'riddle_first_word',
          value: words[0],
          description: 'Premier mot de la devinette'
        });
      }
    }
    
    // 6. Première lettre de la réponse à la devinette
    if (message.clues.riddle && message.clues.riddle.answer) {
      possibleHints.push({
        type: 'riddle_answer_first_letter',
        value: message.clues.riddle.answer.charAt(0).toUpperCase(),
        description: 'Première lettre de la réponse à la devinette'
      });
    }
    
    // 7. Dernière lettre de la réponse à la devinette
    if (message.clues.riddle && message.clues.riddle.answer && message.clues.riddle.answer.length > 1) {
      possibleHints.push({
        type: 'riddle_answer_last_letter',
        value: message.clues.riddle.answer.charAt(message.clues.riddle.answer.length - 1).toUpperCase(),
        description: 'Dernière lettre de la réponse à la devinette'
      });
    }
    
    // 8. Longueur de la réponse à la devinette
    if (message.clues.riddle && message.clues.riddle.answer) {
      possibleHints.push({
        type: 'riddle_answer_length',
        value: message.clues.riddle.answer.length,
        description: 'Nombre de lettres dans la réponse à la devinette'
      });
    }
    
    // Si aucun indice n'est disponible
    if (possibleHints.length === 0) {
      return res.json({
        hint: {
          type: 'no_hints',
          value: 'Aucun indice disponible',
          description: 'Aucun indice n\'est disponible pour ce message'
        }
      });
    }
    
    // Choisir un indice aléatoire
    const randomHint = possibleHints[Math.floor(Math.random() * possibleHints.length)];
    
    res.json({ hint: randomHint });
  } catch (err) {
    console.error("Erreur lors de la récupération d'un indice:", err.message);
    res.status(500).json({ 
      msg: 'Erreur serveur', 
      error: err.message 
    });
  }
});

// @route   POST /api/messages/:id/check-riddle
// @desc    Check riddle answer without revealing the sender identity
// @access  Private
router.post('/:id/check-riddle', auth, async (req, res) => {
  try {
    const { answer } = req.body;
    const message = await Message.findOne({ _id: req.params.id, recipient: req.user.id });

    if (!message) {
      return res.status(404).json({ msg: 'Message non trouvé' });
    }

    if (!message.clues.riddle) {
      return res.status(400).json({ msg: 'Ce message ne contient pas de devinette' });
    }
    
    // Ajouter des logs pour vérifier les données
    console.log("Vérification de la devinette:");
    console.log("- Réponse soumise:", answer);
    console.log("- Réponse attendue:", message.clues.riddle.answer);
    console.log("- Surnom de l'expéditeur:", message.sender.nickname);

    // Normalisation des réponses pour la comparaison
    const normalizedAnswer = answer.trim().toLowerCase();
    const normalizedExpected = message.clues.riddle.answer.trim().toLowerCase();
    
    // Comparaison plus flexible pour les réponses
    const isCorrect = normalizedAnswer === normalizedExpected;
    console.log("- Réponse correcte:", isCorrect);

    if (isCorrect) {
      // Générer un indice spécial en récompense
      let hint = null;
      let hintStats = null;
      
      // Récupérer les indices déjà découverts
      const discoveredHints = message.discoveredHints || [];
      const usedHintTypes = discoveredHints.map(hint => hint.type);
      
      // Vérifier si l'utilisateur a déjà beaucoup d'indices
      const letterIndicesCount = usedHintTypes.filter(type => type.startsWith('letter_')).length;
      const nickname = message.sender.nickname;
      const hasReachedLetterLimit = letterIndicesCount >= Math.ceil(nickname.length * 0.7);
      
      // Options d'indices possibles
      const possibleHints = [];
      
      // Indice explicite si disponible (mais jamais le nom complet)
      if (message.clues.hint && !usedHintTypes.includes('hint_from_riddle')) {
        possibleHints.push({
          type: 'hint_from_riddle',
          value: message.clues.hint,
          description: 'Indice laissé par l\'expéditeur'
        });
      }
      
      // Première lettre du surnom si pas déjà révélée
      if (!usedHintTypes.includes('letter_first') && !hasReachedLetterLimit) {
        possibleHints.push({
          type: 'letter_first',
          value: message.sender.nickname.charAt(0).toUpperCase(),
          description: 'Première lettre du surnom'
        });
      }
      
      // Nombre de caractères du surnom si pas déjà révélé
      if (!usedHintTypes.includes('length')) {
        possibleHints.push({
          type: 'length',
          value: `${message.sender.nickname.length} caractères`,
          description: 'Longueur du surnom'
        });
      }
      
      // S'il y a un émoji, on peut le donner aussi si pas déjà révélé
      if (message.clues.emoji && !usedHintTypes.includes('emoji_from_riddle')) {
        possibleHints.push({
          type: 'emoji_from_riddle',
          value: message.clues.emoji,
          description: 'Emoji représentatif'
        });
      }
      
      // Dernière lettre du surnom si pas déjà révélée
      if (!usedHintTypes.includes('letter_last') && !hasReachedLetterLimit) {
        possibleHints.push({
          type: 'letter_last',
          value: message.sender.nickname.charAt(message.sender.nickname.length - 1).toUpperCase(),
          description: 'Dernière lettre du surnom'
        });
      }
      
      // Si le surnom contient des espaces, on peut donner le nombre de mots
      const words = message.sender.nickname.split(/\s+/);
      if (words.length > 1 && !usedHintTypes.includes('word_count')) {
        possibleHints.push({
          type: 'word_count',
          value: `${words.length} mots`,
          description: 'Nombre de mots dans le surnom'
        });
      }
      
      // Si aucun indice n'est disponible, créer un indice de félicitations
      if (possibleHints.length === 0) {
        possibleHints.push({
          type: 'riddle_success',
          value: 'Bravo pour avoir résolu la devinette !',
          description: 'Félicitations'
        });
      }
      
      // Sélection aléatoire d'un indice parmi les possibilités
      const randomIndex = Math.floor(Math.random() * possibleHints.length);
      hint = possibleHints[randomIndex];
      
      // Ajouter l'indice à la liste des indices découverts
      if (!message.discoveredHints) {
        message.discoveredHints = [];
      }
      message.discoveredHints.push(hint);
      await message.save();
      
      // Calculer le nombre total d'indices possibles
      let totalPossibleHints = 0;
      
      // Compter le nombre total d'indices possibles
      totalPossibleHints += 2; // Première et dernière lettre
      totalPossibleHints += Math.max(0, nickname.length - 2); // Lettres du milieu
      totalPossibleHints += 1; // Longueur
      totalPossibleHints += words.length > 1 ? words.length : 0; // Mots composés
      totalPossibleHints += /[^a-zA-Z0-9\s]/.test(nickname) ? 1 : 0; // Caractères spéciaux
      totalPossibleHints += /\d/.test(nickname) ? 1 : 0; // Chiffres
      totalPossibleHints += message.sender.location && message.sender.location.country ? 1 : 0; // Pays
      totalPossibleHints += message.sender.location && message.sender.location.city ? 1 : 0; // Ville
      totalPossibleHints += message.clues && message.clues.hint ? 1 : 0; // Indice de l'expéditeur
      totalPossibleHints += message.clues && message.clues.emoji ? 1 : 0; // Emoji de l'expéditeur
      
      // Statistiques pour la cohérence
      hintStats = {
        total: totalPossibleHints,
        used: message.discoveredHints.length,
        remaining: Math.max(0, totalPossibleHints - message.discoveredHints.length)
      };

      console.log("Indice fourni après réponse correcte:", hint);
      return res.json({
        correct: true,
        hint,
        hintStats
      });
    }

    res.json({
      correct: false,
      message: 'Mauvaise réponse. Essayez à nouveau.'
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erreur serveur');
  }
});

// @route   POST /api/messages/:id/get-hint
// @desc    Get a random hint for a message using a reveal key
// @access  Private
router.post('/:id/get-hint', auth, async (req, res) => {
  try {
    const { usedHintTypes = [] } = req.body;
    console.log("Hint types déjà utilisés:", usedHintTypes);
    
    // Trouver le message
    const message = await Message.findOne({ 
      _id: req.params.id,
      recipient: req.user.id
    });
    
    if (!message) {
      return res.status(404).json({ msg: 'Message non trouvé' });
    }

    // Vérifier que l'expéditeur a un surnom
    if (!message.sender.nickname || message.sender.nickname === 'Anonyme') {
      return res.status(400).json({ msg: 'Ce message ne contient pas d\'indices sur l\'expéditeur' });
    }

    // Vérifier que l'utilisateur a des clés disponibles
    const user = await User.findById(req.user.id);
    if (user.revealKeys <= 0) {
      return res.status(400).json({ msg: 'Vous n\'avez pas de clés disponibles' });
    }

    // Obtenir le surnom de l'expéditeur pour générer des indices
    const nickname = message.sender.nickname;
    
    // Créer des catégories d'indices possibles
    const possibleHints = [];
    
    // Vérifier si l'utilisateur a déjà beaucoup d'indices
    // Si l'utilisateur a déjà 70% des indices possibles, limiter les nouveaux indices
    const hasLetterIndices = usedHintTypes.some(type => type.startsWith('letter_'));
    const letterIndicesCount = usedHintTypes.filter(type => type.startsWith('letter_')).length;
    const hasReachedLetterLimit = letterIndicesCount >= Math.ceil(nickname.length * 0.7);
    
    // 1. Indices de lettres (première lettre, dernière lettre, etc.)
    // Seulement si l'utilisateur n'a pas déjà trop d'indices de lettres
    if (!usedHintTypes.includes('letter_first') && !hasReachedLetterLimit) {
      possibleHints.push({
        type: 'letter_first',
        value: nickname.charAt(0),
        description: 'Première lettre'
      });
    }
    
    if (!usedHintTypes.includes('letter_last') && nickname.length > 1 && !hasReachedLetterLimit) {
      possibleHints.push({
        type: 'letter_last',
        value: nickname.charAt(nickname.length - 1),
        description: 'Dernière lettre'
      });
    }
    
    // Ajouter des indices pour des lettres aléatoires au milieu
    // Limiter à maximum 50% des lettres pour préserver le mystère
    if (!hasReachedLetterLimit) {
      const maxMiddleLetters = Math.floor(nickname.length * 0.5);
      const existingMiddleLetters = usedHintTypes.filter(type => 
        type.startsWith('letter_') && type !== 'letter_first' && type !== 'letter_last'
      ).length;
      
      if (existingMiddleLetters < maxMiddleLetters) {
        for (let i = 1; i < nickname.length - 1; i++) {
          const type = `letter_${i}`;
          if (!usedHintTypes.includes(type)) {
            possibleHints.push({
              type,
              value: nickname.charAt(i),
              description: `Lettre en position ${i+1}`
            });
          }
        }
      }
    }
    
    // 2. Indices de longueur (toujours disponibles)
    if (!usedHintTypes.includes('length')) {
      possibleHints.push({
        type: 'length',
        value: `${nickname.length} lettres`,
        description: 'Longueur du surnom'
      });
    }
    
    // 3. Indices de mots (pour les surnoms composés)
    const words = nickname.split(/\s+/);
    if (words.length > 1) {
      for (let i = 0; i < words.length; i++) {
        const type = `word_${i}_length`;
        if (!usedHintTypes.includes(type)) {
          possibleHints.push({
            type,
            value: `Mot ${i+1}: ${words[i].length} lettres`,
            description: `Longueur du mot ${i+1}`
          });
        }
      }
    }
    
    // 4. Indices sur les caractères spéciaux
    const hasSpecialChars = /[^a-zA-Z0-9\s]/.test(nickname);
    if (hasSpecialChars && !usedHintTypes.includes('special_chars')) {
      possibleHints.push({
        type: 'special_chars',
        value: 'Contient des caractères spéciaux',
        description: 'Caractères spéciaux'
      });
    }
    
    const hasDigits = /\d/.test(nickname);
    if (hasDigits && !usedHintTypes.includes('has_digits')) {
      possibleHints.push({
        type: 'has_digits',
        value: 'Contient des chiffres',
        description: 'Présence de chiffres'
      });
    }
    
    // 5. Indice basé sur la localisation si disponible
    if (message.sender.location && message.sender.location.country && !usedHintTypes.includes('location_country')) {
      possibleHints.push({
        type: 'location_country',
        value: message.sender.location.country,
        description: 'Pays'
      });
    }
    
    if (message.sender.location && message.sender.location.city && !usedHintTypes.includes('location_city')) {
      possibleHints.push({
        type: 'location_city',
        value: message.sender.location.city,
        description: 'Ville'
      });
    }
    
    // 6. Utiliser l'indice fourni par l'expéditeur si disponible
    if (message.clues && message.clues.hint && !usedHintTypes.includes('sender_hint')) {
      possibleHints.push({
        type: 'sender_hint',
        value: message.clues.hint,
        description: 'Indice laissé par l\'expéditeur'
      });
    }
    
    // 7. Ajouter un indice sur la première lettre de chaque mot dans un nom composé
    if (words.length > 1) {
      const type = 'initials';
      if (!usedHintTypes.includes(type)) {
        const initials = words.map(word => word.charAt(0).toUpperCase()).join('');
        possibleHints.push({
          type,
          value: initials,
          description: 'Initiales des mots'
        });
      }
    }
    
    console.log(`Nombre d'indices disponibles: ${possibleHints.length}`);
    
    // Si aucun indice n'est disponible
    if (possibleHints.length === 0) {
      return res.status(200).json({ 
        message: 'no_hints_available',
        hintStats: {
          total: usedHintTypes.length,
          used: usedHintTypes.length,
          remaining: 0
        }
      });
    }
    
    // Choisir un indice aléatoire parmi ceux disponibles
    const randomIndex = Math.floor(Math.random() * possibleHints.length);
    const selectedHint = possibleHints[randomIndex];
    
    console.log("Indice sélectionné:", selectedHint);
    
    // Décrémenter le nombre de clés de l'utilisateur
    user.revealKeys -= 1;
    await user.save();
    
    // Calculer les statistiques d'indices
    const totalPossibleHints = possibleHints.length + usedHintTypes.length;
    const hintStats = {
      total: totalPossibleHints,
      used: usedHintTypes.length + 1, // +1 pour l'indice qu'on vient de révéler
      remaining: totalPossibleHints - (usedHintTypes.length + 1)
    };
    
    // Ajouter l'indice à la liste des indices utilisés dans le message
    if (!message.discoveredHints) {
      message.discoveredHints = [];
    }
    
    message.discoveredHints.push(selectedHint);
    await message.save();
    
    res.json({ 
      hint: selectedHint,
      hintStats
    });
    
  } catch (err) {
    console.error("Erreur lors de la récupération d'indice:", err);
    res.status(500).json({ 
      msg: 'Erreur serveur',
      error: err.message
    });
  }
});

// @route   GET /api/messages/:id/hints
// @desc    Get hints already discovered for a message
// @access  Private
router.get('/:id/hints', auth, async (req, res) => {
  try {
    console.log("Récupération des indices pour le message:", req.params.id);
    
    // Trouver le message
    const message = await Message.findOne({ 
      _id: req.params.id,
      recipient: req.user.id
    }).populate('sender.userId', 'username');
    
    if (!message) {
      return res.status(404).json({ msg: 'Message non trouvé' });
    }

    // Vérifier si le message a des indices découverts
    let discoveredHints = message.discoveredHints || [];
    console.log("Indices découverts pour le message", req.params.id, ":", discoveredHints);
    
    // Si le nom a déjà été découvert, envoyer tous les indices possibles
    if (message.sender.nameDiscovered) {
      console.log("Le nom a déjà été découvert, envoi de tous les indices possibles");
      
      const nickname = message.sender.nickname;
      
      // Ajouter un indice spécial pour indiquer que le nom a été découvert
      discoveredHints.push({
        type: 'name_discovered',
        value: nickname,
        description: 'Nom découvert'
      });
    }
    
    // Calculer les statistiques d'indices
    let hintStats = { total: 0, used: 0, remaining: 0 };
    
    if (message.sender && message.sender.nickname) {
      const nickname = message.sender.nickname;
      let totalPossibleHints = 0;
      
      // Compter le nombre total d'indices possibles de manière plus précise
      // Cela évite que le système annonce prématurément "tous les indices découverts"
      const words = nickname.split(/\s+/);
      
      // Lettres (avec une limite maximale pour éviter de tout révéler)
      // Maximum 70% des lettres peuvent être révélées
      const maxLetterHints = Math.ceil(nickname.length * 0.7);
      totalPossibleHints += Math.min(maxLetterHints, nickname.length);
      
      // Indices structurels et contextuels
      totalPossibleHints += 1; // Longueur totale
      totalPossibleHints += words.length > 1 ? words.length + 1 : 0; // Mots composés + nombre de mots
      totalPossibleHints += /[^a-zA-Z0-9\s]/.test(nickname) ? 1 : 0; // Caractères spéciaux
      totalPossibleHints += /\d/.test(nickname) ? 1 : 0; // Chiffres
      
      // Indices de localisation et personnalisés
      totalPossibleHints += message.sender.location && message.sender.location.country ? 1 : 0; // Pays
      totalPossibleHints += message.sender.location && message.sender.location.city ? 1 : 0; // Ville
      totalPossibleHints += message.clues && message.clues.hint ? 1 : 0; // Indice de l'expéditeur
      totalPossibleHints += message.clues && message.clues.emoji ? 1 : 0; // Emoji de l'expéditeur
      totalPossibleHints += message.clues && message.clues.riddle ? 1 : 0; // Indice de devinette
      
      // Ajouter quelques indices supplémentaires pour éviter le message "tous découverts" trop tôt
      // Cette valeur peut être ajustée selon les besoins
      const minRemainingHints = 2;
      const usedHints = discoveredHints.length;
      
      // S'assurer qu'il reste toujours au moins minRemainingHints indices à découvrir
      // sauf si l'utilisateur a vraiment tout découvert ou si le nom a été découvert
      const totalWithBuffer = message.sender.nameDiscovered 
        ? totalPossibleHints 
        : Math.max(totalPossibleHints, usedHints + minRemainingHints);
      
      hintStats = {
        total: totalWithBuffer,
        used: usedHints,
        remaining: message.sender.nameDiscovered ? 0 : Math.max(0, totalWithBuffer - usedHints)
      };
    }
    
    res.json({
      hints: discoveredHints,
      hintStats
    });
  } catch (err) {
    console.error("Erreur lors de la récupération des indices:", err);
    res.status(500).json({ 
      msg: 'Erreur serveur',
      error: err.message
    });
  }
});

// @route   PATCH /api/messages/:id/user-discovered
// @desc    Update message when user identity is discovered
// @access  Private
router.patch('/:id/user-discovered', auth, async (req, res) => {
  try {
    const { username } = req.body;
    
    // Vérifier si le message existe et appartient à l'utilisateur
    const message = await Message.findOne({ 
      _id: req.params.id, 
      recipient: req.user.id 
    });
    
    if (!message) {
      return res.status(404).json({ msg: 'Message non trouvé' });
    }
    
    // Vérifier si l'expéditeur a un compte utilisateur lié
    if (!message.sender.realUser || !message.sender.userId) {
      return res.status(400).json({ msg: 'Ce message n\'a pas été envoyé par un utilisateur inscrit' });
    }
    
    // Trouver l'utilisateur correspondant
    const senderUser = await User.findById(message.sender.userId);
    
    if (!senderUser) {
      return res.status(404).json({ msg: 'Utilisateur expéditeur non trouvé' });
    }
    
    // Mettre à jour le statut de découverte
    message.sender.userDiscovered = true;
    message.sender.realUserName = senderUser.username;
    
    await message.save();
    
    res.json({
      success: true,
      message: 'Identité utilisateur découverte avec succès',
      sender: {
        nickname: message.sender.nickname,
        realUserName: senderUser.username,
        userDiscovered: true
      }
    });
  } catch (err) {
    console.error("Erreur lors de la mise à jour du statut de découverte:", err.message);
    res.status(500).json({ 
      msg: 'Erreur serveur', 
      error: err.message 
    });
  }
});

// Route pour envoyer un message avec audio
router.post('/send-with-audio', upload.single('voiceMessage'), async (req, res) => {
  try {
    // Extraire les données JSON du formulaire
    const messageData = JSON.parse(req.body.data);
    
    // Récupérer le fichier audio
    const audioFile = req.file;
    if (!audioFile) {
      return res.status(400).json({ msg: 'Aucun fichier audio fourni' });
    }
    
    // Validation de base du contenu
    if (!messageData.content || messageData.content.trim().length < 5) {
      return res.status(400).json({ msg: 'Le message doit contenir au moins 5 caractères' });
    }
    
    // Vérifier l'authentification si l'utilisateur veut envoyer en tant qu'utilisateur connecté
    let authenticatedUserId = null;
    if (messageData.sendAsAuthenticated) {
      // Vérifier si l'en-tête d'autorisation est présent
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ msg: 'Authentification requise pour cette option' });
      }

      // Extraire et vérifier le token
      const token = authHeader.substring(7); // Enlever "Bearer "
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        authenticatedUserId = decoded.user.id;
        
        // Vérifier que l'ID utilisateur fourni correspond à l'utilisateur authentifié
        if (messageData.realUserId && messageData.realUserId !== authenticatedUserId) {
          return res.status(401).json({ msg: 'ID utilisateur non autorisé' });
        }
      } catch (error) {
        return res.status(401).json({ msg: 'Token non valide' });
      }
    }
    
    // Trouver le destinataire par son lien unique
    const recipient = await User.findOne({ uniqueLink: messageData.recipientLink });
    if (!recipient) {
      return res.status(404).json({ msg: 'Destinataire non trouvé' });
    }
    
    // Chemin du fichier audio original
    const originalFilePath = audioFile.path;
    
    // Générer un nom pour le fichier audio traité
    const processedFileName = 'processed-' + path.basename(audioFile.path);
    const processedFilePath = path.join(path.dirname(audioFile.path), processedFileName);
    
    // Appliquer le filtre vocal
    await processVoice(originalFilePath, processedFilePath, messageData.voiceFilter || 'normal');
    
    // Vérifier que l'emotionalFilter est valide
    const validEmotionalFilters = ['amour', 'colère', 'admiration', 'regret', 'joie', 'tristesse', 'neutre'];
    const selectedEmotionalFilter = messageData.emotionalFilter && validEmotionalFilters.includes(messageData.emotionalFilter) 
      ? messageData.emotionalFilter 
      : 'neutre';
    
    // Créer le message
    const newMessage = new Message({
      recipient: recipient._id,
      recipientLink: messageData.recipientLink,
      content: messageData.content,
      sender: {
        nickname: messageData.nickname || 'Anonyme',
        ipAddress: req.ip,
        location: {
          country: messageData.country || 'Inconnu',
          city: messageData.city || 'Inconnue'
        },
        userId: messageData.sendAsAuthenticated && authenticatedUserId ? 
          new mongoose.Types.ObjectId(authenticatedUserId) : 
          (messageData.realUserId ? new mongoose.Types.ObjectId(messageData.realUserId) : null),
        realUser: !!(messageData.sendAsAuthenticated && authenticatedUserId) || !!(messageData.realUserId),
        partialInfo: {
          firstLetter: messageData.nickname ? messageData.nickname.charAt(0) : 'A'
        }
      },
      emotionalFilter: selectedEmotionalFilter,
      clues: {
        hint: messageData.hint || null,
        emoji: messageData.emoji || null,
        riddle: messageData.riddle && messageData.riddle.question && messageData.riddle.answer ? {
          question: messageData.riddle.question,
          answer: messageData.riddle.answer
        } : null
      },
      customMask: messageData.customMask || null,
      hasVoiceMessage: true,
      voiceMessagePath: processedFilePath,
      voiceFilter: messageData.voiceFilter || 'normal'
    });
    
    // Ajouter la condition de révélation si définie
    if (messageData.revealCondition && messageData.revealCondition.type) {
      const validRevealTypes = ['devinette', 'mini-jeu', 'défi', 'paiement', 'clé', 'aucune'];
      if (validRevealTypes.includes(messageData.revealCondition.type)) {
        newMessage.revealCondition = {
          type: messageData.revealCondition.type,
          details: messageData.revealCondition.details || {},
          completed: false
        };
      }
    }

    // Ajouter la planification si définie
    if (messageData.scheduledDate) {
      try {
        const revealDate = new Date(messageData.scheduledDate);
        if (revealDate > new Date()) {
          newMessage.scheduled = {
            isScheduled: true,
            revealDate
          };
        }
      } catch (error) {
        console.error("Erreur de format de date:", error);
      }
    }
    
    // Enregistrer les données pour le débogage
    console.log("Message audio créé:", {
      recipientId: recipient._id,
      content: messageData.content.substring(0, 20) + "...",
      nickname: messageData.nickname || 'Anonyme',
      emotionalFilter: selectedEmotionalFilter,
      voiceFilter: messageData.voiceFilter || 'normal'
    });
    
    // Sauvegarder le message
    await newMessage.save();
    
    // Supprimer le fichier audio original après traitement
    try {
    fs.unlinkSync(originalFilePath);
    } catch (err) {
      console.error("Erreur lors de la suppression du fichier original:", err);
    }
    
    res.json({
      messageId: newMessage._id,
      success: true,
      details: {
        emotionalFilter: selectedEmotionalFilter,
        voiceFilter: messageData.voiceFilter || 'normal',
        hasEmoji: !!messageData.emoji,
        hasHint: !!messageData.hint,
        hasRiddle: !!(messageData.riddle && messageData.riddle.question && messageData.riddle.answer)
      }
    });
  } catch (err) {
    console.error('Erreur lors de l\'envoi du message avec audio:', err);
    // Afficher plus de détails sur l'erreur pour le débogage
    if (err.name === 'ValidationError') {
      const validationErrors = {};
      
      // Extraire les messages d'erreur spécifiques
      for (const field in err.errors) {
        validationErrors[field] = err.errors[field].message;
      }
      
      console.error("Erreurs de validation:", validationErrors);
      console.error("Message complet:", JSON.stringify(messageData, null, 2));
      console.error("Format du message:", {
        recipientId: typeof recipient._id,
        recipientLink: typeof messageData.recipientLink,
        content: typeof messageData.content,
        realUser: typeof authenticatedUserId
      });
      
      return res.status(400).json({ 
        msg: 'Erreur de validation des données', 
        errors: validationErrors,
        error: err.message
      });
    }
    
    res.status(500).json({ 
      msg: 'Erreur serveur', 
      error: err.message 
    });
  }
});

// Route pour récupérer un message audio
router.get('/:id/voice-message', async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);
    
    if (!message) {
      return res.status(404).json({ msg: 'Message non trouvé' });
    }
    
    // Vérifier que le message a un fichier audio
    if (!message.hasVoiceMessage || !message.voiceMessagePath) {
      return res.status(404).json({ msg: 'Ce message ne contient pas de fichier audio' });
    }
    
    // Vérifier que le fichier existe
    if (!fs.existsSync(message.voiceMessagePath)) {
      console.error(`Fichier audio non trouvé: ${message.voiceMessagePath}`);
      return res.status(404).json({ msg: 'Fichier audio non trouvé' });
    }
    
    // Créer une copie temporaire du fichier avec une extension .wav si nécessaire
    const fileName = path.basename(message.voiceMessagePath);
    const hasExtension = fileName.includes('.');
    let tempFilePath = message.voiceMessagePath;
    
    if (!hasExtension) {
      // Créer un répertoire temporaire sans espaces si nécessaire
      const tempDir = path.join(__dirname, '../temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      // Générer un nom de fichier temporaire sans espaces et avec extension .wav
      const tempFileName = `temp_${Date.now()}_${fileName}.wav`;
      tempFilePath = path.join(tempDir, tempFileName);
      
      // Copier le fichier original vers le fichier temporaire
      fs.copyFileSync(message.voiceMessagePath, tempFilePath);
      
      console.log(`Fichier temporaire créé: ${tempFilePath}`);
    }
    
    // Définir les en-têtes CORS spécifiques pour les fichiers audio
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    // Définir les en-têtes de cache pour améliorer les performances
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    
    // Déterminer le type MIME en fonction de l'extension du fichier
    const contentType = 'audio/wav';
    res.setHeader('Content-Type', contentType);
    
    // Ajouter des en-têtes pour éviter les problèmes CORS avec les fichiers audio
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    
    console.log(`Envoi du fichier audio: ${tempFilePath} avec le type MIME: ${contentType}`);
    
    // Envoyer le fichier audio
    res.sendFile(tempFilePath, (err) => {
      // Supprimer le fichier temporaire après l'envoi si on en a créé un
      if (!hasExtension && fs.existsSync(tempFilePath)) {
        try {
          fs.unlinkSync(tempFilePath);
          console.log(`Fichier temporaire supprimé: ${tempFilePath}`);
        } catch (cleanupErr) {
          console.error(`Erreur lors de la suppression du fichier temporaire: ${cleanupErr}`);
        }
      }
      
      if (err) {
        console.error(`Erreur lors de l'envoi du fichier: ${err}`);
      }
    });
  } catch (error) {
    console.error('Erreur lors de la récupération du message audio:', error);
    res.status(500).json({ msg: 'Erreur serveur' });
  }
});

// Importer l'utilitaire de types MIME
const { getAudioMimeType } = require('../utils/mimeTypes');

// @route   GET /api/messages/voice-message/:filename
// @desc    Stream a voice message audio file with proper CORS headers
// @access  Public (with optional authentication)
router.get('/voice-message/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    
    // Vérifier que le nom de fichier est valide pour éviter les attaques de traversée de répertoire
    if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ msg: 'Nom de fichier non valide' });
    }
    
    // Construire le chemin du fichier
    const filePath = path.join(__dirname, '../uploads', filename);
    
    // Vérifier si le fichier existe
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ msg: 'Fichier audio non trouvé' });
    }
    
    // Déterminer le type MIME en fonction de l'extension du fichier
    const contentType = getAudioMimeType(filename);
    console.log(`Fichier audio: ${filename}, Type MIME: ${contentType}`);
    
    // Définir les en-têtes CORS spécifiques pour les fichiers audio
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    // Définir les en-têtes de cache pour améliorer les performances
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.setHeader('Content-Type', contentType);
    
    // Ajouter des en-têtes pour éviter les problèmes CORS avec les fichiers audio
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    
    // Créer un flux de lecture pour le fichier
    const fileStream = fs.createReadStream(filePath);
    
    // Gérer les erreurs de flux
    fileStream.on('error', (error) => {
      console.error('Erreur de lecture du fichier audio:', error);
      res.status(500).json({ msg: 'Erreur lors de la lecture du fichier audio' });
    });
    
    // Envoyer le fichier en streaming
    fileStream.pipe(res);
    
  } catch (error) {
    console.error('Erreur lors de la diffusion du fichier audio:', error);
    res.status(500).json({ msg: 'Erreur serveur', error: error.message });
  }
});

module.exports = router; 