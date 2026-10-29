/*
 * Vérification des exercices HTML / CSS / JavaScript.
 *
 * Chaque critère (voir data/…js) est testé dans une page neuve et cachée,
 * pour qu'un clic ou une saisie d'un critère n'influence pas les autres.
 *
 * Types de critères :
 *   { kind: "element",  selecteur, nombre?, texte?, contient?, balise?, actions? }
 *   { kind: "style",    selecteur, propriete, valeur, actions? }        (style calculé, ex. color: blue)
 *   { kind: "attribut", selecteur, attribut, valeur?, actions? }
 *   { kind: "fonction", nom, cas: [{ arguments: [...], attendu }] }    (fonction de l'élève)
 *   { kind: "variable", nom, valeur? }
 *   { kind: "console",  contient? | lignes?, actions? }                 (console.log)
 *   { kind: "code",     dans: "html"|"css"|"js", contient | regex, absent? }   (lecture du code)
 * actions : [{ cliquer: "#bouton" }, { saisir: "#nom", valeur: "Léa" }, { attendre: 500 }]
 * Champs communs : id, label, fail (message d'échec personnalisé), hint (indice ajouté).
 *
 * Dépend de : apercu.js, erreurs.js
 */
(function (global) {
  "use strict";

  function montrer(v) {
    if (typeof v === "string") return "« " + v + " »";
    try { return JSON.stringify(v); } catch (e) { return String(v); }
  }

  function espaces(t) { return String(t == null ? "" : t).replace(/\s+/g, " ").trim(); }

  function apres(c) {
    if (!c.actions || !c.actions.length) return "";
    var parts = c.actions.map(function (a) {
      if (a.cliquer) return "un clic sur « " + a.cliquer + " »";
      if (a.saisir) return "la saisie de « " + a.valeur + " » dans « " + a.saisir + " »";
      return null;
    }).filter(Boolean);
    if (!parts.length) return "";
    // regroupe les clics répétés
    var out = [], i = 0;
    while (i < parts.length) {
      var j = i;
      while (j + 1 < parts.length && parts[j + 1] === parts[i]) j++;
      var n = j - i + 1;
      out.push(n > 1 ? parts[i].replace(/^un clic/, n + " clics") : parts[i]);
      i = j + 1;
    }
    return " après " + out.join(", puis ");
  }

  function codeTest(c, fichiers) {
    var src = String(fichiers[c.dans || "js"] || "");
    var trouve;
    if (c.regex) trouve = new RegExp(c.regex, c.flags || "").test(src);
    else trouve = src.indexOf(c.contient) >= 0;
    var ok = c.absent ? !trouve : trouve;
    var lieu = { html: "le HTML", css: "le CSS", js: "le JavaScript" }[c.dans || "js"];
    return {
      ok: ok,
      message: ok ? null : (c.fail || (c.absent
        ? lieu.charAt(0).toUpperCase() + lieu.slice(1) + " ne doit pas utiliser « " + (c.contient || c.regex) + " »."
        : lieu.charAt(0).toUpperCase() + lieu.slice(1) + " doit utiliser « " + (c.contient || c.regex) + " »."))
    };
  }

  /* Transforme les données brutes renvoyées par la page en { ok, message }. */
  function juger(c, r, fichiers) {
    var quand = apres(c);
    if (!r || r.absent || r.delai) {
      return { ok: false, message: "La page ne répond pas" + quand + " : y a-t-il une boucle qui ne s'arrête jamais ?" };
    }
    if (r.exception) return { ok: false, message: "Vérification impossible : " + r.exception };
    if (r.action) {
      var a = r.action.introuvable;
      return { ok: false, message: "Impossible d'agir sur « " + a + " » : cet élément n'existe pas dans la page. Vérifiez son id (ou son sélecteur) dans le HTML." };
    }
    switch (c.kind) {
      case "element": {
        var att = c.nombre;
        if (r.nombre === 0) return { ok: false, message: "Aucun élément « " + c.selecteur + " » dans la page" + quand + "." };
        if (att != null && r.nombre !== att) {
          return { ok: false, message: "La page contient " + r.nombre + " élément" + (r.nombre > 1 ? "s" : "") + " « " + c.selecteur +
            " »" + quand + " au lieu de " + att + "." };
        }
        if (c.balise && r.balises[0] !== c.balise.toLowerCase()) {
          return { ok: false, message: "« " + c.selecteur + " » est une balise <" + r.balises[0] + "> au lieu de <" + c.balise + ">." };
        }
        var contenu = r.valeurs[0] != null && r.valeurs[0] !== undefined && c.valeurChamp ? r.valeurs[0] : r.textes[0];
        if (c.texte != null && espaces(contenu) !== espaces(c.texte)) {
          return { ok: false, message: "« " + c.selecteur + " » affiche " + montrer(espaces(contenu)) + quand + " au lieu de " + montrer(c.texte) + "." };
        }
        if (c.contient != null && espaces(contenu).toLowerCase().indexOf(espaces(c.contient).toLowerCase()) < 0) {
          return { ok: false, message: "« " + c.selecteur + " » affiche " + montrer(espaces(contenu)) + quand + " : on attend un texte qui contient " + montrer(c.contient) + "." };
        }
        return { ok: true };
      }
      case "style":
        if (!r.trouve) return { ok: false, message: "Aucun élément « " + c.selecteur + " » dans la page" + quand + "." };
        if (r.valeur !== r.attendu) {
          var prop = String(c.propriete).replace(/[A-Z]/g, function (m) { return "-" + m.toLowerCase(); });
          return { ok: false, message: "Pour « " + c.selecteur + " », " + prop + " vaut " + r.valeur + quand + " au lieu de " + c.valeur +
            (r.attendu !== c.valeur ? " (" + r.attendu + ")" : "") + "." };
        }
        return { ok: true };
      case "attribut":
        if (!r.trouve) return { ok: false, message: "Aucun élément « " + c.selecteur + " » dans la page" + quand + "." };
        if (r.valeur === null) return { ok: false, message: "« " + c.selecteur + " » n'a pas d'attribut " + c.attribut + "." };
        if (c.valeur != null && r.valeur !== c.valeur) {
          return { ok: false, message: "L'attribut " + c.attribut + " de « " + c.selecteur + " » vaut " + montrer(r.valeur) + " au lieu de " + montrer(c.valeur) + "." };
        }
        return { ok: true };
      case "fonction": {
        if (!r.existe) {
          return { ok: false, message: r.type && r.type !== "undefined"
            ? "« " + c.nom + " » existe, mais ce n'est pas une fonction (c'est un " + r.type + ")."
            : "La fonction « " + c.nom + " » n'existe pas. Vérifiez son nom (majuscules comprises) : function " + c.nom + "(…) { … }" };
        }
        for (var i = 0; i < r.cas.length; i++) {
          var k = c.cas[i], res = r.cas[i];
          var appel = c.nom + "(" + (k.arguments || []).map(function (x) { return JSON.stringify(x); }).join(", ") + ")";
          if (res.erreur) {
            var parts = res.erreur.match(/^(\w+): ([\s\S]*)$/) || [null, "", res.erreur];
            var trad = global.Erreurs.execution({ nom: parts[1], message: parts[2], ligne: null, fichier: "js" }, fichiers.js);
            return { ok: false, message: appel + " provoque une erreur : " + trad.message };
          }
          if (!res.egal) {
            return { ok: false, message: appel + " donne " + res.obtenu + " au lieu de " + JSON.stringify(k.attendu) + "." +
              (res.obtenu === "undefined" ? " La fonction renvoie-t-elle bien son résultat avec return ?" : "") };
          }
        }
        return { ok: true };
      }
      case "variable":
        if (!r.existe) return { ok: false, message: "La variable « " + c.nom + " » n'existe pas. Déclarez-la avec let ou const." };
        if (r.egal === false) return { ok: false, message: "« " + c.nom + " » vaut " + r.valeur + " au lieu de " + JSON.stringify(c.valeur) + "." };
        return { ok: true };
      case "console": {
        var lignes = r.lignes || [];
        if (c.lignes) {
          var ok = lignes.length === c.lignes.length && c.lignes.every(function (l, i) { return espaces(lignes[i]) === espaces(l); });
          return ok ? { ok: true } : { ok: false, message: "La console affiche " + (lignes.length ? lignes.map(montrer).join(", ") : "rien") +
            quand + " au lieu de " + c.lignes.map(montrer).join(", ") + "." };
        }
        var cherche = espaces(c.contient).toLowerCase();
        var vu = lignes.some(function (l) { return espaces(l).toLowerCase().indexOf(cherche) >= 0; });
        return vu ? { ok: true } : { ok: false, message: "La console n'affiche pas " + montrer(c.contient) + quand + "." +
          (lignes.length ? "" : " Utilisez console.log(…).") };
      }
      default:
        return { ok: false, message: "Critère inconnu : " + c.kind };
    }
  }

  /*
   * Vérifie un exercice. Résout { ok, erreur, resultats: [{ id, label, ok, message }] }.
   * erreur : erreur de syntaxe JavaScript (rien n'est vérifié dans ce cas).
   */
  function verifierExercice(ex, fichiers, conteneur) {
    var prep = fichiers.js && fichiers.js.trim() ? global.Protection.preparer(fichiers.js) : { ok: true };
    if (!prep.ok) {
      return Promise.resolve({ ok: false, erreur: global.Erreurs.syntaxe(fichiers.js, prep.erreur), resultats: [] });
    }
    var resultats = [];
    var chain = Promise.resolve();
    (ex.checks || []).forEach(function (c) {
      chain = chain.then(function () {
        if (c.kind === "code") {
          var t = codeTest(c, fichiers);
          resultats.push({ id: c.id, label: c.label, ok: t.ok, message: t.ok ? null : t.message + (c.hint ? " " + c.hint : "") });
          return;
        }
        var cadre = new global.Apercu.Cadre(conteneur, { visible: false });
        return cadre.executer(fichiers).then(function () {
          return cadre.examiner(c);
        }).then(function (brut) {
          cadre.detruire();
          var j = juger(c, brut, fichiers);
          resultats.push({ id: c.id, label: c.label, ok: j.ok, message: j.ok ? null : (c.fail || j.message) + (c.hint ? " " + c.hint : "") });
        });
      });
    });
    return chain.then(function () {
      return { ok: resultats.length > 0 && resultats.every(function (r) { return r.ok; }), erreur: null, resultats: resultats };
    });
  }

  global.Checker = { verifierExercice: verifierExercice, juger: juger };
})(typeof window !== "undefined" ? window : globalThis);
