// Code à ajouter dans routes/messages.js
// Remplacer le code existant par celui-ci

// @route   POST /api/messages/send
// @desc    Send an anonymous message
// @access  Public
router.post('/send', upload.single('voiceMessage'), async (req, res) => {
  try {
    console.log('Réception de requête POST /api/messages/send');
    console.log('Type de contenu:', req.headers['content-type']);
    console.log('Fichier reçu:', req.file ? req.file.filename : 'Aucun fichier');
    
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
    
    const { 
      recipientLink, 
      content, 
      nickname,
      hint,
      emoji,
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
        riddle: null // On l'ajoutera après si nécessaire
      },
      customMask: customMask || null
    });

    // Ajouter la devinette si elle existe
    if (riddleData && riddleData.question && riddleData.answer) {
      console.log('Ajout de la devinette au message:', riddleData);
      newMessage.clues.riddle = {
        question: riddleData.question,
        answer: riddleData.answer
      };
    }

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
      hint: hint || 'Non défini',
      riddle: newMessage.clues.riddle // Ajouter la devinette aux logs
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
        hasRiddle: !!(riddleData && riddleData.question && riddleData.answer),
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