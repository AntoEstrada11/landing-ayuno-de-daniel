/**
 * Ayuno de Daniel — interacciones + seguimiento persistente
 *
 * Persistencia local (localStorage) por teléfono.
 * Listo para conectar un backend WordPress vía window.AYUNO_API:
 *   { load(phone), save(phone, data) } → Promise
 */
(function () {
  "use strict";

  var STORAGE_SESSION = "ayuno_daniel_session_v1";
  var STORAGE_PREFIX = "ayuno_daniel_progress_v1_";
  var AYUNO_START = new Date(2026, 6, 13); // 13 jul 2026
  var AYUNO_TOTAL_DAYS = 21;

  var GUIDE_ICONS = [
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 5h7a3 3 0 013 3v11a2.5 2.5 0 00-2.5-2.5H4V5z"/><path d="M20 5h-7a3 3 0 00-3 3v11a2.5 2.5 0 012.5-2.5H20V5z"/></svg>',
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 21h6M12 3c-2.5 2-4 4.5-4 7a4 4 0 008 0c0-2.5-1.5-5-4-7z"/></svg>',
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 3l8 3v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-3z"/></svg>',
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><path d="M8.5 10.5h.01M15.5 10.5h.01M8.5 15c1.2 1.2 5.8 1.2 7 0"/></svg>',
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="8" r="2.5"/><circle cx="16" cy="9" r="2"/><path d="M3.5 18c0-2.8 2.4-4.5 5.5-4.5s5.5 1.7 5.5 4.5"/><path d="M14 18c.2-1.8 1.6-3.2 3.8-3.5 1.7.2 3.2 1.3 3.2 3"/></svg>',
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.8 4 6 4 9s-1.5 6.2-4 9c-2.5-2.8-4-6-4-9s1.5-6.2 4-9z"/></svg>',
  ];

  /* ---------- utilidades ---------- */

  function normalizePhone(raw) {
    return String(raw || "").replace(/\D/g, "");
  }

  function formatPhoneDisplay(digits) {
    if (!digits) return "";
    if (digits.length === 10) {
      return digits.replace(/(\d{2})(\d{4})(\d{4})/, "$1 $2 $3");
    }
    return digits;
  }

  function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function getCurrentDayNumber(now) {
    var today = startOfDay(now || new Date());
    var start = startOfDay(AYUNO_START);
    var diff = Math.floor((today - start) / 86400000) + 1;
    if (diff < 1) return 0; // aún no empieza
    if (diff > AYUNO_TOTAL_DAYS) return AYUNO_TOTAL_DAYS + 1; // ya terminó
    return diff;
  }

  function emptyProgress(extra) {
    return {
      phone: "",
      name: "",
      practices: { marked: {}, seen: { "0": true } },
      days: {},
      updatedAt: new Date().toISOString(),
      ...(extra || {}),
    };
  }

  /* ---------- storage (local + hook API) ---------- */

  var ProgressStore = {
    getSession: function () {
      try {
        var raw = localStorage.getItem(STORAGE_SESSION);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    },

    setSession: function (session) {
      if (!session) {
        localStorage.removeItem(STORAGE_SESSION);
        return;
      }
      localStorage.setItem(STORAGE_SESSION, JSON.stringify(session));
    },

    keyFor: function (phone) {
      return STORAGE_PREFIX + (phone || "guest");
    },

    loadLocal: function (phone) {
      try {
        var raw = localStorage.getItem(this.keyFor(phone));
        if (!raw) return emptyProgress({ phone: phone || "" });
        var data = JSON.parse(raw);
        data.practices = data.practices || { marked: {}, seen: {} };
        data.practices.marked = data.practices.marked || {};
        data.practices.seen = data.practices.seen || {};
        data.days = data.days || {};
        return data;
      } catch (e) {
        return emptyProgress({ phone: phone || "" });
      }
    },

    saveLocal: function (phone, data) {
      data.updatedAt = new Date().toISOString();
      data.phone = phone || data.phone || "";
      localStorage.setItem(this.keyFor(phone), JSON.stringify(data));
      return data;
    },

    load: function (phone) {
      var local = this.loadLocal(phone);
      var api = window.AYUNO_API;
      if (api && typeof api.load === "function" && phone) {
        return Promise.resolve(api.load(phone))
          .then(function (remote) {
            if (!remote) return local;
            // Merge: más reciente gana a nivel simple
            var remoteTime = remote.updatedAt ? Date.parse(remote.updatedAt) : 0;
            var localTime = local.updatedAt ? Date.parse(local.updatedAt) : 0;
            return remoteTime >= localTime ? remote : local;
          })
          .catch(function () {
            return local;
          });
      }
      return Promise.resolve(local);
    },

    save: function (phone, data) {
      this.saveLocal(phone, data);
      var api = window.AYUNO_API;
      if (api && typeof api.save === "function" && phone) {
        return Promise.resolve(api.save(phone, data)).catch(function () {
          return data;
        });
      }
      return Promise.resolve(data);
    },

    migrateGuestToPhone: function (phone, name) {
      var guest = this.loadLocal("guest");
      var existing = this.loadLocal(phone);
      var hasExisting =
        Object.keys(existing.days || {}).length > 0 ||
        Object.keys(existing.practices.marked || {}).length > 0;

      var base = hasExisting ? existing : guest;
      base.phone = phone;
      base.name = name || base.name || "";
      this.saveLocal(phone, base);
      return base;
    },
  };

  /* Estado compartido en memoria */
  var AppState = {
    phone: null,
    data: emptyProgress(),
    listeners: [],
    onChange: function (fn) {
      this.listeners.push(fn);
    },
    notify: function () {
      var self = this;
      this.listeners.forEach(function (fn) {
        fn(self.data, self.phone);
      });
    },
    persist: function () {
      var key = this.phone || "guest";
      ProgressStore.save(key, this.data);
      this.notify();
    },
  };

  /* ---------- UI modules ---------- */

  function initAccordion(root) {
    var accordion = root.querySelector("[data-accordion]");
    if (!accordion) return;

    var triggers = accordion.querySelectorAll(".accordion__trigger");

    triggers.forEach(function (trigger) {
      trigger.addEventListener("click", function () {
        var expanded = trigger.getAttribute("aria-expanded") === "true";
        var panelId = trigger.getAttribute("aria-controls");
        var panel = panelId ? document.getElementById(panelId) : null;

        triggers.forEach(function (other) {
          if (other === trigger) return;
          other.setAttribute("aria-expanded", "false");
          var otherId = other.getAttribute("aria-controls");
          var otherPanel = otherId ? document.getElementById(otherId) : null;
          if (otherPanel) otherPanel.hidden = true;
        });

        trigger.setAttribute("aria-expanded", expanded ? "false" : "true");
        if (panel) panel.hidden = expanded;
      });
    });
  }

  function initStoryToggle(root) {
    var toggle = root.querySelector("[data-story-toggle]");
    var intro = root.querySelector("#hero-intro");
    var label = root.querySelector("[data-story-label]");
    if (!toggle || !intro) return;

    toggle.addEventListener("click", function () {
      var open = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", open ? "false" : "true");
      intro.hidden = open;
      if (label) {
        label.textContent = open ? "Leer la introducción" : "Ocultar introducción";
      }
    });
  }

  function initCarousel(root) {
    var carousel = root.querySelector("[data-carousel]");
    if (!carousel) return;

    var slides = Array.prototype.slice.call(
      carousel.querySelectorAll("[data-carousel-slide]")
    );
    var dotsWrap = carousel.querySelector("[data-carousel-dots]");
    var prevBtn = carousel.querySelector("[data-carousel-prev]");
    var nextBtn = carousel.querySelector("[data-carousel-next]");
    var index = 0;
    var timer;

    if (!slides.length) return;

    slides.forEach(function (_, i) {
      var dot = document.createElement("button");
      dot.type = "button";
      dot.className = "carousel__dot" + (i === 0 ? " is-active" : "");
      dot.setAttribute("aria-label", "Ir al testimonio " + (i + 1));
      dot.addEventListener("click", function () {
        goTo(i);
        restartAutoplay();
      });
      if (dotsWrap) dotsWrap.appendChild(dot);
    });

    function goTo(next) {
      index = (next + slides.length) % slides.length;
      slides.forEach(function (slide, i) {
        slide.classList.toggle("is-active", i === index);
      });
      var dots = dotsWrap ? dotsWrap.querySelectorAll(".carousel__dot") : [];
      dots.forEach(function (dot, i) {
        dot.classList.toggle("is-active", i === index);
      });
    }

    function restartAutoplay() {
      clearInterval(timer);
      timer = setInterval(function () {
        goTo(index + 1);
      }, 7000);
    }

    if (prevBtn) {
      prevBtn.addEventListener("click", function () {
        goTo(index - 1);
        restartAutoplay();
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener("click", function () {
        goTo(index + 1);
        restartAutoplay();
      });
    }

    restartAutoplay();
  }

  function initGuideExplorer(root) {
    var explorer = root.querySelector("[data-guide-explorer]");
    if (!explorer) return;

    var tabs = Array.prototype.slice.call(
      explorer.querySelectorAll("[data-guide-tab]")
    );
    var panels = Array.prototype.slice.call(
      explorer.querySelectorAll("[data-guide-panel]")
    );
    var prevBtn = explorer.querySelector("[data-guide-prev]");
    var nextBtn = explorer.querySelector("[data-guide-next]");
    var markBtn = explorer.querySelector("[data-guide-mark]");
    var markLabel = explorer.querySelector("[data-mark-label]");
    var seenEl = explorer.querySelector("[data-guide-seen]");
    var markedEl = explorer.querySelector("[data-guide-marked]");
    var barEl = explorer.querySelector("[data-guide-bar]");
    var progressBar = explorer.querySelector(".guide-progress__bar");
    var visual = explorer.querySelector("[data-guide-visual]");
    var stage = explorer.querySelector(".guide-stage");

    var current = 0;

    function getMarked() {
      return AppState.data.practices.marked || {};
    }

    function getSeen() {
      return AppState.data.practices.seen || {};
    }

    function updateProgress() {
      var seen = getSeen();
      var marked = getMarked();
      var seenCount = Object.keys(seen).filter(function (k) {
        return seen[k];
      }).length;
      var markedCount = Object.keys(marked).filter(function (k) {
        return marked[k];
      }).length;
      if (seenEl) seenEl.textContent = String(seenCount);
      if (markedEl) markedEl.textContent = String(markedCount);
      if (barEl) barEl.style.width = (seenCount / tabs.length) * 100 + "%";
      if (progressBar) progressBar.setAttribute("aria-valuenow", String(seenCount));
    }

    function updateMarkButton() {
      var isMarked = !!getMarked()[current];
      if (markBtn) markBtn.setAttribute("aria-pressed", isMarked ? "true" : "false");
      if (markLabel) {
        markLabel.textContent = isMarked
          ? "Práctica marcada ✓"
          : "Marcar esta práctica";
      }
    }

    function goTo(index) {
      if (index < 0 || index >= tabs.length) return;
      current = index;
      AppState.data.practices.seen[String(current)] = true;
      AppState.persist();

      var marked = getMarked();
      var seen = getSeen();

      tabs.forEach(function (tab, i) {
        var active = i === current;
        tab.classList.toggle("is-active", active);
        tab.classList.toggle("is-seen", !!seen[String(i)]);
        tab.classList.toggle("is-marked", !!marked[String(i)]);
        tab.setAttribute("aria-selected", active ? "true" : "false");
      });

      panels.forEach(function (panel, i) {
        var active = i === current;
        panel.classList.toggle("is-active", active);
        panel.hidden = !active;
      });

      if (visual) visual.innerHTML = GUIDE_ICONS[current] || "";

      if (stage) {
        stage.classList.add("is-animating");
        setTimeout(function () {
          stage.classList.remove("is-animating");
        }, 200);
      }

      if (prevBtn) prevBtn.disabled = current === 0;
      if (nextBtn) nextBtn.disabled = current === tabs.length - 1;

      updateMarkButton();
      updateProgress();

      if (tabs[current] && tabs[current].scrollIntoView) {
        tabs[current].scrollIntoView({
          behavior: "smooth",
          inline: "center",
          block: "nearest",
        });
      }
    }

    function refreshFromState() {
      var marked = getMarked();
      tabs.forEach(function (tab, i) {
        tab.classList.toggle("is-marked", !!marked[String(i)]);
        tab.classList.toggle("is-seen", !!getSeen()[String(i)]);
      });
      updateMarkButton();
      updateProgress();
    }

    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        goTo(parseInt(tab.getAttribute("data-guide-tab"), 10));
      });
    });

    if (prevBtn) {
      prevBtn.addEventListener("click", function () {
        goTo(current - 1);
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener("click", function () {
        goTo(current + 1);
      });
    }

    if (markBtn) {
      markBtn.addEventListener("click", function () {
        var key = String(current);
        if (AppState.data.practices.marked[key]) {
          delete AppState.data.practices.marked[key];
        } else {
          AppState.data.practices.marked[key] = true;
        }
        AppState.persist();
        tabs[current].classList.toggle(
          "is-marked",
          !!AppState.data.practices.marked[key]
        );
        updateMarkButton();
        updateProgress();
      });
    }

    AppState.onChange(refreshFromState);
    goTo(0);
    refreshFromState();
  }

  function initJourney(root) {
    var section = root.querySelector("[data-journey]");
    if (!section) return;

    var authEl = section.querySelector("[data-journey-auth]");
    var dashEl = section.querySelector("[data-journey-dash]");
    var form = section.querySelector("[data-journey-login]");
    var logoutBtn = section.querySelector("[data-journey-logout]");
    var nameEl = section.querySelector("[data-journey-name]");
    var phoneEl = section.querySelector("[data-journey-phone]");
    var dayEl = section.querySelector("[data-journey-day]");
    var doneEl = section.querySelector("[data-journey-done]");
    var practicesEl = section.querySelector("[data-journey-practices]");
    var hintEl = section.querySelector("[data-journey-today-hint]");
    var calendarEl = section.querySelector("[data-journey-calendar]");
    var checkinBtn = section.querySelector("[data-journey-checkin]");

    function countMarkedPractices() {
      var marked = AppState.data.practices.marked || {};
      return Object.keys(marked).filter(function (k) {
        return marked[k];
      }).length;
    }

    function countDoneDays() {
      var days = AppState.data.days || {};
      return Object.keys(days).filter(function (k) {
        return days[k];
      }).length;
    }

    function renderCalendar() {
      if (!calendarEl) return;
      calendarEl.innerHTML = "";
      var currentDay = getCurrentDayNumber(new Date());

      for (var d = 1; d <= AYUNO_TOTAL_DAYS; d++) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "journey-day";
        btn.setAttribute("role", "listitem");
        btn.setAttribute("data-day", String(d));

        var isDone = !!AppState.data.days[String(d)];
        var isToday = d === currentDay;
        var isFuture = currentDay > 0 && d > currentDay;
        var notStarted = currentDay === 0;

        if (isDone) btn.classList.add("is-done");
        if (isToday) btn.classList.add("is-today");
        if (isFuture || notStarted) btn.disabled = true;

        btn.innerHTML =
          '<span class="journey-day__num">' +
          d +
          "</span>" +
          '<span class="journey-day__label">' +
          (isDone ? "Hecho" : isToday ? "Hoy" : "Día") +
          "</span>";

        btn.setAttribute(
          "aria-label",
          "Día " + d + (isDone ? ", cumplido" : isToday ? ", hoy" : "")
        );

        (function (dayNum) {
          btn.addEventListener("click", function () {
            if (btn.disabled) return;
            var key = String(dayNum);
            if (AppState.data.days[key]) {
              delete AppState.data.days[key];
            } else {
              AppState.data.days[key] = true;
            }
            AppState.persist();
            renderDashboard();
          });
        })(d);

        calendarEl.appendChild(btn);
      }
    }

    function renderDashboard() {
      var loggedIn = !!AppState.phone;
      if (authEl) authEl.hidden = loggedIn;
      if (dashEl) dashEl.hidden = !loggedIn;
      if (!loggedIn) return;

      var currentDay = getCurrentDayNumber(new Date());
      var displayDay =
        currentDay < 1
          ? "—"
          : currentDay > AYUNO_TOTAL_DAYS
            ? String(AYUNO_TOTAL_DAYS)
            : String(currentDay);

      if (nameEl) nameEl.textContent = AppState.data.name || "participante";
      if (phoneEl) phoneEl.textContent = formatPhoneDisplay(AppState.phone);
      if (dayEl) dayEl.textContent = displayDay;
      if (doneEl) doneEl.textContent = String(countDoneDays());
      if (practicesEl) practicesEl.textContent = String(countMarkedPractices());

      if (hintEl) {
        if (currentDay < 1) {
          hintEl.textContent = "El propósito comienza el 13 de julio.";
        } else if (currentDay > AYUNO_TOTAL_DAYS) {
          hintEl.textContent = "El propósito de 21 días ha concluido. ¡Gracias por participar!";
        } else {
          hintEl.textContent =
            "Hoy es el día " + currentDay + " de 21 · Del 13 de julio al 2 de agosto";
        }
      }

      renderCalendar();

      if (checkinBtn) {
        var todayKey = String(currentDay);
        var canCheck =
          currentDay >= 1 && currentDay <= AYUNO_TOTAL_DAYS;
        var isChecked = canCheck && !!AppState.data.days[todayKey];
        checkinBtn.disabled = !canCheck;
        checkinBtn.setAttribute("aria-pressed", isChecked ? "true" : "false");
        checkinBtn.textContent = !canCheck
          ? currentDay < 1
            ? "Aún no comienza el Ayuno"
            : "Propósito finalizado"
          : isChecked
            ? "Día de hoy marcado ✓"
            : "Marcar el día de hoy como cumplido";
      }
    }

    if (form) {
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        var phoneInput = form.querySelector('input[name="phone"]');
        var nameInput = form.querySelector('input[name="name"]');
        var phone = normalizePhone(phoneInput && phoneInput.value);
        var name = (nameInput && nameInput.value.trim()) || "";

        if (phone.length < 8) {
          if (phoneInput) phoneInput.focus();
          alert("Ingresa un número de teléfono válido (mínimo 8 dígitos).");
          return;
        }

        var data = ProgressStore.migrateGuestToPhone(phone, name);
        AppState.phone = phone;
        AppState.data = data;
        ProgressStore.setSession({ phone: phone, name: data.name });
        AppState.persist();
        renderDashboard();
      });
    }

    if (logoutBtn) {
      logoutBtn.addEventListener("click", function () {
        ProgressStore.setSession(null);
        AppState.phone = null;
        AppState.data = ProgressStore.loadLocal("guest");
        AppState.notify();
        renderDashboard();
      });
    }

    if (checkinBtn) {
      checkinBtn.addEventListener("click", function () {
        var currentDay = getCurrentDayNumber(new Date());
        if (currentDay < 1 || currentDay > AYUNO_TOTAL_DAYS) return;
        var key = String(currentDay);
        if (AppState.data.days[key]) {
          delete AppState.data.days[key];
        } else {
          AppState.data.days[key] = true;
        }
        AppState.persist();
        renderDashboard();
      });
    }

    AppState.onChange(renderDashboard);
    renderDashboard();
  }

  function initReveal(root) {
    var items = root.querySelectorAll(".reveal");
    if (!items.length) return;

    if (!("IntersectionObserver" in window)) {
      items.forEach(function (el) {
        el.classList.add("is-visible");
      });
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );

    items.forEach(function (el) {
      observer.observe(el);
    });
  }

  function initForms(root) {
    var forms = root.querySelectorAll(".registro-form");

    forms.forEach(function (form) {
      form.addEventListener("submit", function (event) {
        var nameInput = form.querySelector('input[name="nombre"]');
        var emailInput = form.querySelector('input[name="email"]');

        if (!nameInput.value.trim() || !emailInput.value.trim()) {
          event.preventDefault();
          return;
        }

        if (!form.getAttribute("action") || form.getAttribute("action") === "#") {
          event.preventDefault();
          form.classList.add("is-submitted");
          var btn = form.querySelector(".btn-cta");
          if (btn) {
            btn.textContent = "Registro recibido";
            btn.disabled = true;
          }
          // Si ya tiene nombre en el journey form vacío, sugerimos el nombre
          var journeyName = document.getElementById("journey-name");
          if (journeyName && !journeyName.value) {
            journeyName.value = nameInput.value.trim();
          }
        }
      });
    });
  }

  function bootState() {
    var session = ProgressStore.getSession();
    if (session && session.phone) {
      AppState.phone = normalizePhone(session.phone);
      return ProgressStore.load(AppState.phone).then(function (data) {
        if (session.name && !data.name) data.name = session.name;
        AppState.data = data;
        ProgressStore.saveLocal(AppState.phone, data);
      });
    }
    AppState.phone = null;
    AppState.data = ProgressStore.loadLocal("guest");
    return Promise.resolve();
  }

  function initStoryScroll(root) {
    var sections = Array.prototype.slice.call(
      root.querySelectorAll("[data-story-section]")
    );
    var stickyPanels = Array.prototype.slice.call(
      root.querySelectorAll("[data-story-panel]")
    );
    var layers = Array.prototype.slice.call(
      root.querySelectorAll("[data-story-layer]")
    );
    var dots = Array.prototype.slice.call(
      root.querySelectorAll("[data-story-progress] [data-story-target]")
    );
    if (!sections.length) return;

    var reduceMotion =
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function update() {
      var activeIndex = 0;
      var mid = window.innerHeight * 0.4;

      sections.forEach(function (section, i) {
        var rect = section.getBoundingClientRect();
        if (rect.top <= mid && rect.bottom > mid) {
          activeIndex = i;
        }
      });

      dots.forEach(function (dot, i) {
        dot.classList.toggle("is-active", i === activeIndex);
      });

      if (reduceMotion) {
        stickyPanels.forEach(function (panel) {
          panel.classList.remove("is-recessed");
        });
        return;
      }

      stickyPanels.forEach(function (panel, i) {
        var rect = panel.getBoundingClientRect();
        var coveredBySticky = false;
        var next = stickyPanels[i + 1];

        if (next) {
          var nextRect = next.getBoundingClientRect();
          coveredBySticky =
            nextRect.top < window.innerHeight * 0.88 &&
            nextRect.top < rect.bottom - 8;
        }

        // También se oscurece cuando una capa interactiva (guía/forms) lo cubre
        var coveredByLayer = layers.some(function (layer) {
          var layerRect = layer.getBoundingClientRect();
          return (
            layerRect.top < window.innerHeight * 0.75 &&
            layerRect.top < rect.bottom - 8 &&
            layerRect.bottom > 48
          );
        });

        panel.classList.toggle(
          "is-recessed",
          coveredBySticky || coveredByLayer
        );
      });
    }

    dots.forEach(function (dot) {
      dot.addEventListener("click", function () {
        var id = dot.getAttribute("data-story-target");
        var target = id ? document.getElementById(id) : null;
        if (target) {
          target.scrollIntoView({
            behavior: reduceMotion ? "auto" : "smooth",
            block: "start",
          });
        }
      });
    });

    var ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        update();
        ticking = false;
      });
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    update();
  }

  function boot() {
    var root = document.querySelector(".ayuno-landing");
    if (!root) return;

    bootState().then(function () {
      initAccordion(root);
      initStoryToggle(root);
      initCarousel(root);
      initGuideExplorer(root);
      initJourney(root);
      initReveal(root);
      initForms(root);
      initStoryScroll(root);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
