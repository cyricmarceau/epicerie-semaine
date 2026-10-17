(function () {
  var data = null;
  var state = { store: null, portions: 2, pick: {}, done: {}, filter: "tout", cart: [], got: {}, missing: {} };

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
    return '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[name] + "</svg>";
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
  function qtyTxt(q, f) {
    if (!q) return "";
    var v = q * f;
    return num(v >= 20 ? Math.round(v / 5) * 5 : snap(v, 0.5)) + " ";
  }
  // Sépare le garde-manger : base (tu l'as déjà) / pas en spécial (à acheter à prix régulier)
  function splitPantry(r, f) {
    var base = [], extra = [];
    r.gardeManger.forEach(function (x) {
      var parts = x[1].split(/,| et /).map(function (p) { return p.trim(); }).filter(Boolean);
      var bad = parts.filter(function (p) { return !BASE_RE.test(p); });
      if (!bad.length) base.push(qtyTxt(x[0], f) + x[1]);
      else if (bad.length === parts.length) extra.push(qtyTxt(x[0], f) + x[1]);
      else {
        extra = extra.concat(bad);
        base.push(parts.filter(function (p) { return BASE_RE.test(p); }).join(" et "));
      }
    });
    return { base: base, extra: extra };
  }
  // Noms courts des produits pas en spécial (pour les tuiles)
  function notSpecialNames(r) {
    var names = r.ingredients.filter(function (i) { return i.horsSpecial; }).map(function (i) { return i.nom.split(",")[0]; });
    r.gardeManger.forEach(function (x) {
      x[1].split(/,| et /).forEach(function (p) {
        p = p.trim();
        if (p && !BASE_RE.test(p)) names.push(p.replace(/^(c\. à (soupe|thé) d[e’']\s?|tasses? d[e’']\s?|g d[e’']\s?|boîte d[e’']\s?)/, ""));
      });
    });
    return names;
  }
  // Part du prix à la caisse qui vient des produits en spécial (formats entiers, 2 portions)
  function specShare(r) {
    var sp = 0, all = 0;
    r.ingredients.forEach(function (i) { var c = line(i, 2).caisse; all += c; if (!i.horsSpecial) sp += c; });
    return all ? Math.floor(100 * sp / all) : 100;
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
      pct: cent ? 100 : specShare(r),
      prot: (r.proteines || 0) >= 30,
      protG: r.proteines || 0
    };
  }
  // withPct : ajoute le badge « X % spéciaux » (page recette); sur les tuiles, le % est sur l'icône
  var DUMBBELL = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 7v10M3 9.5v5M18 7v10M21 9.5v5M6 12h12"/></svg>';
  function badgeHtml(b, withPct) {
    return (b.prot ? '<span class="bdg prot">' + DUMBBELL + "Protéine</span>" : "") +
      (b.chef ? '<span class="bdg chef">Chef</span>' : "") +
      (b.cent ? '<span class="bdg cent">100 % spéciaux</span>'
        : withPct ? '<span class="bdg pct">' + b.pct + " % spéciaux</span>" : "");
  }

  // Étapes cochées : gardées sur l'appareil, par semaine (facultatif)
  function storeKey() { return "etapes:" + (data ? data.semaine : ""); }
  function loadDone() { try { state.done = JSON.parse(localStorage.getItem(storeKey())) || {}; } catch (e) { state.done = {}; } }
  function saveDone() { try { localStorage.setItem(storeKey(), JSON.stringify(state.done)); } catch (e) {} }

  // Panier : recettes ajoutées + articles cochés, gardés sur l'appareil pour la semaine
  function cartKey() { return "panier:" + (data ? data.semaine : ""); }
  function loadCart() {
    try { var c = JSON.parse(localStorage.getItem(cartKey())) || {}; state.cart = c.cart || []; state.got = c.got || {}; state.missing = c.missing || {}; }
    catch (e) { state.cart = []; state.got = {}; state.missing = {}; }
  }
  function saveCart() { try { localStorage.setItem(cartKey(), JSON.stringify({ cart: state.cart, got: state.got, missing: state.missing })); } catch (e) {} }

  // Garde-manger de base : format courant et prix régulier ESTIMÉ (Québec) si jamais il en manque
  var BASE_ITEMS = [
    { k: "huile", nom: "Huile végétale", fmt: "bouteille de 1 L", prix: 4.99, re: /huile/i, sp: /huile/i },
    { k: "beurre", nom: "Beurre", fmt: "454 g", prix: 5.99, re: /beurre/i, sp: /beurre/i },
    { k: "ail", nom: "Ail", fmt: "filet de 3 têtes", prix: 1.99, re: /\bail\b|d’ail|d'ail/i, sp: /\bail\b/i },
    { k: "oignon", nom: "Oignons jaunes", fmt: "sac de 2 lb", prix: 2.49, re: /oignon/i, sp: /oignon/i },
    { k: "farine", nom: "Farine tout usage", fmt: "sac de 2,5 kg", prix: 4.99, re: /farine/i, sp: /farine/i },
    { k: "sucre", nom: "Sucre ou cassonade", fmt: "sac de 1 à 2 kg", prix: 3.49, re: /sucre|cassonade/i, sp: /sucre|cassonade/i },
    { k: "sel", nom: "Sel", fmt: "1 kg", prix: 1.99, re: /\bsel\b/i, sp: /\bsel\b/i },
    { k: "poivre", nom: "Poivre noir moulu", fmt: "pot de 100 g", prix: 4.49, re: /poivre/i, sp: /poivre/i },
    { k: "epices", nom: "Épices séchées (paprika, thym, origan…)", fmt: "pot", prix: 3.49, re: /paprika|thym séché|origan|chili|cumin|cannelle|épice/i, sp: /épice/i }
  ];
  function parsePrice(t) { var m = /(\d+),(\d{2})\s*\$/.exec(t); return m ? Number(m[1] + "." + m[2]) : null; }
  // Ingrédients de base utilisés par les recettes du panier + spécial trouvé cette semaine, s'il y en a un
  function baseNeeded(valid, all) {
    var used = {};
    valid.forEach(function (k) {
      recipeOf(k).r.gardeManger.forEach(function (x) {
        x[1].split(/,| et /).forEach(function (part) {
          BASE_ITEMS.forEach(function (b) { if (b.re.test(part)) used[b.k] = true; });
        });
      });
    });
    return BASE_ITEMS.filter(function (b) { return all || used[b.k] || state.missing[b.k]; }).map(function (b) {
      var deal = null;
      data.epiceries.forEach(function (e) {
        e.speciaux.forEach(function (g) {
          g.items.forEach(function (it) {
            if (deal || !b.sp.test(it[0])) return;
            var pr = parsePrice(it[1]);
            if (pr !== null && !/\/lb|pour/.test(it[1])) deal = { store: e.nom, nom: it[0], prix: pr, txt: it[1] };
          });
        });
      });
      return { b: b, deal: deal };
    });
  }
  function inCart(k) { return state.cart.indexOf(k) !== -1; }
  function toggleCart(k) {
    var i = state.cart.indexOf(k);
    if (i === -1) state.cart.push(k); else state.cart.splice(i, 1);
    saveCart(); updateCartCount();
  }
  function updateCartCount() {
    var n = state.cart.length;
    var m = Object.keys(state.missing).filter(function (k) { return state.missing[k]; }).length;
    $("cart-n").textContent = n + m;
    $("cart-btn").setAttribute("aria-label", "Panier : " + n + " recette" + (n > 1 ? "s" : "") + ", " + m + " produit" + (m > 1 ? "s" : "") + " de base");
  }
  function recipeOf(k) {
    var m = k.split("/"); var e = data.epiceries.find(function (x) { return x.id === m[0]; });
    return e && e.recettes[Number(m[1])] ? { e: e, r: e.recettes[Number(m[1])], idx: Number(m[1]) } : null;
  }
  function fmtBuy(i, n, a, buy) {
    var est = a.estime ? "≈ " : "";
    return i.unite === "lb"
      ? (n > 1 ? n + " × " : "") + (a.label ? a.label + " " : "") + est + num(a.qte) + " lb"
      : (a.label && a.label.charAt(0) !== "(" ? n + " " + a.label
        : num(buy) + " " + i.unite + (buy > 1 && !/[sx)]$/.test(i.unite) ? "s" : "") + (a.label ? " " + a.label : ""));
  }
  function renderCart() {
    var valid = state.cart.filter(recipeOf);
    var anyMiss = Object.keys(state.missing).some(function (k) { return state.missing[k]; });
    // Recettes choisies
    var html = !valid.length ? '<p class="empty">Aucune recette dans le panier. Touche le <b>+</b> à côté d’une recette pour ajouter ses ingrédients.</p>' : '<div class="card"><h3>Recettes (' + valid.length + ')</h3><ul class="list">' + valid.map(function (k) {
      var x = recipeOf(k);
      return '<li><span class="n"><span>' + esc(x.r.nom) + '</span><span class="d">' + esc(x.e.nom) + " · 2 portions</span></span>" +
        '<button type="button" class="rm" data-rm="' + k + '" aria-label="Retirer ' + esc(x.r.nom) + ' du panier">Retirer</button></li>';
    }).join("") + "</ul></div>";
    // Articles fusionnés par épicerie
    var grand = 0, anyEst = false;
    data.epiceries.forEach(function (e) {
      var items = {}, order = [];
      valid.forEach(function (k) {
        var x = recipeOf(k); if (x.e.id !== e.id) return;
        x.r.ingredients.forEach(function (i) {
          var q = line(i, 2).q;
          var key = i.nom.toLowerCase();
          if (!items[key]) { items[key] = { i: i, q: 0 }; order.push(key); }
          items[key].q += q;
        });
      });
      if (!order.length) return;
      var sub = 0;
      var rows = order.map(function (key) {
        var it = items[key], i = it.i;
        var a = i.achat || { qte: i.pas, label: "", estime: false };
        var n = Math.max(1, Math.ceil(it.q / a.qte - 1e-9));
        var buy = n * a.qte, price = buy * i.prixUnite * (i.taxable ? 1.14975 : 1);
        sub += price; anyEst = anyEst || !!a.estime;
        var gk = e.id + ":" + key, got = !!state.got[gk];
        return '<li class="' + (i.horsSpecial ? "hors " : "") + (got ? "got" : "") + '"><button type="button" class="chk" data-got="' + esc(gk) + '" aria-pressed="' + got + '">' +
          '<span class="box" aria-hidden="true">' + (got ? "✓" : "") + '</span><span class="n"><span>' + esc(i.nom) + "</span>" +
          '<span class="d">' + esc(fmtBuy(i, n, a, buy)) + " · " + esc(i.aubaine) + "</span></span></button>" +
          '<span class="mono">' + (a.estime ? "≈ " : "") + money(price) + "</span></li>";
      }).join("");
      grand += sub;
      html += '<section class="store-sec"><h2 class="sec-title">' + esc(e.nom) + ' <small>' + money(sub) + "</small></h2>" +
        '<div class="card"><ul class="list cart-list">' + rows + "</ul></div></section>";
    });
    var need = baseNeeded(valid, true), miss = 0;
    if (need.length) {
      var rowsB = need.map(function (x) {
        var on = !!state.missing[x.b.k];
        var price = x.deal ? x.deal.prix : x.b.prix;
        if (on) { miss += price; if (!x.deal) anyEst = true; }
        var where = x.deal ? '<span class="d deal">En spécial chez ' + esc(x.deal.store) + " : " + esc(x.deal.nom) + " · " + esc(x.deal.txt) + "</span>"
                           : '<span class="d">' + esc(x.b.fmt) + " · prix régulier ≈ " + money(x.b.prix) + "</span>";
        return '<li class="' + (on ? "miss" : "") + '"><button type="button" class="chk" data-miss="' + x.b.k + '" aria-pressed="' + on + '">' +
          '<span class="box" aria-hidden="true">' + (on ? "+" : "") + '</span><span class="n"><span>' + esc(x.b.nom) + "</span>" + where + "</span></button>" +
          '<span class="mono">' + (on ? (x.deal ? "" : "≈ ") + money(price) : "—") + "</span></li>";
      }).join("");
      html += '<section class="store-sec"><h2 class="sec-title">Garde-manger <small>' + (miss ? money(miss) : "tu l’as déjà?") + "</small></h2>" +
        '<div class="card"><p class="pantry">Ce que tu as normalement à la maison. Touche ce qui te manque pour l’ajouter aux achats.</p><ul class="list cart-list base-list">' + rowsB + "</ul></div></section>";
      grand += miss;
    }
    html = '<div class="price cart-total"><div><div class="big">' + (anyEst ? "≈ " : "") + money(grand) + '</div><div class="tax">Total à la caisse, taxes incluses' + (miss ? " · garde-manger manquant inclus" : " · garde-manger de base exclu") + "</div></div></div>" + html +
      ((valid.length || anyMiss) ? '<button type="button" class="back" id="cart-clear">Vider le panier</button>' : "");
    $("cart-body").innerHTML = html;
  }

  function current() { return data.epiceries.find(function (e) { return e.id === state.store; }); }

  /* ---------- 1. Accueil : les 3 épiceries ---------- */
  function renderHome() {
    $("store-cards").innerHTML = data.epiceries.map(function (e) {
      var min = Math.min.apply(null, e.recettes.map(function (r) { var c = cost(r, 2); return c.caisse + c.tps + c.tvq; }));
      var nSp = e.speciaux.reduce(function (k, g) { return k + g.items.length; }, 0);
      var inC = state.cart.filter(function (k) { return k.split("/")[0] === e.id; }).length;
      return '<a class="store-card" href="#' + e.id + '"><span class="sc-name">' + esc(e.nom) + "</span>" +
        '<span class="sc-meta">Dès ' + money(min) + "<br>" + nSp + " spéciaux cette semaine</span>" +
        (inC ? '<span class="sc-cart">' + inC + " dans le panier</span>" : "") +
        '<span class="sc-go" aria-hidden="true">→</span></a>';
    }).join("");
  }

  /* ---------- 2. Recettes d'une épicerie ---------- */
  function renderStore() {
    var e = current();
    $("store-title").textContent = e.nom;
    $("recipes").innerHTML = e.recettes.map(function (r, idx) {
      var ck = e.id + "/" + idx, on = inCart(ck), c = cost(r, 2);
      return '<div class="rec-row"><a class="rec-open" href="#' + e.id + "/" + idx + '">' +
        '<span class="ico-s ic-' + iconFor(r) + '">' + svg(iconFor(r)) + "</span>" +
        '<span class="rec-t"><span class="nm">' + esc(r.nom) + '</span><span class="rec-m"><b>' + (c.estime ? "≈ " : "") + money(c.caisse + c.tps + c.tvq) + "</b> · " + esc(r.temps) + "</span></span></a>" +
        '<button type="button" class="add" data-add="' + ck + '" aria-pressed="' + on + '" aria-label="' + (on ? "Retirer du panier : " : "Ajouter au panier : ") + esc(r.nom) + '">' + (on ? "✓" : "+") + "</button></div>";
    }).join("");
    var count = e.speciaux.reduce(function (n, g) { return n + g.items.length; }, 0);
    $("specials-title").textContent = "Spéciaux de la semaine (" + count + ")";
    $("specials-body").innerHTML = e.speciaux.map(function (g) {
      return '<div class="block"><h3>' + esc(g.rayon) + '</h3><ul class="list">' + g.items.map(function (it) {
        return "<li><span>" + esc(it[0]) + '</span><span class="mono">' + esc(it[1]) + "</span></li>";
      }).join("") + "</ul></div>";
    }).join("");
  }

  /* ---------- 3. Une recette ---------- */
  function renderRecipe() {
    var e = current();
    var idx = state.pick[e.id];
    var r = e.recettes[idx];
    var f = state.portions / (data.portionsBase || 4);
    var tot = cost(r, state.portions);
    var b = badges(r);

    var ings = r.ingredients.map(function (i) {
      var l = line(i, state.portions);
      var count = i.compte ? " (≈ " + Math.max(1, Math.round(l.q * i.compte.parUnite)) + " " + i.compte.label + ")" : "";
      var est = l.a.estime ? "≈ " : "";
      var reste = l.reste > 0.001 ? " · reste " + est + num(l.reste) + " " + i.unite : "";
      return '<li' + (i.horsSpecial ? ' class="hors"' : "") + '><span class="n"><span>' + esc(i.nom) + "</span>" +
        '<span class="d">Acheter : ' + esc(fmtBuy(i, l.n, l.a, l.buy)) + " · " + esc(i.aubaine) + "</span>" +
        '<span class="d">Utilisé : ' + num(l.q) + " " + esc(i.unite) + esc(count) + esc(reste) + "</span></span>" +
        '<span class="mono">' + est + money(l.caisse) + "</span></li>";
    }).join("");

    var sp = splitPantry(r, f);
    var key = e.id + "-" + idx;
    var steps = r.etapes.map(function (s, k) {
      var on = !!state.done[key + "-" + k];
      return '<button type="button" class="step" data-step="' + k + '" aria-pressed="' + on + '"><span class="num" aria-hidden="true">' + (on ? "✓" : k + 1) + '</span><span class="txt">' + esc(s) + "</span></button>";
    }).join("");
    var tags = badgeHtml(b, true);
    var on = inCart(e.id + "/" + idx);

    $("recipe").setAttribute("aria-label", e.nom + " : " + r.nom);
    $("recipe").innerHTML =
      '<div class="meta"><span><b class="st">' + esc(e.nom) + "</b> · " + esc(r.temps) + " · 2 portions</span></div>" +
      "<h2>" + esc(r.nom) + "</h2>" +
      (tags ? '<div class="tags">' + tags + "</div>" : "") +
      '<div class="price"><div><div class="big">' + (tot.estime ? "≈ " : "") + money(tot.caisse + tot.tps + tot.tvq) + "</div>" +
        '<div class="tax">à la caisse · TPS ' + money(tot.tps) + " · TVQ " + money(tot.tvq) +
        (r.proteines ? "<br>≈ " + r.proteines + " g de protéines / portion" : "") + "</div></div></div>" +
      '<button type="button" class="add-big" id="add-recipe" aria-pressed="' + on + '">' + (on ? "✓ Dans le panier — retirer" : "+ Ajouter au panier") + "</button>" +
      '<div class="block"><h3>À acheter</h3><ul class="list">' + ings + "</ul></div>" +
      '<p class="pantry">Garde-manger : ' + esc(sp.base.length ? sp.base.join(" · ") : "rien") + "</p>" +
      '<div class="block"><h3>Étapes</h3>' + steps + "</div>" +
      '<button type="button" class="next" id="next">Recette suivante chez ' + esc(e.nom) + "</button>";
  }

  /* ---------- Navigation : #  |  #maxi  |  #maxi/2  |  #panier ---------- */
  function show(view) {
    ["home", "store", "detail", "cart"].forEach(function (v) { $(v).hidden = v !== view; });
    window.scrollTo(0, 0);
  }
  function route() {
    if (location.hash === "#panier") { show("cart"); renderCart(); return; }
    var m = location.hash.slice(1).split("/");
    var e = data.epiceries.find(function (x) { return x.id === m[0]; });
    if (!e) { show("home"); renderHome(); return; }
    state.store = e.id;
    if (m.length < 2 || m[1] === "") { show("store"); renderStore(); return; }
    var idx = Number(m[1]);
    state.pick[e.id] = idx >= 0 && idx < e.recettes.length ? idx : 0;
    show("detail"); renderRecipe();
  }
  function go(h) { location.hash = h; }

  $("store-back").addEventListener("click", function () { go(""); });
  $("back").addEventListener("click", function () { go(state.store); });
  $("cart-back").addEventListener("click", function () { go(""); });

  $("recipes").addEventListener("click", function (ev) {
    var a = ev.target.closest("button[data-add]");
    if (!a) return;
    toggleCart(a.dataset.add); renderStore();
    var again = $("recipes").querySelector('[data-add="' + a.dataset.add + '"]'); if (again) again.focus();
  });
  $("recipe").addEventListener("click", function (ev) {
    var e = current();
    var s = ev.target.closest("button[data-step]");
    if (s) {
      var k = e.id + "-" + state.pick[e.id] + "-" + s.dataset.step;
      state.done[k] = !state.done[k];
      saveDone(); renderRecipe();
      var again = $("recipe").querySelector('[data-step="' + s.dataset.step + '"]'); if (again) again.focus();
      return;
    }
    if (ev.target.closest("#add-recipe")) { toggleCart(e.id + "/" + state.pick[e.id]); renderRecipe(); $("add-recipe").focus(); return; }
    if (ev.target.closest("#next")) go(e.id + "/" + ((state.pick[e.id] + 1) % e.recettes.length));
  });
  $("cart-body").addEventListener("click", function (ev) {
    var g = ev.target.closest("button[data-got]");
    if (g) { state.got[g.dataset.got] = !state.got[g.dataset.got]; saveCart(); renderCart();
      var again = $("cart-body").querySelector('[data-got="' + g.dataset.got + '"]'); if (again) again.focus(); return; }
    var ms = ev.target.closest("button[data-miss]");
    if (ms) { state.missing[ms.dataset.miss] = !state.missing[ms.dataset.miss]; saveCart(); updateCartCount(); renderCart();
      var again2 = $("cart-body").querySelector('[data-miss="' + ms.dataset.miss + '"]'); if (again2) again2.focus(); return; }
    var rm = ev.target.closest("button[data-rm]");
    if (rm) { toggleCart(rm.dataset.rm); renderCart(); return; }
    if (ev.target.closest("#cart-clear")) { state.cart = []; state.got = {}; state.missing = {}; saveCart(); updateCartCount(); renderCart(); }
  });
  window.addEventListener("hashchange", route);

  fetch("data/semaine.json", { cache: "no-cache" })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      data = d;
      $("semaine").textContent = d.semaine;
      loadDone(); loadCart(); updateCartCount();
      d.epiceries.forEach(function (e) { state.pick[e.id] = 0; });
      route();
    })
    .catch(function () { $("store-cards").textContent = "Impossible de charger les recettes."; });
})();
