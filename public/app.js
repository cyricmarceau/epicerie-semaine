(function () {
  var data = null;
  var state = { store: null, portions: 2, pick: {}, done: {} };

  function money(n) { return n.toFixed(2).replace(".", ",") + " $"; }
  function num(n) { return String(Math.round(n * 100) / 100).replace(".", ","); }
  function snap(n, step) { return Math.max(step, Math.round(n / step) * step); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function $(id) { return document.getElementById(id); }

  // Étapes cochées : gardées sur l'appareil, par semaine (facultatif, ignoré si indisponible)
  function storeKey() { return "etapes:" + (data ? data.semaine : ""); }
  function loadDone() { try { state.done = JSON.parse(localStorage.getItem(storeKey())) || {}; } catch (e) { state.done = {}; } }
  function saveDone() { try { localStorage.setItem(storeKey(), JSON.stringify(state.done)); } catch (e) {} }

  function current() { return data.epiceries.find(function (e) { return e.id === state.store; }); }

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
    var total = 0;

    var ings = r.ingredients.map(function (i) {
      var q = snap(i.qte * f, i.pas);
      var cost = q * i.prixUnite;
      total += cost;
      var count = i.compte ? " (≈ " + Math.max(1, Math.round(q * i.compte.parUnite)) + " " + i.compte.label + ")" : "";
      return '<li><span class="n"><span>' + esc(i.nom) + '</span><span class="d">' + num(q) + " " + esc(i.unite) + count + " · " + esc(i.aubaine) + '</span></span><span class="mono">' + money(cost) + "</span></li>";
    }).join("");

    var pantry = r.gardeManger.map(function (x) { if (!x[0]) return x[1];
      var v = x[0] * f;
      return num(v >= 20 ? Math.round(v / 5) * 5 : snap(v, 0.5)) + " " + x[1]; }).join(" · ");

    var key = e.id + "-" + idx;
    var steps = r.etapes.map(function (s, k) {
      var on = !!state.done[key + "-" + k];
      return '<button type="button" class="step" data-step="' + k + '" aria-pressed="' + on + '"><span class="num" aria-hidden="true">' + (on ? "✓" : k + 1) + '</span><span class="txt">' + esc(s) + "</span></button>";
    }).join("");

    var seg = [1, 2].map(function (n) {
      return '<button type="button" data-p="' + n + '" aria-pressed="' + (n === state.portions) + '">' + n + " pers.</button>";
    }).join("");

    var el = $("recipe");
    el.setAttribute("aria-labelledby", "tab-" + e.id);
    el.innerHTML =
      '<div class="meta"><span>Recette ' + (idx + 1) + " sur " + e.recettes.length + "</span><span>" + esc(r.temps) + "</span></div>" +
      "<h2>" + esc(r.nom) + "</h2>" +
      '<div class="price"><div><div class="big">' + money(total / state.portions) + '</div><div class="sub">par portion · ' + money(total) + ' au total</div></div>' +
      '<div class="seg" role="group" aria-label="Nombre de personnes">' + seg + "</div></div>" +
      '<div class="block"><h3>À acheter en spécial</h3><ul class="list">' + ings + '</ul><p class="pantry">Garde-manger : ' + esc(pantry) + "</p></div>" +
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

  function selectStore(id, focus) {
    state.store = id;
    if (location.hash !== "#" + id) history.replaceState(null, "", "#" + id);
    renderStores(); renderRecipe(); renderSpecials();
    if (focus) $("tab-" + id).focus();
  }

  $("stores").addEventListener("click", function (ev) {
    var b = ev.target.closest("button[data-id]");
    if (b) selectStore(b.dataset.id);
  });
  $("stores").addEventListener("keydown", function (ev) {
    if (ev.key !== "ArrowRight" && ev.key !== "ArrowLeft") return;
    var ids = data.epiceries.map(function (e) { return e.id; });
    var i = ids.indexOf(state.store) + (ev.key === "ArrowRight" ? 1 : -1);
    selectStore(ids[(i + ids.length) % ids.length], true);
  });

  $("recipe").addEventListener("click", function (ev) {
    var e = current();
    var p = ev.target.closest("button[data-p]");
    if (p) { state.portions = Number(p.dataset.p); renderRecipe(); return; }
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
      state.pick[e.id] = (state.pick[e.id] + 1) % e.recettes.length;
      renderRecipe();
      $("next").focus();
    }
  });

  fetch("data/semaine.json", { cache: "no-cache" })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      data = d;
      $("semaine").textContent = d.semaine;
      loadDone();
      d.epiceries.forEach(function (e) { state.pick[e.id] = Math.floor(Math.random() * e.recettes.length); });
      var h = location.hash.slice(1);
      selectStore(d.epiceries.some(function (e) { return e.id === h; }) ? h : d.epiceries[0].id);
    })
    .catch(function () { $("recipe").textContent = "Impossible de charger les spéciaux."; });
})();
