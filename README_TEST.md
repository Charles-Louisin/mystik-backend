# Tests d'envoi de devinettes avec audio

Ce dossier contient des scripts de test pour vérifier que l'envoi de devinettes avec des fichiers audio fonctionne correctement.

## Scripts de test

1. **test_audio_riddle.js** - Teste l'envoi d'un message avec audio et devinette
2. **test_db_riddle.js** - Vérifie les messages existants dans la base de données pour confirmer que les devinettes sont correctement enregistrées
3. **test_complete.js** - Test complet qui envoie un message avec audio et devinette, puis vérifie son enregistrement dans la base de données
4. **run_tests.sh** - Script shell qui exécute tous les tests et affiche un résumé des résultats

## Prérequis

- Node.js
- MongoDB
- Serveur backend en cours d'exécution sur le port 5000

## Configuration

1. Assurez-vous que votre fichier `.env` est correctement configuré avec la variable `MONGO_URI` pointant vers votre base de données MongoDB.

2. Assurez-vous que le serveur backend est en cours d'exécution:
   ```bash
   npm run dev
   ```

## Exécution des tests

Pour exécuter tous les tests:

```bash
cd backend
./run_tests.sh
```

Pour exécuter un test spécifique:

```bash
cd backend
node test_audio_riddle.js
```

## Résultats des tests

Les tests afficheront des informations détaillées sur le processus d'envoi et de vérification des messages avec audio et devinette.

- ✅ indique un test réussi
- ❌ indique un test échoué

## Que faire en cas d'échec?

Si les tests échouent, vérifiez les points suivants:

1. Le serveur backend est-il en cours d'exécution sur le port correct?
2. La connexion à la base de données MongoDB est-elle fonctionnelle?
3. Le code de traitement des devinettes a-t-il été correctement modifié dans `backend/routes/messages.js`?
4. Le code d'envoi des devinettes a-t-il été correctement modifié dans `src/app/send/page.js`?

## Modifications apportées

Les modifications suivantes ont été apportées pour résoudre le problème d'envoi de devinettes avec audio:

1. Dans `src/app/send/page.js`:
   - Ajout des champs `riddleQuestion` et `riddleAnswer` séparément dans le FormData
   - Ajout du champ `riddle` comme JSON stringifié
   - Ajout de logs détaillés pour le débogage

2. Dans `backend/routes/messages.js`:
   - Traitement spécial pour les devinettes avec différents formats (chaîne JSON, objet, champs séparés)
   - Initialisation de `riddle: null` dans la création du message
   - Ajout explicite de la devinette après la création du message si elle existe

3. Dans `backend/models/Message.js`:
   - Ajout d'un hook pre-save pour vérifier et corriger la structure de la devinette avant l'enregistrement

Ces modifications garantissent que les devinettes sont correctement envoyées et enregistrées, même lorsqu'un fichier audio est inclus dans le message. 