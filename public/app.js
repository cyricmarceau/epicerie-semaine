(function () {
  var data = null;
  var state = { store: null, portions: 2, pick: {}, done: {}, filter: "tout" };

  function money(n) { return n.toFixed(2).replace(".", ",") + " $"; }
  function num(n) { return String(Math.round(n * 100) / 100).replace(".", ","); }
  function snap(n, step) { return Math.max(step, Math.round(n / step) * step); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function $(id) { return document.getElementById(id); }

  // Icônes (traits simples). Le champ "icone" d'une recette choisit l'icône; sinon on devine d'après le nom.
  var ICONS = {
    poulet: '<path d="M30 8c6 0 10 4 10 10s-5 11-11 11c-2 0-3 1-4 2l-7 7"/><circle cx="14" cy="39" r="3"/><circle cx="9" cy="34" r="3"/><path d="M30 8c-6 0-11 5-11 11 0 2 0 3 1 4"/>',
    porc: '<ellipse cx="24" cy="27" rx="16" ry="13"/><ellipse cx="24" cy="31" rx="6" ry="4"/><circle cx="22" cy="31" r=".8" fill="currentColor"/><circle cx="26" cy="31" r=".8" fill="currentColor"/><circle cx="18" cy="23" r="1.2" fill="currentColor"/><circle cx="30" cy="23" r="1.2" fill="currentColor"/><path d="M11 18l-2-7 7 4M37 18l2-7-7 4"/>',
    boeuf: '<path d="M10 22c0-8 8-13 17-12 9 1 13 8 12 15-1 9-10 14-19 13S10 30 10 22z"/><path d="M20 22c0-3 3-5 6-4s4 4 2 6-8 2-8-2z"/>',
    poisson: '<path d="M6 24c6-8 16-11 26-6l8-6v24l-8-6C22 35 12 32 6 24z"/><circle cx="14" cy="22" r="1.4" fill="currentColor"/>',
    crevette: '<path d="M36 12c-12-2-24 6-24 18 0 6 4 10 10 10"/><path d="M36 12c2 6-2 14-10 18"/><path d="M22 40l-4 4M22 40l4 4"/><path d="M30 16l6-6M33 20l7-4"/>',
    pates: '<path d="M8 24h32c0 9-7 16-16 16S8 33 8 24z"/><path d="M14 24c0-6 2-12 6-14M20 24c0-6 2-11 6-13M26 24c0-5 2-9 6-11M32 24c0-4 1-7 4-9"/>',
    vege: '<path d="M38 10C20 10 10 20 10 38c18 0 28-10 28-28z"/><path d="M10 38L30 18"/>'
  };
  function iconFor(r) {
    if (r.icone && ICONS[r.icone]) return r.icone;
    var t = (r.nom + " " + r.ingredients.map(function (i) { return i.nom; }).join(" ")).toLowerCase();
    if (/crevette/.test(t)) return "crevette";
    if (/saumon|poisson|morue|tilapia|truite|thon/.test(t)) return "poisson";
    if (/poulet|pilon|dinde/.test(t)) return "poulet";
    if (/porc|côte levée|côtes levées|jambon|bacon/.test(t)) return "porc";
    if (/b(œ|oe)uf|veau|bifteck|rôti|palette|picanha|surlonge|steak/.test(t)) return "boeuf";
    if (/pâtes|spaghetti|macaroni|lasagne/.test(t)) return "pates";
    return "vege";
  }
  function svg(name) {
    return '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[name] + "</svg>";
  }

  // Quantité utilisée + ce qu'on achète vraiment (formats entiers : barquette, sac, pot…)
  function line(i, portions) {
    var q = snap(i.qte * portions / (data.portionsBase || 4), i.pas);
    var a = i.achat || { qte: i.pas, label: "", estime: false };
    var n = Math.max(1, Math.ceil(q / a.qte - 1e-9));
    var buy = n * a.qte;
    return { q: q, mange: q * i.prixUnite, buy: buy, n: n, caisse: buy * i.prixUnite, reste: buy - q, a: a };
  }
  function cost(r, portions) {
    return r.ingredients.reduce(function (s, i) {
      var l = line(i, portions);
      s.mange += l.mange; s.caisse += l.caisse; s.estime = s.estime || !!l.a.estime;
      if (i.taxable) { s.tps += l.caisse * 0.05; s.tvq += l.caisse * 0.09975; }
      return s;
    }, { mange: 0, caisse: 0, estime: false, tps: 0, tvq: 0 });
  }

  // Garde-manger de base : ce qu'on suppose toujours avoir à la maison
  var BASE_TXT = "sel, poivre, huile, beurre, farine, sucre (blanc ou cassonade), ail, oignon, épices séchées courantes (paprika, thym, origan, chili, cumin, cannelle)";
  var BASE_RE = /(sel|poivre|huile|beurre|farine|sucre|cassonade|ail|oignon|épice|paprika|thym séché|origan|chili|cumin|cannelle)/i;
  function pantryIsBase(r) {
    return r.gardeManger.every(function (x) {
      return x[1].split(/,| et /).every(function (p) { return !p.trim() || BASE_RE.test(p); });
    });
  }
  // Produits du garde-manger qui ne sont PAS dans la base (riz, pâtes, parmesan…) = à acheter à prix régulier
  function extraPantry(r) {
    var n = 0;
    r.gardeManger.forEach(function (x) {
      x[1].split(/,| et /).forEach(function (p) { if (p.trim() && !BASE_RE.test(p)) n++; });
    });
    return n;
  }
  function badges(r) {
    var horsN = r.ingredients.filter(function (i) { return i.horsSpecial; }).length;
    var spec = r.ingredients.length - horsN;
    var total = r.ingredients.length + extraPantry(r);
    var cent = horsN === 0 && pantryIsBase(r);
    return {
      chef: !!r.chef,
      cent: cent,
      strict: horsN === 0 && r.gardeManger.length === 0,
      pct: cent ? 100 : Math.round(100 * spec / total)
    };
  }
  function badgeHtml(b) {
    return (b.chef ? '<span class="bdg chef">Chef</span>' : "") +
      (b.strict ? '<span class="bdg strict">Spéciaux</span>'
        : b.cent ? '<span class="bdg cent">100 % spéciaux</span>'
        : '<span class="bdg pct">' + b.pct + " % spéciaux</span>");
  }

  // Étapes cochées : gardées sur l'appareil, par semaine (facultatif)
  function storeKey() { return "etapes:" + (data ? data.semaine : ""); }
  function loadDone() { try { state.done = JSON.parse(localStorage.getItem(storeKey())) || {}; } catch (e) { state.done = {}; } }
  function saveDone() { try { localStorage.setItem(storeKey(), JSON.stringify(state.done)); } catch (e) {} }

  function current() { return data.epiceries.find(function (e) { return e.id === state.store; }); }

  /* ---------- Accueil : tuiles des recettes ---------- */
  function renderHome() {
    var html = "";
    var f = state.filter;
    data.epiceries.forEach(function (e) {
      var tiles = "";
      e.recettes.forEach(function (r, idx) {
        var b = badges(r);
        if (f === "chef" && !b.chef) return;
        if (f === "cent" && !b.cent) return;
        if (f === "strict" && !b.strict) return;
        tiles += '<button type="button" class="tile" data-store="' + e.id + '" data-idx="' + idx + '">' +
          '<span class="ico">' + svg(iconFor(r)) + "</span>" +
          '<span class="tags">' + badgeHtml(b) + "</span>" +
          '<span class="nm">' + esc(r.nom) + "</span>" +
          (function () { var c = cost(r, 2); return '<span class="pr"><span><b>' + (c.estime ? "≈ " : "") + money(c.caisse + c.tps + c.tvq) + '</b><span class="cx">à la caisse</span></span><span>' + esc(r.temps) + "</span></span>"; })() +
          "</button>";
      });
      if (tiles) {
        html += '<section class="store-sec" aria-labelledby="sec-' + e.id + '"><h2 class="sec-title" id="sec-' + e.id + '">' + esc(e.nom) + '</h2><div class="tiles">' + tiles + "</div></section>";
      }
    });
    $("tiles").innerHTML = html || '<p class="empty">Aucune recette de ce type cette semaine.</p>';
    var opts = [["tout", "Toutes"], ["chef", "Chef"], ["cent", "100 % spéciaux"], ["strict", "Spéciaux"]];
    $("filters").innerHTML = opts.map(function (o) {
      return '<button type="button" data-f="' + o[0] + '" aria-pressed="' + (f === o[0]) + '">' + o[1] + "</button>";
    }).join("");
  }

  /* ---------- Détail : volet des épiceries ---------- */
  function renderStores() {
    $("stores").innerHTML = data.epiceries.map(function (e) {
      var on = e.id === state.store;
      return '<button type="button" role="tab" id="tab-' + e.id + '" data-id="' + e.id + '" aria-selected="' + on + '" aria-controls="recipe" tabindex="' + (on ? 0 : -1) + '">' + esc(e.nom) + "</button>";
    }).join("");
  }

  function renderRecipe() {
    var e = current();
    var idx = state.pick[e.id];
    var r = e.recettes[idx];
    var f = state.portions / (data.portionsBase || 4);
    var tot = cost(r, state.portions);

    var ings = r.ingredients.map(function (i) {
      var l = line(i, state.portions);
      var count = i.compte ? " (≈ " + Math.max(1, Math.round(l.q * i.compte.parUnite)) + " " + i.compte.label + ")" : "";
      var est = l.a.estime ? "≈ " : "";
      var fmt = i.unite === "lb"
        ? (l.n > 1 ? l.n + " × " : "") + (l.a.label ? l.a.label + " " : "") + est + num(l.a.qte) + " lb"
        : (l.a.label && l.a.label.charAt(0) !== "("
          ? l.n + " " + l.a.label
          : num(l.buy) + " " + i.unite + (l.buy > 1 && !/[sx)]$/.test(i.unite) ? "s" : "") + (l.a.label ? " " + l.a.label : ""));
      var reste = l.reste > 0.001 ? " · reste " + est + num(l.reste) + " " + i.unite : "";
      return '<li' + (i.horsSpecial ? ' class="hors"' : '') + '><span class="n"><span>' + esc(i.nom) + '</span>' +
        '<span class="d">Acheter : ' + esc(fmt) + " · " + esc(i.aubaine) + "</span>" +
        '<span class="d">Utilisé : ' + num(l.q) + " " + esc(i.unite) + esc(count) + esc(reste) + "</span></span>" +
        '<span class="mono">' + est + money(l.caisse) + "</span></li>";
    }).join("");

    var pantry = r.gardeManger.map(function (x) {
      if (!x[0]) return x[1];
      var v = x[0] * f;
      return num(v >= 20 ? Math.round(v / 5) * 5 : snap(v, 0.5)) + " " + x[1];
    }).join(" · ");

    var key = e.id + "-" + idx;
    var steps = r.etapes.map(function (s, k) {
      var on = !!state.done[key + "-" + k];
      return '<button type="button" class="step" data-step="' + k + '" aria-pressed="' + on + '"><span class="num" aria-hidden="true">' + (on ? "✓" : k + 1) + '</span><span class="txt">' + esc(s) + "</span></button>";
    }).join("");


    var el = $("recipe");
    el.setAttribute("aria-labelledby", "tab-" + e.id);
    el.innerHTML =
      '<div class="meta"><span>Recette ' + (idx + 1) + " sur " + e.recettes.length + "</span><span>" + esc(r.temps) + "</span></div>" +
      (function () { var h = badgeHtml(badges(r)); return h ? '<div class="tags">' + h + "</div>" : ""; })() +
      "<h2>" + esc(r.nom) + "</h2>" +
      '<div class="price"><div><div class="big">' + (tot.estime ? "≈ " : "") + money(tot.caisse + tot.tps + tot.tvq) + '</div>' +
        '<div class="tax">TPS 5 % : ' + money(tot.tps) + " · TVQ 9,975 % : " + money(tot.tvq) +
        (tot.tps + tot.tvq === 0 ? "<br>Aliments de base détaxés au Québec" : "") + "</div></div>" +
      '<div class="serv">2 portions</div></div>' +
      '<div class="block"><h3>À acheter</h3><ul class="list">' + ings + "</ul>" +
        (tot.estime ? '<p class="pantry">≈ : poids de barquette estimé; le prix exact dépend de l’étiquette en magasin. Les restes se congèlent.</p>' : "") +
        '<p class="pantry">Garde-manger : ' + esc(pantry || "rien — tout vient des spéciaux") + "</p></div>" +
      '<div class="block"><h3>Étapes — touche pour cocher</h3>' + steps + "</div>" +
      '<button type="button" class="next" id="next">Autre recette chez ' + esc(e.nom) + "</button>";
  }

  function renderSpecials() {
    var e = current();
    var count = e.speciaux.reduce(function (n, g) { return n + g.items.length; }, 0);
    $("specials-title").textContent = "Tous les spéciaux " + e.nom + " (" + count + ")";
    $("specials-body").innerHTML = e.speciaux.map(function (g) {
      return '<div class="block"><h3>' + esc(g.rayon) + '</h3><ul class="list">' + g.items.map(function (it) {
        return "<li><span>" + esc(it[0]) + '</span><span class="mono">' + esc(it[1]) + "</span></li>";
      }).join("") + "</ul></div>";
    }).join("");
  }

  /* ---------- Navigation (#accueil ou #maxi/2) ---------- */
  function show(view) {
    $("home").hidden = view !== "home";
    $("detail").hidden = view !== "detail";
  }

  function route() {
    var m = location.hash.slice(1).split("/");
    var e = data.epiceries.find(function (x) { return x.id === m[0]; });
    if (!e) { show("home"); return; }
    var idx = Number(m[1]);
    if (idx >= 0 && idx < e.recettes.length) state.pick[e.id] = idx;
    state.store = e.id;
    show("detail");
    renderStores(); renderRecipe(); renderSpecials();
  }

  function go(store, idx) { location.hash = store + "/" + idx; }

  $("filters").addEventListener("click", function (ev) {
    var b = ev.target.closest("button[data-f]");
    if (b) { state.filter = b.dataset.f; renderHome(); }
  });
  $("tiles").addEventListener("click", function (ev) {
    var t = ev.target.closest(".tile");
    if (!t) return;
    go(t.dataset.store, t.dataset.idx);
    window.scrollTo(0, 0);
  });
  $("back").addEventListener("click", function () {
    history.pushState(null, "", location.pathname);
    show("home");
    window.scrollTo(0, 0);
    $("title").focus();
  });
  $("stores").addEventListener("click", function (ev) {
    var b = ev.target.closest("button[data-id]");
    if (b) go(b.dataset.id, state.pick[b.dataset.id]);
  });
  $("stores").addEventListener("keydown", function (ev) {
    if (ev.key !== "ArrowRight" && ev.key !== "ArrowLeft") return;
    var ids = data.epiceries.map(function (e) { return e.id; });
    var i = ids.indexOf(state.store) + (ev.key === "ArrowRight" ? 1 : -1);
    var id = ids[(i + ids.length) % ids.length];
    go(id, state.pick[id]);
    setTimeout(function () { $("tab-" + id).focus(); }, 0);
  });
  $("recipe").addEventListener("click", function (ev) {
    var e = current();
    var s = ev.target.closest("button[data-step]");
    if (s) {
      var k = e.id + "-" + state.pick[e.id] + "-" + s.dataset.step;
      state.done[k] = !state.done[k];
      saveDone(); renderRecipe();
      var again = $("recipe").querySelector('[data-step="' + s.dataset.step + '"]');
      if (again) again.focus();
      return;
    }
    if (ev.target.closest("#next")) {
      go(e.id, (state.pick[e.id] + 1) % e.recettes.length);
      setTimeout(function () { $("next").focus(); }, 0);
    }
  });
  window.addEventListener("hashchange", route);
  window.addEventListener("popstate", route);

  fetch("data/semaine.json", { cache: "no-cache" })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      data = d;
      $("semaine").textContent = d.semaine;
      loadDone();
      d.epiceries.forEach(function (e) { state.pick[e.id] = 0; });
      $("base-txt").textContent = BASE_TXT.charAt(0).toUpperCase() + BASE_TXT.slice(1) + ".";
      renderHome();
      route();
    })
    .catch(function () { $("tiles").textContent = "Impossible de charger les recettes."; });
})();
