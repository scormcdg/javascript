# Web v1 — fichiers communs des séries SCORM HTML / CSS / JavaScript

Chargés par les paquets SCORM depuis `https://scormcdg.github.io/javascript/script/v1/`.
Un paquet peut garder une copie de secours, utilisée si GitHub ne répond pas.

- `vendor/codemirror/` : éditeur de code (modes HTML, CSS, JavaScript, fermeture des balises et des parenthèses)
- `vendor/acorn/` : analyse du JavaScript (erreurs de syntaxe avant l'exécution)
- `vendor/fonts/` : polices Atkinson Hyperlegible et JetBrains Mono
- `js/protection.js` : erreurs de syntaxe ; arrêt des boucles infinies après 3 secondes
- `js/apercu.js` : page de l'élève dans un cadre isolé (`sandbox`, sans `allow-same-origin`) :
  pas d'accès à Moodle ni à l'API SCORM ; console et erreurs renvoyées par messages
- `js/erreurs.js` : messages d'erreur en français (JavaScript, HTML, CSS)
- `js/checker.js` : vérification des exercices (élément, style, attribut, fonction, variable, console, code ;
  actions : clic, saisie)
- `js/scorm.js` : enregistrement dans Moodle (SCORM 2004)
- `js/app.js`, `css/style.css` : page des séries (onglets HTML / CSS / JavaScript, aperçu, console)

Petite correction (message, couleur) : la faire ici, elle s'applique à toutes les séries.
Gros changement : créer `script/v2/`, tester, puis faire passer les séries une à une.

## Écrire une série

Un fichier `data/xxx.js` dans le paquet SCORM, voir l'exemple `web01.js` :

```js
SERIE = {
  id: "web01",
  titre: "…",
  exercices: [{
    id: "ex1", titre: "Exercice 1", note: true,
    onglets: ["html", "css", "js"],            // facultatif
    enonce: "<p>…</p>",
    code: { html: "…", css: "…", js: "…" },     // code de départ
    checks: [
      { id: "a", kind: "element", selecteur: "#titre", texte: "Bienvenue", label: "…" },
      { id: "b", kind: "style", selecteur: "#titre", propriete: "color", valeur: "blue", label: "…" },
      { id: "c", kind: "element", selecteur: "#valeur", texte: "1",
        actions: [{ cliquer: "#plus" }], label: "…" },
      { id: "d", kind: "fonction", nom: "double", cas: [{ arguments: [4], attendu: 8 }], label: "…" },
      { id: "e", kind: "console", contient: "42", label: "…" },
      { id: "f", kind: "code", dans: "js", contient: "addEventListener", label: "…" }
    ]
  }]
};
```

Champs communs des critères : `label`, `fail` (message d'échec à la place du message automatique),
`hint` (indice ajouté au message). Chaque critère est testé dans une page neuve.
