# Changelog

Toutes les modifications notables de ce projet seront documentées dans ce fichier.

Le format est basé sur **Keep a Changelog**  
et ce projet suit un versioning de type **SemVer**.

---

## [1.0.65] - 2026-08-17

### 🎨 Ajouté
 - Ajoute la page d'accueil des ateliers avec les entrées Vaso, Boucle et Applique.
 - Ajoute l'atelier Boucle avec générateur paramétrique, réglages, historique et barre d'actions.
 - Ajoute une vue 3D orbitable pour visualiser la paire de boucles en volume sur un plateau quadrillé.

### 🎨 Modifié
 - Réorganise l'application par ateliers pour préparer les futures sections.
 - Ajoute le retour au menu des ateliers depuis Vaso et Boucle.
 - Améliore la page d'accueil avec fond noir, icônes d'ateliers, animations discrètes et aperçu dynamique.

## [1.0.64] - 2026-08-14

### 🎨 Modifié
 - Ajoute l'option "Forcer Tube à Essais" dans les réglages de contenants pour générer un support tube même sur un vase Eco-Cup compatible.

## [1.0.63] - 2026-08-14

### 🎨 Modifié
 - Garantit une compatibilité minimale tube à essai pour les vases générés et réglés manuellement.
 - Calibre l'ouverture haute minimale à 29 mm pour un tube de 25 mm et compense les textures rentrantes.

## [1.0.62] - 2026-08-11

### 🎨 Modifié
 - Remplace la signature de gravure par le N° de vase.
 - Améliore les gravures des vases avec support tube à essai en plaçant la version au-dessus, le N° de vase en dessous, et en masquant les caractères situés sous le support.

## [1.0.61] - 2026-08-10

### 🎨 Modifié
 - Corrige les supports tube à essai compensés pour qu'ils partent toujours de la base du vase.
 - Gère les inscriptions sur la base des vases avec support tube à essai en conservant un texte central lisible et en décalant localement les lettres qui croisent le support.

## [1.0.60] - 2026-08-10

### 🎨 Modifié
 - Passe les tubes à essai au diamètre 25,4 mm avec formats 100 mm et 120 mm selon la hauteur du vase.
 - Ajoute une compensation de hauteur pour les grands vases avec support tube à essai afin de garder le tube environ 20 mm sous le haut.
 - Prend en compte les textures réelles dans le calcul de compatibilité des contenants pour éviter les insertions impossibles.

## [1.0.59] - 2026-07-13

### 🎨 Modifié
 - Réduit la taille des inscriptions exportées sur les vases avec support tube à essai.

## [1.0.58] - 2026-07-13

### 🎨 Modifié
 - Replace les inscriptions des vases avec support tube à essai sur le fond intérieur, autour du support.

## [1.0.57] - 2026-06-17

### 🎨 Modifié
 - Remonte les options de contenants en haut du panneau Options
 - Supprime les presets de vases inutilisés

## [1.0.56] - 2026-06-10

### 🎨 Ajouté
 - Ajoute les options pour afficher le contenant adapté et générer le support tube à essai

### 🎨 Modifié
 - Revoit le support tube à essai avec bras inclinés et épaule sous l'anneau
 - Stabilise l'aperçu et l'export des modèles tube à essai

## [1.0.55] - 2026-06-09

### 🎨 Modifié
 - Rend explicite la marge de compatibilité des Eco-Cups et ajoute des tests de seuil

## [1.0.54] - 2026-06-09

### 🎨 Modifié
 - Remplace les bras ponctuels du support tube à essai par trois secteurs évasés qui portent chacun environ un tiers de l'anneau

## [1.0.53] - 2026-06-09

### 🎨 Modifié
 - Remplace les nervures sous l'anneau du support tube à essai par des bras courbes qui s'evasent jusqu'a l'anneau

## [1.0.52] - 2026-06-09

### 🎨 Modifié
 - Renforce l'anneau du support tube à essai avec des nervures imprimables sous les points d'accroche

## [1.0.51] - 2026-06-09

### 🎨 Ajouté
 - Ajoute le support tube à essai dans le maillage quand aucun Eco-Cup ne rentre
 - Aligne le contenant tube à essai sur le format 75 × 12 mm de Vaso Shop
 - Met à jour la vue en coupe pour afficher le tube suspendu depuis le haut

## [1.0.50] - 2026-05-16

### 🎨 Ajouté
 - Analyse le plus grand contenant compatible et l'affiche avec une vue en coupe dans le panneau de droite

## [1.0.49] - 2026-05-04

### 🎨 Modifié
 - Place la couture des profils facettes sur une arrete et rend les textures plus continues

## [1.0.48] - 2026-05-03

### 🎨 Modifié
 - Impose une ligne de couture unique sur les textures

## [1.0.47] - 2026-05-03

### 🎨 Modifié
 - Conserve la meme arrete de couture entre profils facettes

## [1.0.46] - 2026-05-03

### 🎨 Modifié
 - Fige la couture texturee sur les profils a arretes

## [1.0.45] - 2026-05-03

### 🎨 Modifié
 - Garde une marge centrale autour des coutures d'arrete

## [1.0.44] - 2026-05-03

### 🎨 Modifié
 - Limite le suffixe M aux seeds reellement modifiees

## [1.0.43] - 2026-05-03

### 🎨 Modifié
 - Garde la couture texturee dans son arrete d'ancrage

## [1.0.42] - 2026-05-02

### 🎨 Modifié
 - Choisit localement la couture texturee pour mieux suivre la continuite du relief

## [1.0.41] - 2026-05-02

### 🎨 Modifié
 - Guide la couture texturee vers des zones de relief plus discretes

## [1.0.40] - 2026-05-01

### 🎨 Modifié
 - Autorise une couture texturee a serpenter localement pour mieux suivre le relief

## [1.0.39] - 2026-05-01

### 🎨 Modifié
 - Aligne le resampling sur la couture pour reduire les petits artefacts locaux

## [1.0.38] - 2026-05-01

### 🎨 Modifié
 - Retablit une couture plus stable en revenant a un ancrage au milieu d'arrete

## [1.0.37] - 2026-05-01

### 🎨 Modifié
 - Ancre la couture sur un sommet d'arrete stable pour reduire les artefacts locaux

## [1.0.36] - 2026-05-01

### 🎨 Modifié
 - Ajoute une hysteresis de couture pour limiter les bascules entre arretes voisines

## [1.0.35] - 2026-05-01

### 🎨 Modifié
 - Stabilise la couture du maillage entre les couches pour limiter les residus verticaux

## [1.0.34] - 2026-05-01

### 🎨 Modifié
 - Repositionne la couture du maillage pour la rendre moins visible

## [1.0.33] - 2026-05-01

### 🎨 Modifié
 - Corrige le nom des exports STL pour inclure la seed et la date

## [1.0.32] - 2026-05-01

### 🎨 Modifié
 - Augmente légèrement la marge du texte du fond pour l’aérer visuellement

## [1.0.31] - 2026-05-01

### 🎨 Modifié
 - Ajuste le rendu STL de K l m pour le rendre plus discret et plus propre

## [1.0.30] - 2026-05-01

### 🎨 Modifié
 - Améliore la lisibilité du texte STL avec plus d’interligne et un K l m plus discret

## [1.0.29] - 2026-05-01

### 🎨 Modifié
 - Évite la troncature du texte du fond tout en conservant sa largeur utile

## [1.0.28] - 2026-05-01

### 🎨 Modifié
 - Préserve un texte du fond réellement plus large dans l’aperçu et le STL

## [1.0.27] - 2026-05-01

### 🎨 Modifié
 - Élargit davantage le texte du fond dans l’aperçu et la gravure

## [1.0.26] - 2026-05-01

### 🎨 Modifié
 - Corrige l’aperçu du texte du fond pour refléter son agrandissement

## [1.0.25] - 2026-05-01

### 🎨 Modifié
 - Agrandit la gravure du fond et ajoute la ligne centrée `K l m`

## [1.0.24] - 2026-03-28

### 🎨 Modifié
Fix: corrige le blocage export STL d'instanciation clipper après bundling

## [1.0.23] - 2026-03-28

### 🎨 Modifié
 - correction gravure FDM robuste 
 - rétablit le workflow deploy

## [1.0.22] - 2026-03-28

### 🎨 Modifié
 - Ajustement du texte sur STL pour impression

## [1.0.21] - 2026-03-28

### 🎨 Modifié
 - Le N° de  Seed passe de 6 à 8 chiffres 
 - Probleme de capture d'écran résolu 

## [1.0.20] - 2026-03-26

### 🎨 Modifié
 - Le vase initial de session correspond maintenant à la seed générée aléatoirement 
 - Le "M" de seed modifié est mainteant appliqué si:
   - Style
   - Forcer complexité
   - Complexité
   - Forcer texture
   - Preset de profil imprimante 3D
   est modifié / appliqué.

## [1.0.19] - 2026-03-26

### 🎨 Modifié
 - Ajout imprimante 3D "Creality CR-10S" dans la liste des profils en 3eme position
 - Application complète des thèmes de couleurs (vase compris)


## [1.0.18] - 2026-03-26

### 🎨 Modifié
 - Correction du mode de vue 3D "Flat Shading" qui ne fonctionnait pas

## [1.0.17] - 2026-03-26
 
### 🎨 Ajouté
 - Un "M"est affiché si il y a modification de la seed:
   - Sur le rendu 3D
   - Sur le STL
   - Sur le bandeau de la capture d'écran 
   
## [1.0.16] - 2026-03-26

### 🎨 Ajouté
 - Mise en place d'un critère d'épaisseur géométrique constante (evite les trous à la réduction d'echelle)

## [1.0.15] - 2026-03-25

### 🎨 Ajouté
 - Bouton réinitialiser Vaso dans options 

## [1.0.14] - 2026-03-25

### 🎨 Modifié
 - Deplacement des paramètres avancés de STL de paramètres généraux à options

## [1.0.13] - 2026-03-25

### 🎨 Modifié
 - Le programme tiens maintenant compte de l'imprimante 3D selectionnée

### 🎨 Ajouté
 - Ajout de plusieurs imprimante 3D dans les presets

## [1.0.12] - 2026-03-25

### 🎨 Modifié

 - Supression du mode de rendu 3D "Enhanced" qui était pertinent en Python
 - n° de seed et plus N° de seed sur le bandeau capture d'écran

## [1.0.11] - 2026-03-25

### 🎨 Modifié
 - Texte titre + version + seed visible dans le rendu 3D

## [1.0.10] - 2026-03-25

### 🎨 Modifié
 - Séctions rétablies dans le menu option

## [1.0.9] - 2026-03-25

### 🎨 Modifié
- Le menu option sur mobile se ferme lorsqu'on appuie sur X

## [1.0.8] - 2026-03-25

### 🎨 Modifié
- Le menu option sur mobile ne se ferme plus lorsqu'on change de section

## [1.0.7] - 2026-03-25

### 🎨 Modifié
- Capture d'écran fonctionnelle + titre capture 

### 🎨 Ajouté
- Bandeau info sur la capture d'écran 

## [1.0.6] - 2026-03-25

### 🎨 Ajouté
- Nom du programme + version + N°de seed imprimé dans le vase

### 🎨 Modifié
- Nettoyage du vieux pipeline soustractif 

## [1.0.5] - 2026-03-21

### 🎨 Modifié
- Résidu de la grille du milieu

## [1.0.4] - 2026-03-21

### 🎨 Modifié
- Probleme de bloc noir en version mobile résolu 

## [1.0.3] - 2026-03-21

### 🎨 Modifié
- Probleme de bloc noir en version mobile

## [1.0.2] - 2026-03-21

### 🎨 Modifié
- Amélioration IG: les boutons du bas ne disparaissent plus au redimenssionnement


## [1.0.1] - 2026-03-21

### 🎨 Modifié
- Positionnement correct de la grille 3D à la base du vase
- Amélioration de la cohérence visuelle de la scène 3D

- Inversion de la hiérarchie visuelle des boutons principaux :
  - **"Aléatoire"** devient le bouton principal (highlight)
  - **"Exporter STL"** devient secondaire

### 🧠 Amélioré
- Meilleure lisibilité de l’interface utilisateur
- Comportement plus logique orienté génération avant export

---

## [1.0.0] - Initial release

### ✨ Fonctionnalités principales
- Génération de vases polygonaux paramétriques
- Interpolation multi-profils (2 à 10 profils)
- Aperçu 3D temps réel
- Export STL
- Génération aléatoire avec seed
- Textures paramétriques
- Interface web React + Vite
- Déploiement GitHub Pages
