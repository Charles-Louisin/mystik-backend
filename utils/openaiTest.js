const dotenv = require('dotenv');
const path = require('path');
const { OpenAI } = require('openai');

// Charger les variables d'environnement
dotenv.config({ path: path.resolve(__dirname, '../.env') });

/**
 * Module de gestion OpenAI pour Mystik
 * Fournit des fonctions pour l'analyse des messages et la génération de contenu
 */
class OpenAIService {
  constructor() {
    this.openai = null;
    this.isAvailable = false;
    this.initialize();
  }

  /**
   * Initialise le client OpenAI
   */
  initialize() {
// Vérifier si la clé API est disponible
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      console.warn("⚠️ Attention: Aucune clé OpenAI n'est définie. L'analyse avancée des messages ne sera pas disponible.");
      return false;
}

    // Vérifier si la clé semble valide (commence par sk- ou sk-proj-)
    if (!apiKey.startsWith('sk-')) {
      console.warn("⚠️ Attention: La clé OpenAI ne semble pas valide (doit commencer par 'sk-').");
      return false;
    }

    try {
      // Initialiser le client OpenAI
      this.openai = new OpenAI({
        apiKey: apiKey
  });
      
      this.isAvailable = true;
      console.log("✅ Client OpenAI initialisé avec succès");
      return true;
    } catch (error) {
      console.error("❌ Erreur lors de l'initialisation du client OpenAI:", error);
      return false;
    }
  }

  /**
   * Vérifie si le service OpenAI est disponible
   * @returns {boolean} - Disponibilité du service
   */
  isServiceAvailable() {
    return this.isAvailable && this.openai !== null;
  }

  /**
   * Effectue un test simple pour vérifier la connexion à l'API OpenAI
   * @returns {Promise<boolean>} - Résultat du test
   */
  async testConnection() {
    if (!this.isServiceAvailable()) {
      console.error("❌ Service OpenAI non disponible");
      return false;
    }

    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: "Dis bonjour en français" }],
        max_tokens: 10
      });
      
      console.log('✅ Test OpenAI réussi! Réponse:', response.choices[0].message.content);
      return true;
    } catch (error) {
      console.error('❌ Erreur lors du test OpenAI:', error);
      this.isAvailable = false;
      return false;
    }
  }
  
  /**
   * Analyse un message avec OpenAI
   * @param {string} content - Contenu du message
   * @param {string} emotion - Émotion associée au message
   * @returns {Promise<Object>} - Analyse du message
   */
  async analyzeMessage(content, emotion = 'neutre') {
    if (!this.isServiceAvailable()) {
      throw new Error("Service OpenAI non disponible");
    }

    try {
      // Créer un prompt adapté pour l'analyse
      const prompt = `
      Analyse ce message envoyé avec l'émotion "${emotion}":
      
      "${content}"
      
      Réponds en français avec:
      1. Une analyse de l'intention émotionnelle de l'expéditeur (max 2 phrases)
      2. Un résumé court du message (max 2 phrases)
      3. Une suggestion de réponse adaptée à l'émotion et au contenu (max 3 phrases)
      
      Sois précis et adapte ton analyse à l'émotion indiquée. Assure-toi que ta réponse est vraiment en rapport avec le contenu du message et l'humeur choisie.
      `;
      
      // Appeler l'API OpenAI pour l'analyse
      const completion = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          { 
            role: "system", 
            content: "Tu es un assistant spécialisé dans l'analyse émotionnelle des messages. Tu fournis des analyses pertinentes et des suggestions de réponse adaptées au ton émotionnel." 
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 500
      });
      
      // Extraire la réponse
      const aiResponse = completion.choices[0].message.content;
      
      // Traiter la réponse pour extraire les différentes parties
      const parts = aiResponse.split(/\d+\.\s+/).filter(part => part.trim());
      
      return {
        emotionalIntent: parts[0]?.trim() || "Intention émotionnelle non détectée",
        summary: parts[1]?.trim() || "Résumé non disponible",
        suggestionForReply: parts[2]?.trim() || "Suggestion de réponse non disponible"
      };
} catch (error) {
      console.error("❌ Erreur lors de l'analyse du message avec OpenAI:", error);
      throw error;
    }
  }
}

// Créer et exporter une instance unique du service
const openAIService = new OpenAIService();

// Exécuter un test de connexion au démarrage si en mode développement
if (process.env.NODE_ENV === 'development') {
  openAIService.testConnection().then(success => {
    if (success) {
      console.log("✅ Le service OpenAI est prêt à être utilisé");
    } else {
      console.warn("⚠️ Le service OpenAI n'est pas disponible");
    }
  });
}

module.exports = openAIService; 