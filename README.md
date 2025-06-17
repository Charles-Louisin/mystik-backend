# Backend Mystik

Ce dépôt contient le backend de l'application Mystik.

## Installation

```bash
npm install
```

## Variables d'environnement

Créez un fichier `.env` à la racine du projet avec les variables suivantes:

```
MONGODB_URI=votre_uri_mongodb
PORT=5000
JWT_SECRET=votre_secret_jwt
```

## Démarrage du serveur

```bash
npm start
```

Pour le développement:

```bash
npm run dev
```

## Déploiement sur Railway

1. Créez un compte sur [Railway](https://railway.app/)
2. Connectez votre dépôt GitHub
3. Créez un nouveau projet et sélectionnez votre dépôt
4. Ajoutez les variables d'environnement nécessaires
5. Railway détectera automatiquement le fichier package.json et déploiera votre application

## Structure du projet

- `server.js`: Point d'entrée de l'application
- `routes/`: Contient les routes de l'API
- `models/`: Contient les modèles Mongoose
- `middleware/`: Contient les middlewares personnalisés 