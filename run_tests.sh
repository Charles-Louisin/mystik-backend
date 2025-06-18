#!/bin/bash

# Script pour exécuter les tests de l'envoi de devinettes avec audio

echo "===== TESTS DE L'ENVOI DE DEVINETTES AVEC AUDIO ====="
echo ""

# Vérifier que le serveur est en cours d'exécution
echo "Vérification du serveur..."
curl -s http://localhost:5000/api/health > /dev/null
if [ $? -ne 0 ]; then
    echo "❌ Le serveur n'est pas accessible sur le port 5000"
    echo "Veuillez démarrer le serveur avec 'npm run dev' avant d'exécuter les tests"
    exit 1
else
    echo "✅ Serveur accessible"
fi

echo ""
echo "1. Test d'envoi de message avec audio et devinette"
echo "------------------------------------------------"
node test_audio_riddle.js
TEST1_RESULT=$?

echo ""
echo "2. Test de vérification de la base de données"
echo "-------------------------------------------"
node test_db_riddle.js
TEST2_RESULT=$?

echo ""
echo "3. Test complet (envoi + vérification)"
echo "-----------------------------------"
node test_complete.js
TEST3_RESULT=$?

echo ""
echo "===== RÉSUMÉ DES TESTS ====="
if [ $TEST1_RESULT -eq 0 ]; then
    echo "✅ Test 1: Envoi de message avec audio et devinette - RÉUSSI"
else
    echo "❌ Test 1: Envoi de message avec audio et devinette - ÉCHOUÉ"
fi

if [ $TEST2_RESULT -eq 0 ]; then
    echo "✅ Test 2: Vérification de la base de données - RÉUSSI"
else
    echo "❌ Test 2: Vérification de la base de données - ÉCHOUÉ"
fi

if [ $TEST3_RESULT -eq 0 ]; then
    echo "✅ Test 3: Test complet - RÉUSSI"
else
    echo "❌ Test 3: Test complet - ÉCHOUÉ"
fi

echo ""
if [ $TEST1_RESULT -eq 0 ] && [ $TEST2_RESULT -eq 0 ] && [ $TEST3_RESULT -eq 0 ]; then
    echo "✅✅✅ TOUS LES TESTS SONT RÉUSSIS"
    echo "Vous pouvez déployer le code sur Railway en toute confiance"
    exit 0
else
    echo "❌❌❌ CERTAINS TESTS ONT ÉCHOUÉ"
    echo "Veuillez corriger les problèmes avant de déployer sur Railway"
    exit 1
fi 