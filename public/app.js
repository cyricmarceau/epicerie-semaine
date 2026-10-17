(function () {
  var data = null;
  var state = { store: null, portions: 2, pick: {} };

  function money(n) { return n.toFixed(2).replace(".", ",") + " $"; }
  function num(n) { return String(Math.round(n * 100) / 100).replace(".", ","); }
  function snap(n, step) { return Math.max(step, Math.round(n / step) * step); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function renderPortions() {
    var el = document.getElementById("portions");
    el.innerHTML = [1, 2].map(function (n) {
      return '<button type="button" data-p="' + n + '" aria-pressed="' + (n === state.portions) + '">' + n + "</button>";
    }).join("");
  }

  function renderTabs() {
    var el = document.getElementById("tabs");
    el.innerHTML = data.epiceries.map(function (e) {
      var on = e.id === state.store;
      return '<button type="button" role="tab" id="tab-' + e.id + '" data-id="' + e.id + '" aria-selected="' + on + '" aria-controls="panel" tabindex="' + (on ? 0 : -1) + '">' + esc(e.nom) + "</button>";
    }).join("");
  }

  function renderPanel() {
    var e = data.epiceries.find(function (x) { return x.id === state.store; });
    var idx = state.pick[e.id];
    var r = e.recettes[idx];
    var f = state.portions / data.portionsBase;
    var total = 0;

    var ings = r.ingredients.map(function (i) {
      var q = snap(i.qte * f, i.pas);
      var cost = q * i.prixUnite;
      total += cost;
      var count = i.compte ? " (≈ " + Math.max(1, Math.round(q * i.compte.parUnite)) + " " + i.compte.label + ")" : "";
      return '<li><span class="n"><span>' + esc(i.nom) + '</span><span class="d">' + num(q) + " " + esc(i.unite) + count + " · " + esc(i.aubaine) + '</span></span><span class="mono">' + money(cost) + "</span></li>";
    }).join("");

    var pantry = r.gardeManger.map(function (x) { return x[0] ? num(snap(x[0] * f, 0.5)) + " " + x[1] : x[1]; }).join(" · ");
    var steps = r.etapes.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("");

    var specials = e.speciaux.map(function (g) {
      return '<div class="block"><h3>' + esc(g.rayon) + '</h3><ul class="list">' + g.items.map(function (it) {
        return '<li><span>' + esc(it[0]) + '</span><span class="mono">' + esc(it[1]) + "</span></li>";
      }).join("") + "</ul></div>";
    }).join("");

    var panel = document.getElementById("panel");
    panel.setAttribute("aria-labelledby", "tab-" + e.id);
    panel.innerHTML =
      '<div class="grid">' +
        '<article class="card recipe">' +
          '<div class="row"><span class="tag">' + esc(e.nom) + '</span><span class="time">Proposition ' + (idx + 1) + " sur " + e.recettes.length + " · " + esc(r.temps) + "</span></div>" +
          "<h2>" + esc(r.nom) + "</h2>" +
          '<div class="price"><div><div class="big">' + money(total / state.portions) + '</div><div class="sub">par portion</div></div>' +
          '<div><div class="tot">' + money(total) + '</div><div class="sub">pour ' + state.portions + " portions</div></div></div>" +
          '<div class="block"><h3>En spécial</h3><ul class="list">' + ings + "</ul></div>" +
          '<div class="block"><h3>Garde-manger</h3><p class="pantry">' + esc(pantry) + "</p></div>" +
          '<div class="block"><h3>Préparation</h3><ol>' + steps + "</ol></div>" +
          '<button type="button" class="next" id="next">Proposer une autre recette</button>' +
        "</article>" +
        '<aside class="card"><h2>Spéciaux ' + esc(e.nom) + "</h2>" + specials + "</aside>" +
      "</div>";
  }

  function renderAll() { renderPortions(); renderTabs(); renderPanel(); }

  function select(id, focus) {
    state.store = id;
    if (location.hash !== "#" + id) history.replaceState(null, "", "#" + id);
    renderTabs(); renderPanel();
    if (focus) document.getElementById("tab-" + id).focus();
  }

  document.getElementById("tabs").addEventListener("click", function (ev) {
    var b = ev.target.closest("button[data-id]");
    if (b) select(b.dataset.id);
  });
  document.getElementById("tabs").addEventListener("keydown", function (ev) {
    if (ev.key !== "ArrowRight" && ev.key !== "ArrowLeft") return;
    var ids = data.epiceries.map(function (e) { return e.id; });
    var i = ids.indexOf(state.store) + (ev.key === "ArrowRight" ? 1 : -1);
    select(ids[(i + ids.length) % ids.length], true);
  });
  document.getElementById("panel").addEventListener("click", function (ev) {
    if (!ev.target.closest("#next")) return;
    var e = data.epiceries.find(function (x) { return x.id === state.store; });
    state.pick[e.id] = (state.pick[e.id] + 1) % e.recettes.length;
    renderPanel();
    document.getElementById("next").focus();
  });
  document.getElementById("portions").addEventListener("click", function (ev) {
    var b = ev.target.closest("button[data-p]");
    if (!b) return;
    state.portions = Number(b.dataset.p);
    renderPortions(); renderPanel();
  });

  fetch("data/semaine.json", { cache: "no-cache" })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      data = d;
      document.getElementById("semaine").textContent = d.semaine;
      d.epiceries.forEach(function (e) { state.pick[e.id] = Math.floor(Math.random() * e.recettes.length); });
      var h = location.hash.slice(1);
      state.store = d.epiceries.some(function (e) { return e.id === h; }) ? h : d.epiceries[0].id;
      renderAll();
    })
    .catch(function () {
      document.getElementById("panel").textContent = "Impossible de charger les spéciaux.";
    });
})();
