# Changelog

Toutes les modifications notables de ce projet seront documentées dans ce fichier.

Le format est basé sur **Keep a Changelog**  
et ce projet suit un versioning de type **SemVer**.

---

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
