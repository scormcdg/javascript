/*
 * Analyse du JavaScript de l'élève avant exécution (avec Acorn) :
 *  - erreurs de syntaxe détectées avant de lancer la page (ligne et colonne) ;
 *  - protection contre les boucles infinies : chaque boucle reçoit un compteur
 *    qui l'arrête au bout de quelques secondes, sans changer les numéros de ligne.
 * Dépend de : vendor/acorn/acorn.js
 */
(function (global) {
  "use strict";

  var LOOPS = { ForStatement: 1, WhileStatement: 1, DoWhileStatement: 1, ForInStatement: 1, ForOfStatement: 1 };

  function parse(code) {
    return global.acorn.parse(code, {
      ecmaVersion: "latest",
      sourceType: "script",
      locations: true,
      allowHashBang: true
    });
  }

  /* Parcourt l'arbre syntaxique ; fn(noeud, parent, profondeur en boucles) */
  function walk(node, parent, fn, depth) {
    if (!node || typeof node.type !== "string") return;
    depth = depth || 0;
    fn(node, parent, depth);
    var d = depth + (LOOPS[node.type] ? 1 : 0);
    for (var k in node) {
      if (k === "loc" || k === "start" || k === "end" || k === "type") continue;
      var v = node[k];
      if (Array.isArray(v)) {
        for (var i = 0; i < v.length; i++) if (v[i] && typeof v[i].type === "string") walk(v[i], node, fn, d);
      } else if (v && typeof v.type === "string") {
        walk(v, node, fn, d);
      }
    }
  }

  /*
   * Résout { ok: true, code } (code instrumenté) ou { ok: false, erreur: { ligne, colonne, brut } }.
   * Les insertions se font sur les mêmes lignes que le code d'origine.
   */
  function preparer(code) {
    var ast;
    try {
      ast = parse(code);
    } catch (e) {
      return { ok: false, erreur: { ligne: e.loc ? e.loc.line : null, colonne: e.loc ? e.loc.column + 1 : null, brut: String(e.message), position: e.pos } };
    }
    var inserts = []; // { pos, texte, fermeture, cle }
    var id = 0;
    walk(ast, null, function (node, parent, depth) {
      if (!LOOPS[node.type]) return;
      id++;
      var line = node.loc.start.line;
      // la boucle (avec son étiquette éventuelle) est entourée d'un bloc qui démarre le chronomètre
      var outer = parent && parent.type === "LabeledStatement" && parent.body === node ? parent : node;
      inserts.push({ pos: outer.start, texte: "{__boucle.d(" + id + ");", fermeture: false, cle: depth * 2 });
      inserts.push({ pos: outer.end, texte: "}", fermeture: true, cle: depth * 2 });
      // à chaque tour : vérification du temps écoulé
      var body = node.body;
      var tick = "__boucle.t(" + id + "," + line + ");";
      if (body.type === "BlockStatement") {
        inserts.push({ pos: body.start + 1, texte: tick, fermeture: false, cle: depth * 2 + 1 });
      } else {
        inserts.push({ pos: body.start, texte: "{" + tick, fermeture: false, cle: depth * 2 + 1 });
        inserts.push({ pos: body.end, texte: "}", fermeture: true, cle: depth * 2 + 1 });
      }
    });
    // Ordre dans le texte, à une même position : d'abord les fermetures (la plus profonde
    // en premier), puis les ouvertures (la moins profonde en premier).
    function textOrder(a, b) {
      if (a.fermeture !== b.fermeture) return a.fermeture ? -1 : 1;
      return a.fermeture ? b.cle - a.cle : a.cle - b.cle;
    }
    // On insère de la fin vers le début ; à une même position, chaque insertion se place
    // avant les précédentes : on insère donc dans l'ordre inverse du texte.
    inserts.sort(function (a, b) { return b.pos - a.pos || -textOrder(a, b); });
    var out = code;
    inserts.forEach(function (ins) { out = out.slice(0, ins.pos) + ins.texte + out.slice(ins.pos); });
    return { ok: true, code: out, boucles: id, ast: ast };
  }

  /* Noms déclarés au niveau principal (fonctions, variables) : utile pour la vérification. */
  function declarations(ast) {
    var noms = {};
    (ast && ast.body || []).forEach(function (n) {
      if (n.type === "FunctionDeclaration" && n.id) noms[n.id.name] = "function";
      if (n.type === "VariableDeclaration") {
        n.declarations.forEach(function (d) { if (d.id && d.id.name) noms[d.id.name] = n.kind; });
      }
    });
    return noms;
  }

  global.Protection = { preparer: preparer, declarations: declarations, parse: parse };
})(typeof window !== "undefined" ? window : globalThis);
