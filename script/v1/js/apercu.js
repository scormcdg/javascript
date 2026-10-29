/*
 * Exécution de la page de l'élève dans un cadre isolé.
 *
 * Le cadre est créé avec sandbox="allow-scripts …" et SANS allow-same-origin :
 * le code de l'élève ne peut ni lire la page du SCORM, ni appeler l'API SCORM
 * (donc ni changer sa note), ni lire la session Moodle. Les échanges passent
 * uniquement par des messages (postMessage).
 *
 * Dépend de : protection.js
 */
(function (global) {
  "use strict";

  var LIMITE_BOUCLE_MS = 3000;
  var DELAI_CHARGEMENT_MS = 6000;

  /*
   * Code injecté en tête de la page de l'élève (transformé en texte : il ne peut
   * utiliser que ses propres variables). Il renvoie au SCORM la console, les erreurs,
   * et exécute les vérifications demandées.
   */
  function amorce(cfg) {
    var TOKEN = cfg.token;
    var LIMITE = cfg.limite;
    var logs = [];
    var envois = 0, MAX_ENVOIS = 500;
    var parentWin = window.parent;

    function send(o) {
      o.token = TOKEN;
      try { parentWin.postMessage(o, "*"); } catch (e) { /* rien */ }
    }

    function fmt(v, depth) {
      depth = depth || 0;
      if (typeof v === "string") return depth ? JSON.stringify(v) : v;
      if (v === null) return "null";
      if (v === undefined) return "undefined";
      if (typeof v === "number" || typeof v === "boolean" || typeof v === "bigint") return String(v);
      if (typeof v === "function") return "function " + (v.name || "") + "()";
      if (typeof v === "symbol") return v.toString();
      if (v instanceof Error) return v.name + ": " + v.message;
      if (typeof Element !== "undefined" && v instanceof Element) {
        return "<" + v.tagName.toLowerCase() + (v.id ? ' id="' + v.id + '"' : "") +
          (v.className && typeof v.className === "string" ? ' class="' + v.className + '"' : "") + ">";
      }
      if (typeof NodeList !== "undefined" && v instanceof NodeList) {
        return "NodeList(" + v.length + ") [" + Array.prototype.map.call(v, function (x) { return fmt(x, depth + 1); }).join(", ") + "]";
      }
      if (depth > 3) return Array.isArray(v) ? "[…]" : "{…}";
      if (Array.isArray(v)) return "[" + v.map(function (x) { return fmt(x, depth + 1); }).join(", ") + "]";
      try {
        var keys = Object.keys(v);
        return "{" + keys.slice(0, 20).map(function (k) { return k + ": " + fmt(v[k], depth + 1); }).join(", ") +
          (keys.length > 20 ? ", …" : "") + "}";
      } catch (e) { return String(v); }
    }

    ["log", "info", "warn", "error"].forEach(function (k) {
      var orig = console[k];
      console[k] = function () {
        var texte = Array.prototype.map.call(arguments, function (a) { return fmt(a); }).join(" ");
        logs.push(texte);
        if (logs.length > 2000) logs.shift();
        envois++;
        if (envois <= MAX_ENVOIS) send({ type: "console", niveau: k, texte: texte });
        else if (envois === MAX_ENVOIS + 1) send({ type: "console", niveau: "info", texte: "… (plus de " + MAX_ENVOIS + " messages : les suivants ne sont pas affichés)" });
        if (orig) try { orig.apply(console, arguments); } catch (e) { /* rien */ }
      };
    });

    window.onerror = function (msg, src, ligne, colonne, err) {
      var m = err && err.message ? String(err.message) : String(msg).replace(/^Uncaught\s+/, "");
      send({
        type: "erreur",
        nom: err && err.name ? err.name : (String(msg).match(/(\w+Error)/) || [])[1] || "",
        message: m,
        ligne: ligne || null,
        colonne: colonne || null,
        fichier: /script\.js$/.test(String(src || "")) ? "js" : "html"
      });
      return true;
    };
    window.addEventListener("unhandledrejection", function (e) {
      var r = e.reason;
      send({ type: "erreur", nom: r && r.name || "", message: r && r.message ? r.message : String(r), ligne: null, fichier: "js" });
    });

    // Boucles : démarrage du chronomètre et contrôle à chaque tour (voir protection.js)
    var debut = {}, tours = {};
    window.__boucle = {
      d: function (id) { debut[id] = Date.now(); tours[id] = 0; },
      t: function (id, ligne) {
        if (++tours[id] % 1000 === 0 && Date.now() - debut[id] > LIMITE) {
          tours[id] = 0;
          var e = new Error("__BOUCLE__:" + ligne);
          e.name = "BoucleInfinie";
          throw e;
        }
      }
    };

    // Les liens ne quittent pas l'aperçu
    document.addEventListener("click", function (e) {
      var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
      if (!a) return;
      var href = a.getAttribute("href") || "";
      if (href.charAt(0) === "#" || /^javascript:/i.test(href)) return;
      e.preventDefault();
      send({ type: "console", niveau: "info", texte: "Lien vers « " + href + " » : son ouverture est désactivée dans l'aperçu." });
    }, true);

    window.__lancer = function (code) {
      if (code) {
        var s = document.createElement("script");
        s.textContent = code + "\n//# sourceURL=script.js";
        (document.body || document.documentElement).appendChild(s);
      }
      send({ type: "fin" });
    };

    // ---------- Vérifications ----------
    function attendre(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

    function egal(a, b) {
      if (a === b) return true;
      if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 1e-9;
      if (Array.isArray(a) && Array.isArray(b)) {
        return a.length === b.length && a.every(function (x, i) { return egal(x, b[i]); });
      }
      if (a && b && typeof a === "object" && typeof b === "object") {
        var ka = Object.keys(a), kb = Object.keys(b);
        return ka.length === kb.length && ka.every(function (k) { return egal(a[k], b[k]); });
      }
      return false;
    }

    function actions(liste) {
      var chain = Promise.resolve(null);
      (liste || []).forEach(function (a) {
        chain = chain.then(function (err) {
          if (err) return err;
          var sel = a.cliquer || a.saisir;
          if (sel) {
            var el = document.querySelector(sel);
            if (!el) return { introuvable: sel };
            if (a.cliquer) {
              el.click();
            } else {
              el.focus && el.focus();
              el.value = a.valeur;
              el.dispatchEvent(new Event("input", { bubbles: true }));
              el.dispatchEvent(new Event("change", { bubbles: true }));
            }
            return attendre(20).then(function () { return null; });
          }
          if (a.attendre) return attendre(a.attendre).then(function () { return null; });
          return null;
        });
      });
      return chain;
    }

    function kebab(p) { return String(p).replace(/[A-Z]/g, function (m) { return "-" + m.toLowerCase(); }); }

    function normaliser(prop, valeur) {
      var t = document.createElement("div");
      t.style.display = "none";
      t.style.setProperty(kebab(prop), valeur);
      document.body.appendChild(t);
      var v = getComputedStyle(t).getPropertyValue(kebab(prop));
      t.remove();
      return v;
    }

    function examiner(c) {
      var nom = String(c.nom || "");
      switch (c.kind) {
        case "element":
        case "clic":
        case "saisie": {
          var els = Array.prototype.slice.call(document.querySelectorAll(c.selecteur));
          return {
            nombre: els.length,
            textes: els.map(function (e) { return (e.textContent || "").replace(/\s+/g, " ").trim(); }),
            valeurs: els.map(function (e) { return e.value; }),
            balises: els.map(function (e) { return e.tagName.toLowerCase(); })
          };
        }
        case "style": {
          var el = document.querySelector(c.selecteur);
          if (!el) return { trouve: false };
          return { trouve: true, valeur: getComputedStyle(el).getPropertyValue(kebab(c.propriete)), attendu: normaliser(c.propriete, c.valeur) };
        }
        case "attribut": {
          var e2 = document.querySelector(c.selecteur);
          if (!e2) return { trouve: false };
          return { trouve: true, valeur: e2.getAttribute(c.attribut) };
        }
        case "fonction": {
          if (!/^[A-Za-z_$][\w$]*$/.test(nom)) return { existe: false };
          var type, f;
          try { type = (0, eval)("typeof " + nom); } catch (e) { type = "undefined"; }
          if (type !== "function") return { existe: false, type: type };
          f = (0, eval)(nom);
          return {
            existe: true,
            cas: (c.cas || []).map(function (k) {
              try {
                var r = f.apply(null, k.arguments || []);
                return { obtenu: fmt(r, 1), egal: egal(r, k.attendu) };
              } catch (err) {
                return { erreur: (err && err.name ? err.name + ": " : "") + (err && err.message || err) };
              }
            })
          };
        }
        case "variable": {
          if (!/^[A-Za-z_$][\w$]*$/.test(nom)) return { existe: false };
          var t2;
          try { t2 = (0, eval)("typeof " + nom); } catch (e) { return { existe: false, avantDeclaration: true }; }
          if (t2 === "undefined") return { existe: false };
          var v = (0, eval)(nom);
          return { existe: true, valeur: fmt(v, 1), egal: c.hasOwnProperty("valeur") ? egal(v, c.valeur) : null };
        }
        case "console":
          return { lignes: logs.slice() };
        default:
          return {};
      }
    }

    window.addEventListener("message", function (e) {
      var m = e.data;
      if (e.source !== parentWin || !m || m.token !== TOKEN || m.type !== "verifier") return;
      var c = m.critere;
      actions(c.actions).then(function (err) {
        if (err) return { action: err };
        return attendre(c.actions && c.actions.length ? 30 : 0).then(function () { return examiner(c); });
      }).catch(function (err) {
        return { exception: String(err && err.message || err) };
      }).then(function (res) {
        send({ type: "resultat", id: c.id, resultat: res });
      });
    });
  }

  var AMORCE_SRC = "(" + amorce.toString() + ")";

  function jeton() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  /*
   * Construit le document de la page : amorce + CSS dans <head>, HTML de l'élève,
   * puis lancement du JavaScript à la fin du <body>.
   * Renvoie { html, decalage } : decalage = lignes ajoutées avant le HTML de l'élève.
   */
  function documentPage(fichiers, token, js) {
    var css = String(fichiers.css || "").replace(/<\/style/gi, "<\\/style");
    var html = String(fichiers.html || "");
    var tete = "<script>" + AMORCE_SRC + "(" + JSON.stringify({ token: token, limite: LIMITE_BOUCLE_MS }) + ");</script>" +
      "<style>\n" + css + "\n</style>";
    var lancer = "<script>window.__lancer(" +
      (js ? JSON.stringify(js).replace(/<\//g, "<\\/").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029") : "null") +
      ");</script>";
    var lignesTete = tete.split("\n").length - 1;

    if (/<html[\s>]|<body[\s>]|<head[\s>]/i.test(html)) {
      // page complète écrite par l'élève
      var out = html, m;
      if ((m = out.match(/<head[^>]*>/i))) out = out.replace(m[0], m[0] + tete);
      else if ((m = out.match(/<html[^>]*>/i))) out = out.replace(m[0], m[0] + "<head>" + tete + "</head>");
      else out = tete + out;
      if (/<\/body>/i.test(out)) out = out.replace(/<\/body>(?![\s\S]*<\/body>)/i, lancer + "</body>");
      else out += lancer;
      if (!/^\s*<!doctype/i.test(out)) out = "<!DOCTYPE html>" + out;
      return { html: out, decalage: lignesTete };
    }
    var debut = "<!DOCTYPE html><html lang=\"fr\"><head><meta charset=\"utf-8\">" + tete + "</head><body>\n";
    return { html: debut + html + "\n" + lancer + "</body></html>", decalage: debut.split("\n").length - 1 };
  }

  // Aiguillage des messages des cadres vers leur exécution
  var ecouteurs = {};
  global.addEventListener("message", function (e) {
    var m = e.data;
    if (!m || typeof m.token !== "string" || !ecouteurs[m.token]) return;
    var l = ecouteurs[m.token];
    if (e.source !== l.cadre.contentWindow) return;
    l.recevoir(m);
  });

  /*
   * Un cadre d'aperçu.
   *   options.visible : false pour un cadre caché (vérifications)
   *   options.surMessage(m) : console et erreurs au fil de l'eau
   */
  function Cadre(conteneur, options) {
    this.conteneur = conteneur;
    this.options = options || {};
    this.iframe = null;
    this.token = null;
  }

  Cadre.prototype.detruire = function () {
    if (this.token) delete ecouteurs[this.token];
    if (this.iframe && this.iframe.parentNode) this.iframe.parentNode.removeChild(this.iframe);
    this.iframe = null;
    this.token = null;
  };

  /*
   * Lance la page. Résout { syntaxe, erreurs: [...], logs: [...], fini }.
   * Une erreur de syntaxe JS est détectée avant : la page s'affiche alors sans son JavaScript.
   */
  Cadre.prototype.executer = function (fichiers) {
    var self = this;
    this.detruire();
    var prep = fichiers.js && fichiers.js.trim() ? global.Protection.preparer(fichiers.js) : { ok: true, code: null };
    var token = jeton();
    var page = documentPage(fichiers, token, prep.ok ? prep.code : null);
    var iframe = document.createElement("iframe");
    iframe.setAttribute("sandbox", "allow-scripts allow-modals allow-forms");
    iframe.setAttribute("title", "Aperçu de la page");
    iframe.className = "cadre-apercu";
    if (this.options.visible === false) {
      iframe.setAttribute("aria-hidden", "true");
      iframe.tabIndex = -1;
      iframe.style.cssText = "position:absolute;left:-10000px;top:0;width:800px;height:600px;border:0;visibility:hidden";
    }
    this.iframe = iframe;
    this.token = token;
    this.decalage = page.decalage;

    var resultat = { syntaxe: prep.ok ? null : prep.erreur, erreurs: [], logs: [], fini: false, prepare: prep };
    var attentes = {};
    this.attentes = attentes;

    return new Promise(function (resolve) {
      var termine = false;
      function finir() {
        if (termine) return;
        termine = true;
        resolve(resultat);
      }
      ecouteurs[token] = {
        cadre: iframe,
        recevoir: function (m) {
          if (m.type === "erreur") {
            if (m.fichier === "html" && m.ligne) m.ligne = Math.max(1, m.ligne - self.decalage);
            resultat.erreurs.push(m);
          }
          if (m.type === "console") resultat.logs.push(m);
          if (m.type === "fin") { resultat.fini = true; setTimeout(finir, 30); }
          if (m.type === "resultat" && attentes[m.id]) { attentes[m.id](m.resultat); delete attentes[m.id]; }
          if (self.options.surMessage) self.options.surMessage(m);
        }
      };
      iframe.srcdoc = page.html;
      self.conteneur.appendChild(iframe);
      setTimeout(finir, DELAI_CHARGEMENT_MS);
    });
  };

  /* Demande au cadre (déjà lancé) d'évaluer un critère. Résout les données brutes. */
  Cadre.prototype.examiner = function (critere, delai) {
    var self = this;
    return new Promise(function (resolve) {
      if (!self.iframe || !self.token) { resolve({ absent: true }); return; }
      var t = setTimeout(function () { delete self.attentes[critere.id]; resolve({ delai: true }); }, delai || 4000);
      self.attentes[critere.id] = function (r) { clearTimeout(t); resolve(r); };
      self.iframe.contentWindow.postMessage({ token: self.token, type: "verifier", critere: critere }, "*");
    });
  };

  global.Apercu = { Cadre: Cadre, documentPage: documentPage, LIMITE_BOUCLE_MS: LIMITE_BOUCLE_MS };
})(typeof window !== "undefined" ? window : globalThis);
