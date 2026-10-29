/*
 * Application élève (HTML / CSS / JavaScript) : onglets d'exercices, éditeur à trois
 * onglets, aperçu isolé, console, vérification, suivi SCORM.
 * Dépend de : CodeMirror, protection.js, apercu.js, erreurs.js, checker.js, scorm.js, data/…js
 */
(function () {
  "use strict";

  var SERIE = window.SERIE;
  var $ = function (id) { return document.getElementById(id); };
  var LANGUES = {
    html: { titre: "HTML", mode: "htmlmixed" },
    css: { titre: "CSS", mode: "css" },
    js: { titre: "JavaScript", mode: "javascript" }
  };

  var state = null;     // { v, code: { ex: { html, css, js } }, valide, essais, courant, onglet: { ex: langue }, auto }
  var current = null;   // exercice affiché
  var docs = {};        // docs[ex][langue] : documents CodeMirror (historique d'annulation conservé)
  var editor = null;
  var langue = "html";
  var apercu = null;
  var busy = false, dirty = false, saveTimer = null, autoTimer = null;
  var marques = [];     // lignes surlignées : { doc, ligne }
  var erreursOnglets = {};

  var graded = SERIE.exercices.filter(function (e) { return e.note; });

  /* ---------------- État et SCORM ---------------- */

  function score() {
    var n = graded.filter(function (e) { return state.valide[e.id]; }).length;
    return { n: n, total: graded.length, pct: graded.length ? Math.round((100 * n) / graded.length) : 100 };
  }
  function saveNow() { clearTimeout(saveTimer); Scorm.save(state, state.courant); }
  function saveSoon() { dirty = true; clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 1000); }
  function updateResult() {
    var s = score();
    Scorm.setResult(s.pct, s.n === s.total);
    $("progression").innerHTML = s.n === s.total
      ? "<strong>Tous les exercices sont validés.</strong>"
      : "Exercices validés : <strong>" + s.n + " sur " + s.total + "</strong>";
  }

  /* ---------------- Onglets d'exercices ---------------- */

  function buildTabs() {
    var nav = $("onglets");
    nav.innerHTML = "";
    nav.setAttribute("role", "tablist");
    SERIE.exercices.forEach(function (ex) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "onglet";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", ex.id === state.courant ? "true" : "false");
      b.textContent = ex.titre.replace(/^Exercice /, "");
      b.title = ex.titre;
      if (state.valide[ex.id]) {
        var c = document.createElement("span");
        c.className = "coche";
        c.textContent = "✓";
        c.setAttribute("aria-label", "validé");
        b.appendChild(c);
      }
      b.addEventListener("click", function () { if (!busy) show(ex.id); });
      nav.appendChild(b);
    });
  }

  function languesDe(ex) { return ex.onglets || ["html", "css", "js"]; }

  function codeDepart(ex, l) { return (ex.code && ex.code[l]) || ""; }

  function fichiers() {
    var f = {};
    ["html", "css", "js"].forEach(function (l) {
      f[l] = docs[current.id][l] ? docs[current.id][l].getValue() : codeDepart(current, l);
    });
    return f;
  }

  /* ---------------- Onglets HTML / CSS / JS ---------------- */

  function buildCodeTabs() {
    var nav = $("onglets-code");
    nav.innerHTML = "";
    languesDe(current).forEach(function (l) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "onglet-code";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", l === langue ? "true" : "false");
      b.textContent = LANGUES[l].titre;
      if (erreursOnglets[l]) {
        var p = document.createElement("span");
        p.className = "pastille";
        p.title = "Erreur dans cet onglet";
        p.setAttribute("aria-label", "contient une erreur");
        b.appendChild(p);
      }
      b.addEventListener("click", function () { choisirLangue(l); });
      nav.appendChild(b);
    });
  }

  function choisirLangue(l) {
    langue = l;
    state.onglet[current.id] = l;
    editor.swapDoc(docs[current.id][l]);
    buildCodeTabs();
    editor.focus();
    saveSoon();
  }

  /* ---------------- Affichage d'un exercice ---------------- */

  function show(id) {
    current = SERIE.exercices.find(function (e) { return e.id === id; }) || SERIE.exercices[0];
    state.courant = current.id;
    buildTabs();
    $("titre-exercice").textContent = current.titre;
    $("texte-enonce").innerHTML = current.enonce;

    if (!docs[current.id]) {
      docs[current.id] = {};
      var saved = state.code[current.id] || {};
      languesDe(current).forEach(function (l) {
        var txt = saved[l] != null ? saved[l] : codeDepart(current, l);
        var d = CodeMirror.Doc(txt, LANGUES[l].mode);
        d.on("change", function () { onChange(l); });
        docs[current.id][l] = d;
      });
    }
    var langs = languesDe(current);
    langue = langs.indexOf(state.onglet[current.id]) >= 0 ? state.onglet[current.id] : langs[langs.length - 1];
    erreursOnglets = {};
    editor.swapDoc(docs[current.id][langue]);
    buildCodeTabs();

    $("btn-verifier").hidden = !current.note;
    renderCriteria(null);
    executer();
    saveSoon();
  }

  function onChange(l) {
    if (!current) return;
    state.code[current.id] = state.code[current.id] || {};
    state.code[current.id][l] = docs[current.id][l].getValue();
    effacerMarques();
    saveSoon();
    if (state.auto) {
      clearTimeout(autoTimer);
      autoTimer = setTimeout(function () { if (!busy) executer(); }, 900);
    }
  }

  /* ---------------- Console ---------------- */

  var CONSOLE_VIDE = "Les console.log() de votre programme et les messages d'erreur apparaissent ici.";

  function viderConsole() {
    var c = $("console");
    c.innerHTML = "";
    c.className = "console vide";
    c.textContent = CONSOLE_VIDE;
  }

  function ajouterConsole(classe, texte, lien) {
    var c = $("console");
    if (c.classList.contains("vide")) { c.className = "console"; c.textContent = ""; }
    if (c.childNodes.length > 600 && classe !== "erreur") return;
    var div = document.createElement("div");
    div.className = "ligne-console " + classe;
    var span = document.createElement("span");
    span.textContent = texte;
    div.appendChild(span);
    if (lien) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "aller";
      b.textContent = "voir la ligne " + lien.ligne;
      b.addEventListener("click", function () { allerA(lien.langue, lien.ligne); });
      div.appendChild(b);
    }
    c.appendChild(div);
    c.scrollTop = c.scrollHeight;
  }

  function effacerMarques() {
    marques.forEach(function (m) { try { m.doc.removeLineClass(m.ligne - 1, "background", "ligne-erreur"); } catch (e) { /* rien */ } });
    marques = [];
    if (Object.keys(erreursOnglets).length) { erreursOnglets = {}; buildCodeTabs(); }
  }

  function marquer(l, ligne) {
    var d = docs[current.id] && docs[current.id][l];
    if (!d || !ligne || ligne > d.lineCount()) return;
    d.addLineClass(ligne - 1, "background", "ligne-erreur");
    marques.push({ doc: d, ligne: ligne });
    erreursOnglets[l] = true;
  }

  function allerA(l, ligne) {
    if (languesDe(current).indexOf(l) < 0) return;
    if (l !== langue) choisirLangue(l);
    editor.setCursor({ line: ligne - 1, ch: 0 });
    editor.scrollIntoView({ line: ligne - 1, ch: 0 }, 80);
    editor.focus();
  }

  /* ---------------- Exécution ---------------- */

  var queue = Promise.resolve();
  function exclusive(task) {
    queue = queue.then(function () { setBusy(true); return task(); })
      .catch(function (e) { console.error(e); ajouterConsole("erreur", "Erreur interne : " + e.message); })
      .then(function () { setBusy(false); });
    return queue;
  }
  function setBusy(b) {
    busy = b;
    ["btn-executer", "btn-verifier", "btn-recommencer"].forEach(function (id) { $(id).disabled = b; });
  }

  function avertissements(f) {
    var langs = languesDe(current);
    if (langs.indexOf("html") >= 0) {
      Erreurs.html(f.html).forEach(function (a) { ajouterConsole("avert", "⚠ HTML : " + a.message, { langue: "html", ligne: a.ligne }); marquer("html", a.ligne); });
    }
    if (langs.indexOf("css") >= 0) {
      Erreurs.css(f.css).forEach(function (a) { ajouterConsole("avert", "⚠ " + a.message, { langue: "css", ligne: a.ligne }); marquer("css", a.ligne); });
    }
  }

  function afficherErreur(err, f) {
    var t = Erreurs.execution(err, f.js);
    var l = err.fichier === "html" ? "html" : "js";
    if (err.nom === "BoucleInfinie" || /^__BOUCLE__/.test(err.message)) l = "js";
    ajouterConsole("erreur", "✗ " + t.message, t.ligne ? { langue: l, ligne: t.ligne } : null);
    if (t.ligne) marquer(l, t.ligne);
  }

  function executer() {
    var f = fichiers();
    effacerMarques();
    viderConsole();
    return exclusive(function () {
      avertissements(f);
      return apercu.executer(f).then(function (r) {
        if (r.syntaxe) {
          var s = Erreurs.syntaxe(f.js, r.syntaxe);
          ajouterConsole("erreur", "✗ " + s.message + " La page s'affiche sans son JavaScript.", s.ligne ? { langue: "js", ligne: s.ligne } : null);
          if (s.ligne) marquer("js", s.ligne);
        }
        buildCodeTabs();
      });
    });
  }

  // Console et erreurs de la page visible, au fil de l'eau (y compris après un clic)
  function surMessage(m) {
    if (!current) return;
    if (m.type === "console") {
      ajouterConsole(m.niveau === "error" ? "erreur" : m.niveau === "warn" ? "avert" : m.niveau === "info" ? "info" : "log", m.texte);
    } else if (m.type === "erreur") {
      afficherErreur(m, fichiers());
      buildCodeTabs();
    }
  }

  /* ---------------- Vérification ---------------- */

  function renderCriteria(result) {
    var box = $("criteres"), list = $("liste-criteres"), bilan = $("bilan");
    if (!current.note) { box.hidden = true; return; }
    box.hidden = false;
    list.innerHTML = "";
    if (!result) {
      bilan.hidden = !state.valide[current.id];
      bilan.className = "bilan juste";
      bilan.textContent = "Exercice déjà validé. Vous pouvez encore modifier votre code et le vérifier.";
    } else if (result.erreur) {
      bilan.hidden = false;
      bilan.className = "bilan faux";
      bilan.textContent = "Le JavaScript contient une erreur de syntaxe : corrigez-la, puis vérifiez à nouveau.";
    } else {
      bilan.hidden = false;
      bilan.className = "bilan " + (result.ok ? "juste" : "faux");
      var nOk = result.resultats.filter(function (r) { return r.ok; }).length;
      bilan.textContent = result.ok ? "Bravo, exercice validé !"
        : nOk + " critère(s) rempli(s) sur " + result.resultats.length + ". Lisez les indications ci-dessous.";
    }
    (current.checks || []).forEach(function (c) {
      var r = result && !result.erreur ? result.resultats.find(function (x) { return x.id === c.id; }) : null;
      var li = document.createElement("li");
      li.className = "critere " + (r ? (r.ok ? "ok" : "ko") : "attente");
      var mark = document.createElement("span");
      mark.className = "marque";
      mark.textContent = r ? (r.ok ? "✓" : "✗") : "○";
      mark.setAttribute("aria-label", r ? (r.ok ? "réussi" : "pas encore") : "à vérifier");
      var label = document.createElement("span");
      label.className = "libelle";
      label.textContent = c.label;
      li.appendChild(mark);
      li.appendChild(label);
      if (r && !r.ok && r.message) {
        var ex = document.createElement("span");
        ex.className = "explication";
        ex.textContent = r.message;
        li.appendChild(ex);
      }
      list.appendChild(li);
    });
  }

  function verifier() {
    if (busy || !current.note) return;
    var ex = current, f = fichiers();
    effacerMarques();
    viderConsole();
    exclusive(function () {
      avertissements(f);
      return apercu.executer(f).then(function (r) {
        if (r.syntaxe) {
          var s = Erreurs.syntaxe(f.js, r.syntaxe);
          ajouterConsole("erreur", "✗ " + s.message, s.ligne ? { langue: "js", ligne: s.ligne } : null);
          if (s.ligne) marquer("js", s.ligne);
        }
        return Checker.verifierExercice(ex, f, $("cadres-caches"));
      }).then(function (res) {
        state.essais[ex.id] = (state.essais[ex.id] || 0) + 1;
        if (res.ok && !state.valide[ex.id]) state.valide[ex.id] = true;
        Scorm.recordInteraction({
          id: ex.id,
          description: ex.titre + " – essai " + state.essais[ex.id],
          response: languesDe(ex).map(function (l) { return "/* " + LANGUES[l].titre + " */\n" + f[l]; }).join("\n"),
          correct: res.ok
        });
        renderCriteria(res);
        buildTabs();
        buildCodeTabs();
        updateResult();
        saveNow();
        Scorm.commit();
        dirty = false;
      });
    });
  }

  /* Remet le code de départ de l'exercice (Ctrl+Z dans chaque onglet pour revenir en arrière). */
  function recommencer() {
    if (busy) return;
    languesDe(current).forEach(function (l) { docs[current.id][l].setValue(codeDepart(current, l)); });
    renderCriteria(null);
    executer();
    ajouterConsole("info", "Code de départ remis. Ctrl+Z (ou Cmd+Z) dans un onglet pour revenir en arrière.");
  }

  /* ---------------- Plein écran ---------------- */

  /* Petit bouton en bas à droite ; caché si le navigateur ou Moodle ne permet pas le plein écran. */
  function boutonPleinEcran() {
    var root = document.documentElement;
    var demander = root.requestFullscreen || root.webkitRequestFullscreen;
    var permis = document.fullscreenEnabled || document.webkitFullscreenEnabled;
    if (!demander || !permis) return;
    var AGRANDIR = "M1 5V1h4M9 1h4v4M13 9v4H9M5 13H1V9";
    var REDUIRE = "M5 1v4H1M13 5H9V1M9 13V9h4M1 9h4v4";
    var b = document.createElement("button");
    b.type = "button";
    b.id = "btn-plein-ecran";
    b.className = "plein-ecran";
    b.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d=""/></svg>';
    var icone = b.querySelector("path");
    document.body.appendChild(b);
    function actuel() { return document.fullscreenElement || document.webkitFullscreenElement; }
    function maj() {
      var on = !!actuel();
      b.title = on ? "Quitter le plein écran" : "Plein écran";
      b.setAttribute("aria-label", b.title);
      icone.setAttribute("d", on ? REDUIRE : AGRANDIR);
      document.body.classList.toggle("en-plein-ecran", on);
      if (editor) setTimeout(function () { editor.refresh(); }, 50);
    }
    b.addEventListener("click", function () {
      if (actuel()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else demander.call(root);
    });
    document.addEventListener("fullscreenchange", maj);
    document.addEventListener("webkitfullscreenchange", maj);
    maj();
  }

  /* ---------------- Démarrage ---------------- */

  function init() {
    state = Scorm.start(SERIE.id) || {};
    state.v = 1;
    state.code = state.code || {};
    state.valide = state.valide || {};
    state.essais = state.essais || {};
    state.onglet = state.onglet || {};
    if (!SERIE.exercices.some(function (e) { return e.id === state.courant; })) state.courant = SERIE.exercices[0].id;

    document.title = SERIE.titre;
    $("titre-serie").textContent = SERIE.titre;
    $("pied").textContent = Scorm.connected()
      ? "Votre travail est enregistré automatiquement dans Moodle."
      : "Mode test hors Moodle : votre travail est enregistré dans ce navigateur uniquement.";

    apercu = new Apercu.Cadre($("apercu"), { surMessage: surMessage });
    boutonPleinEcran();

    editor = CodeMirror($("editeur"), {
      value: "",
      lineNumbers: true,
      indentUnit: 4,
      tabSize: 4,
      matchBrackets: true,
      autoCloseBrackets: true,
      autoCloseTags: true,
      extraKeys: {
        "Tab": function (cm) {
          if (cm.somethingSelected()) cm.indentSelection("add");
          else cm.replaceSelection("    ", "end");
        },
        "Shift-Tab": function (cm) { cm.indentSelection("subtract"); },
        "Ctrl-Enter": function () { if (!busy) executer(); },
        "Cmd-Enter": function () { if (!busy) executer(); }
      }
    });

    $("btn-executer").addEventListener("click", function () { if (!busy) executer(); });
    $("btn-verifier").addEventListener("click", verifier);
    $("btn-recommencer").addEventListener("click", recommencer);
    $("auto").checked = !!state.auto;
    $("auto").addEventListener("change", function () {
      state.auto = $("auto").checked;
      saveSoon();
      if (state.auto && !busy) executer();
    });
    $("btn-agrandir").addEventListener("click", function () {
      var grand = document.body.classList.toggle("apercu-grand");
      $("btn-agrandir").textContent = grand ? "Réduire" : "Agrandir";
      $("btn-agrandir").setAttribute("aria-pressed", grand ? "true" : "false");
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && document.body.classList.contains("apercu-grand")) $("btn-agrandir").click();
    });

    setInterval(function () { if (dirty) { saveNow(); Scorm.commit(); dirty = false; } }, 30000);
    var closed = false;
    function close() { if (closed) return; closed = true; saveNow(); Scorm.finish(); }
    window.addEventListener("pagehide", close);
    window.addEventListener("beforeunload", close);

    updateResult();
    show(state.courant);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
