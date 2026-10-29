/*
 * Messages d'erreur en français pour HTML / CSS / JavaScript.
 *  - Erreurs.syntaxe(code, erreur)     : erreur de syntaxe JavaScript (détectée par Acorn)
 *  - Erreurs.execution(erreur, code)   : erreur pendant l'exécution (remontée par l'aperçu)
 *  - Erreurs.html(html)                : avertissements sur le HTML (balises, id en double)
 * Chaque fonction renvoie { ligne, message } (ou une liste pour html).
 */
(function (global) {
  "use strict";

  var NOMS_CONNUS = [
    "document", "window", "console", "log", "alert", "prompt", "confirm", "parseInt", "parseFloat", "Number", "String",
    "Math", "random", "floor", "round", "ceil", "Array", "JSON", "setTimeout", "setInterval", "clearInterval",
    "getElementById", "querySelector", "querySelectorAll", "getElementsByClassName", "createElement", "appendChild",
    "addEventListener", "removeEventListener", "textContent", "innerHTML", "innerText", "value", "style",
    "classList", "add", "remove", "toggle", "contains", "setAttribute", "getAttribute", "preventDefault",
    "length", "push", "pop", "join", "split", "includes", "indexOf", "toUpperCase", "toLowerCase", "trim",
    "forEach", "map", "filter", "function", "return", "const", "let", "true", "false", "null", "undefined"
  ];

  function ou(ligne) { return ligne ? " (ligne " + ligne + ")" : ""; }

  function distance(a, b) {
    if (Math.abs(a.length - b.length) > 2) return 3;
    var d = [], i, j;
    for (i = 0; i <= a.length; i++) d[i] = [i];
    for (j = 0; j <= b.length; j++) d[0][j] = j;
    for (i = 1; i <= a.length; i++) {
      for (j = 1; j <= b.length; j++) {
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        // deux lettres inversées (« documnet ») comptent pour une seule faute
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
    return d[a.length][b.length];
  }

  /* Nom proche : majuscules différentes, ou une lettre d'écart (deux pour les noms longs). */
  function procheDe(nom, code) {
    var propres = (sansTextes(code || "").match(/[A-Za-z_$][\w$]*/g) || []);
    var pool = NOMS_CONNUS.concat(propres).filter(function (x, i, t) { return x !== nom && t.indexOf(x) === i; });
    for (var i = 0; i < pool.length; i++) if (pool[i].toLowerCase() === nom.toLowerCase()) return pool[i];
    if (nom.length < 4) return null;
    var max = nom.length >= 10 ? 2 : 1;
    for (i = 0; i < pool.length; i++) {
      if (pool[i].length >= 4 && distance(pool[i].toLowerCase(), nom.toLowerCase()) <= max) return pool[i];
    }
    return null;
  }

  /* Remplace textes et commentaires par des espaces (mêmes positions, mêmes lignes). */
  function sansTextes(code) {
    var out = "", i = 0, n = code.length;
    function blanc(s) { return s.replace(/[^\n]/g, " "); }
    while (i < n) {
      var c = code[i], d = code[i + 1];
      if (c === "/" && d === "/") {
        var e = code.indexOf("\n", i); if (e < 0) e = n;
        out += blanc(code.slice(i, e)); i = e;
      } else if (c === "/" && d === "*") {
        var e2 = code.indexOf("*/", i + 2); e2 = e2 < 0 ? n : e2 + 2;
        out += blanc(code.slice(i, e2)); i = e2;
      } else if (c === '"' || c === "'" || c === "`") {
        var j = i + 1;
        while (j < n && code[j] !== c && !(c !== "`" && code[j] === "\n")) { if (code[j] === "\\") j++; j++; }
        out += c + blanc(code.slice(i + 1, j)) + (j < n && code[j] === c ? c : "");
        i = j < n && code[j] === c ? j + 1 : j;
      } else { out += c; i++; }
    }
    return out;
  }

  /* Parenthèses, crochets et accolades : la première qui ne va pas. */
  function equilibre(code) {
    var propre = sansTextes(code), pile = [], ligne = 1;
    var paires = { ")": "(", "]": "[", "}": "{" };
    var noms = { "(": "parenthèse", "[": "crochet", "{": "accolade", ")": "parenthèse", "]": "crochet", "}": "accolade" };
    var un = { "(": "une parenthèse", "[": "un crochet", "{": "une accolade", ")": "une parenthèse", "]": "un crochet", "}": "une accolade" };
    var le = { "(": "La parenthèse", "[": "Le crochet", "{": "L'accolade" };
    var e = { "(": "e", "[": "", "{": "e" };
    for (var i = 0; i < propre.length; i++) {
      var c = propre[i];
      if (c === "\n") { ligne++; continue; }
      if (c === "(" || c === "[" || c === "{") pile.push({ c: c, ligne: ligne });
      else if (paires[c]) {
        var haut = pile.pop();
        if (!haut) {
          return { ligne: ligne, message: "Ligne " + ligne + " : il y a " + un[c] + " fermant" + e[paires[c]] + " « " + c + " » en trop." };
        }
        if (haut.c !== paires[c]) {
          return {
            ligne: ligne,
            message: "Ligne " + ligne + " : « " + c + " » ferme " + un[c] + ", mais la dernière ouverture est « " + haut.c +
              " » (" + noms[haut.c] + " de la ligne " + haut.ligne + "), qui n'est pas encore fermé" + e[haut.c] + "."
          };
        }
      }
    }
    if (pile.length) {
      var p = pile[pile.length - 1];
      var fin = { "(": ")", "[": "]", "{": "}" }[p.c];
      return {
        ligne: p.ligne,
        message: le[p.c] + " « " + p.c + " » ouvert" + e[p.c] + " ligne " + p.ligne + " n'est jamais fermé" + e[p.c] + " : il manque un « " + fin + " »."
      };
    }
    return null;
  }

  function texteLigne(code, ligne) { return (String(code || "").split("\n")[(ligne || 1) - 1] || ""); }

  /* ---------------- Syntaxe JavaScript ---------------- */
  function syntaxe(code, e) {
    var brut = String(e && e.brut || "").replace(/\s*\(\d+:\d+\)\s*$/, "");
    var ligne = e && e.ligne, m;
    var lt = texteLigne(code, ligne);

    if (/^Unterminated string constant/.test(brut)) {
      return { ligne: ligne, message: "Un guillemet n'est pas fermé" + ou(ligne) + " : un texte commence et finit par le même guillemet, par exemple \"Bonjour\" ou 'Bonjour'." };
    }
    if (/^Unterminated template/.test(brut)) {
      return { ligne: ligne, message: "Un accent grave « ` » n'est pas fermé" + ou(ligne) + " : un texte `…` doit se terminer par un autre « ` »." };
    }
    if (/^Unterminated comment/.test(brut)) {
      return { ligne: ligne, message: "Un commentaire /* n'est jamais fermé" + ou(ligne) + " : il manque « */ »." };
    }
    if ((m = brut.match(/^Unexpected character '(.)'/))) {
      if (/[«»“”‘’„]/.test(m[1])) {
        return { ligne: ligne, message: "Guillemets typographiques « " + m[1] + " »" + ou(ligne) + " : en JavaScript, utilisez les guillemets droits \" ou '." };
      }
      return { ligne: ligne, message: "Caractère « " + m[1] + " » inattendu" + ou(ligne) + " : il n'a pas de sens en JavaScript à cet endroit." };
    }
    if ((m = brut.match(/^Identifier '(.+)' has already been declared/))) {
      return { ligne: ligne, message: "« " + m[1] + " » est déjà déclarée" + ou(ligne) + " : on ne peut pas la redéclarer avec let, const ou function. Enlevez le second let/const pour simplement changer sa valeur, ou choisissez un autre nom." };
    }
    if (/^Assigning to rvalue|^Invalid left-hand side/.test(brut)) {
      return { ligne: ligne, message: "Affectation impossible" + ou(ligne) + " : à gauche de « = », il faut une variable. Pour comparer deux valeurs, utilisez « === »." };
    }
    if (/^'return' outside of function/.test(brut)) {
      return { ligne: ligne, message: "« return » en dehors d'une fonction" + ou(ligne) + " : return ne s'utilise qu'à l'intérieur d'une fonction." };
    }
    if (/^\s*else\b/.test(lt) && /^Unexpected/.test(brut)) {
      return { ligne: ligne, message: "« else » inattendu" + ou(ligne) + " : il doit suivre directement l'accolade fermante « } » d'un if. Vérifiez qu'il n'y a pas de « ; » ou d'instruction entre les deux." };
    }
    if ((m = brut.match(/^Unexpected keyword '(\w+)'/)) && new RegExp("\\b(let|const|var|function)\\s+" + m[1] + "\\b").test(lt)) {
      return { ligne: ligne, message: "Mot réservé" + ou(ligne) + " : « " + m[1] + " » est réservé par JavaScript, on ne peut pas l'utiliser comme nom de variable ou de fonction." };
    }
    if ((m = brut.match(/^Unexpected keyword '(\w+)'/))) {
      if (m[1] === "else") {
        return { ligne: ligne, message: "« else » inattendu" + ou(ligne) + " : il doit suivre directement l'accolade fermante « } » d'un if. Vérifiez qu'il n'y a pas de « ; » ou d'instruction entre les deux." };
      }
      return { ligne: ligne, message: "Le mot « " + m[1] + " » est inattendu" + ou(ligne) + ". Vérifiez la ligne précédente : parenthèse, accolade ou virgule oubliée ?" };
    }
    if ((m = brut.match(/^(?:The keyword|Unexpected reserved word)\s*'?(\w*)/))) {
      return { ligne: ligne, message: "Mot réservé" + ou(ligne) + " : " + (m[1] ? "« " + m[1] + " » " : "ce mot ") + "est réservé par JavaScript, on ne peut pas l'utiliser comme nom de variable ou de fonction." };
    }
    if (/^Unexpected token|^Unexpected end of input/.test(brut)) {
      var eq = equilibre(code);
      if (eq) return eq;
      if (/\bif\s*[^(\s]/.test(lt) || /\b(while|for)\s*[^(\s]/.test(lt)) {
        return { ligne: ligne, message: "Ligne " + ligne + " : après if, while ou for, la condition s'écrit entre parenthèses, par exemple if (x > 3) { … }." };
      }
      if (/\bfunction\s+\w+\s*[^(\s\w]/.test(lt) || /\bfunction\s+\w+\s*$/.test(lt)) {
        return { ligne: ligne, message: "Ligne " + ligne + " : après le nom d'une fonction, il faut des parenthèses, par exemple function bonjour() { … }." };
      }
      var car = e && typeof e.position === "number" ? code.charAt(e.position) : "";
      return {
        ligne: ligne,
        message: "Erreur de syntaxe" + ou(ligne) + " : JavaScript ne comprend pas " + (car && /\S/.test(car) ? "« " + car + " » à cet endroit" : "la fin de cette ligne") +
          ". Vérifiez les parenthèses, les accolades, les virgules, les guillemets et les opérateurs (=, ===, +…)."
      };
    }
    var eq2 = equilibre(code);
    if (eq2) return eq2;
    return { ligne: ligne, message: "Erreur de syntaxe" + ou(ligne) + " : JavaScript ne comprend pas cette ligne." };
  }

  /* ---------------- Erreurs pendant l'exécution ---------------- */
  function execution(err, code) {
    var msg = String(err.message || ""), nom = err.nom || "", ligne = err.ligne, m;
    var lieu = err.fichier === "html" ? " (dans une balise <script> du HTML, ligne " + ligne + ")" : ou(ligne);
    var lt = err.fichier === "html" ? "" : texteLigne(code, ligne);

    if (nom === "BoucleInfinie" || /^__BOUCLE__:/.test(msg)) {
      var l = +(msg.split(":")[1]) || null;
      return { ligne: l, message: "Le programme tourne en rond depuis plus de 3 secondes : la boucle de la ligne " + l +
        " ne s'arrête jamais. Vérifiez que sa condition finit par devenir fausse (par exemple que le compteur augmente bien)." };
    }
    if (/Maximum call stack size exceeded|too much recursion/.test(msg)) {
      return { ligne: ligne, message: "Une fonction s'appelle elle-même sans fin" + lieu + " : il manque une condition d'arrêt, ou une fonction en appelle une autre qui la rappelle." };
    }
    if ((m = msg.match(/^(?:Cannot access '|can't access lexical declaration ')(\w+)'? before initialization/))) {
      return { ligne: ligne, message: "« " + m[1] + " » est utilisée avant sa déclaration" + lieu + " : déplacez la ligne « let/const " + m[1] + " = … » plus haut." };
    }
    if ((m = msg.match(/^(\w+) is not defined/))) {
      var n = m[1], proche = procheDe(n, code);
      var estAppel = new RegExp("(^|[^\\w$.])" + n + "\\s*\\(").test(lt);
      return {
        ligne: ligne,
        message: (estAppel ? "La fonction « " : "« ") + n + " » n'existe pas" + lieu + "." +
          (proche ? " Vouliez-vous écrire « " + proche + " » ?" :
            estAppel ? " Vérifiez son nom (majuscules comprises) et qu'elle est bien définie avec function."
                     : " Vérifiez l'orthographe et les majuscules, et que la variable est déclarée avec let ou const.")
      };
    }
    // élément introuvable : getElementById / querySelector a renvoyé null
    var prop = null, variable = null, nul = false, indefini = false;
    if ((m = msg.match(/^Cannot (?:read|set) properties of (null|undefined) \((?:reading|setting) '([^']+)'\)/))) {
      nul = m[1] === "null"; indefini = !nul; prop = m[2];
    } else if ((m = msg.match(/^can't access property "([^"]+)",? (.+?) is (null|undefined)$/))) {
      prop = m[1]; variable = m[2]; nul = m[3] === "null"; indefini = !nul;
    } else if ((m = msg.match(/^(.+?) is (null|undefined)$/))) {
      variable = m[1]; nul = m[2] === "null"; indefini = !nul;
    }
    if (nul) {
      // la variable vient-elle d'un getElementById / querySelector d'une autre ligne ?
      var origine = null;
      if (variable && /^[\w$]+$/.test(variable)) {
        var lignes = String(code || "").split("\n");
        var re = new RegExp("\\b" + variable.replace(/\$/g, "\\$") + "\\s*=\\s*document\\.(getElementById|querySelector)\\s*\\(([^)]*)\\)");
        for (var i = 0; i < lignes.length; i++) {
          var mm = lignes[i].match(re);
          if (mm) { origine = { ligne: i + 1, appel: mm[1] + "(" + mm[2].trim() + ")" }; break; }
        }
      }
      var cherche = /getElementById|querySelector/.test(lt) || /getElementById|querySelector/.test(variable || "");
      return {
        ligne: ligne,
        message: "Élément introuvable" + lieu + " : " + (variable ? "« " + variable + " » vaut null" : "la valeur est null") +
          (prop ? ", donc impossible d'utiliser ." + prop : "") + "." +
          (origine ? " Cette valeur vient de la ligne " + origine.ligne + " : " + origine.appel + " n'a rien trouvé. Vérifiez que cet id ou ce sélecteur existe vraiment dans le HTML (majuscules comprises)."
            : cherche ? " getElementById ou querySelector n'a rien trouvé : vérifiez que l'id ou le sélecteur existe vraiment dans le HTML (majuscules comprises), et qu'il y a bien « # » devant un id dans querySelector."
            : " Vérifiez que l'élément existe dans le HTML.")
      };
    }
    if (indefini) {
      return { ligne: ligne, message: "Valeur inexistante" + lieu + " : on utilise " + (prop ? "." + prop + " sur " : "") +
        (variable ? "« " + variable + " », qui vaut undefined" : "quelque chose qui vaut undefined") +
        ". Vérifiez le nom de la variable ou de la propriété, et qu'elle a bien reçu une valeur." };
    }
    if ((m = msg.match(/^([\w.$]+)(?:\(\.\.\.\))? is not a function/))) {
      var parties = m[1].split(".");
      var dernier = parties[parties.length - 1];
      var p2 = procheDe(dernier, code);
      var liste = /querySelectorAll|getElementsBy/.test(lt) && /addEventListener|textContent|style/.test(dernier + lt);
      return {
        ligne: ligne,
        message: "« " + m[1] + " » n'est pas une fonction" + lieu + "." +
          (p2 && p2 !== dernier ? " Vouliez-vous écrire « " + p2 + " » ?" :
            liste ? " querySelectorAll renvoie une liste d'éléments : utilisez forEach, ou querySelector pour un seul élément."
                  : " Vérifiez son nom (majuscules comprises), ou s'il ne faut pas enlever les parenthèses.")
      };
    }
    if (/^Assignment to constant variable|invalid assignment to const/.test(msg)) {
      return { ligne: ligne, message: "On ne peut pas changer une constante" + lieu + " : une variable déclarée avec const garde sa valeur. Déclarez-la avec let si elle doit changer." };
    }
    if ((m = msg.match(/^(\S+) is not iterable/))) {
      return { ligne: ligne, message: "« " + m[1] + " » n'est pas une liste" + lieu + " : on ne peut pas la parcourir avec for…of." };
    }
    if (/Failed to execute 'querySelector(All)?'|is not a valid selector/.test(msg)) {
      return { ligne: ligne, message: "Sélecteur invalide" + lieu + " : vérifiez ce qui est écrit dans querySelector, par exemple « #titre » pour un id ou « .carte » pour une classe." };
    }
    var types = { TypeError: "Erreur de type", ReferenceError: "Nom inconnu", RangeError: "Valeur hors limites", SyntaxError: "Erreur de syntaxe" };
    return { ligne: ligne, message: (types[nom] || "Erreur") + lieu + " : " + msg };
  }

  /* ---------------- Avertissements HTML ---------------- */
  var VIDES = /^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/;
  var FACULTATIVES = /^(p|li|dt|dd|tr|td|th|option|thead|tbody|tfoot|colgroup|optgroup|rt|rp|caption|html|head|body)$/;

  function html(source) {
    var avert = [], pile = [], ids = {};
    var texte = String(source || "");
    function ligneDe(pos) { return texte.slice(0, pos).split("\n").length; }
    var re = /<!--[\s\S]*?(?:-->|$)|<(\/?)([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g, m;
    while ((m = re.exec(texte))) {
      if (m[0].slice(0, 4) === "<!--") {
        if (!/-->$/.test(m[0])) avert.push({ ligne: ligneDe(m.index), message: "Ligne " + ligneDe(m.index) + " : le commentaire <!-- n'est jamais fermé par -->." });
        continue;
      }
      var fermante = m[1] === "/", nom = m[2].toLowerCase(), l = ligneDe(m.index);
      if (!fermante) {
        var idm = m[3].match(/\bid\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
        if (idm) {
          var id = idm[2] || idm[3] || idm[4] || "";
          if (ids[id]) avert.push({ ligne: l, message: "Ligne " + l + " : l'id « " + id + " » est déjà utilisé ligne " + ids[id] + ". Un id doit être unique dans la page (getElementById ne trouvera que le premier)." });
          else ids[id] = l;
          if (/\s/.test(id)) avert.push({ ligne: l, message: "Ligne " + l + " : l'id « " + id + " » contient un espace. Un id doit être un seul mot, par exemple « mon-titre »." });
        }
        if (VIDES.test(nom) || /\/\s*$/.test(m[3])) continue;
        if (nom === "script" || nom === "style") {
          var fin = texte.toLowerCase().indexOf("</" + nom, re.lastIndex);
          re.lastIndex = fin < 0 ? texte.length : fin;
          if (fin < 0) avert.push({ ligne: l, message: "Ligne " + l + " : la balise <" + nom + "> n'est jamais fermée par </" + nom + ">." });
          continue;
        }
        pile.push({ nom: nom, ligne: l });
      } else {
        if (VIDES.test(nom)) continue;
        var idx = -1;
        for (var i = pile.length - 1; i >= 0; i--) if (pile[i].nom === nom) { idx = i; break; }
        if (idx < 0) {
          if (!FACULTATIVES.test(nom)) avert.push({ ligne: l, message: "Ligne " + l + " : </" + nom + "> ferme une balise <" + nom + "> qui n'a pas été ouverte." });
          continue;
        }
        // balises restées ouvertes entre les deux
        for (var j = pile.length - 1; j > idx; j--) {
          if (!FACULTATIVES.test(pile[j].nom)) {
            avert.push({ ligne: pile[j].ligne, message: "Ligne " + pile[j].ligne + " : la balise <" + pile[j].nom + "> n'est pas fermée avant </" + nom + "> (ligne " + l + ")." });
          }
        }
        pile.length = idx;
      }
    }
    pile.forEach(function (p) {
      if (!FACULTATIVES.test(p.nom)) avert.push({ ligne: p.ligne, message: "Ligne " + p.ligne + " : la balise <" + p.nom + "> n'est jamais fermée : il manque </" + p.nom + ">." });
    });
    return avert;
  }

  /* ---------------- Avertissements CSS ---------------- */
  function css(source) {
    var avert = [];
    var propre = String(source || "").replace(/\/\*[\s\S]*?\*\//g, function (c) { return c.replace(/[^\n]/g, " "); });
    var prof = 0, ligne = 1, ouverture = 0;
    for (var i = 0; i < propre.length; i++) {
      var c = propre[i];
      if (c === "\n") ligne++;
      else if (c === "{") { if (prof === 0) ouverture = ligne; prof++; }
      else if (c === "}") {
        prof--;
        if (prof < 0) { avert.push({ ligne: ligne, message: "CSS, ligne " + ligne + " : accolade « } » en trop." }); prof = 0; }
      }
    }
    if (prof > 0) avert.push({ ligne: ouverture, message: "CSS, ligne " + ouverture + " : l'accolade « { » n'est jamais fermée, il manque un « } »." });
    // propriété sans deux-points : « color red; »
    propre.split("\n").forEach(function (l, i) {
      if (/^\s*[a-z-]+\s+[^:{}]+;\s*$/.test(l) && !/^\s*@/.test(l)) {
        avert.push({ ligne: i + 1, message: "CSS, ligne " + (i + 1) + " : il manque les deux-points entre la propriété et sa valeur, par exemple « color: red; »." });
      }
    });
    return avert;
  }

  global.Erreurs = { syntaxe: syntaxe, execution: execution, html: html, css: css, equilibre: equilibre, sansTextes: sansTextes };
})(typeof window !== "undefined" ? window : globalThis);
