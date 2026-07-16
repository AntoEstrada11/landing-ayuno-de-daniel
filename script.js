/**
 * Ayuno de Daniel — interacciones + seguimiento
 * Persistencia: localStorage + Supabase (leads)
 */
(function () {
  "use strict";

  var STORAGE_SESSION = "ayuno_daniel_session_v1";
  var STORAGE_PREFIX = "ayuno_daniel_progress_v1_";
  var AYUNO_START = new Date(2026, 6, 13); // 13 jul 2026
  var AYUNO_TOTAL_DAYS = 21;
  var supabaseClient = null;

  /* ---------- utilidades ---------- */

  // Nombre: letras (con acentos), espacios, apóstrofe o guion. Ej. "María José", "O'Connor"
  var NAME_RE = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+(?:[ '\-][A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)*$/;
  // Teléfono México: exactamente 10 dígitos
  var PHONE_RE = /^\d{10}$/;

  function normalizePhone(raw) {
    var digits = String(raw || "").replace(/\D/g, "");
    // Si viene con código de país 52 + 10 dígitos, nos quedamos con los 10 locales
    if (digits.length === 12 && digits.indexOf("52") === 0) {
      digits = digits.slice(2);
    }
    return digits;
  }

  function normalizeName(raw) {
    return String(raw || "")
      .trim()
      .replace(/\s+/g, " ");
  }

  function isValidName(raw) {
    var name = normalizeName(raw);
    if (name.length < 2 || name.length > 60) return false;
    return NAME_RE.test(name);
  }

  function isValidPhone(raw) {
    return PHONE_RE.test(normalizePhone(raw));
  }

  function setFieldValidity(input, isValid) {
    if (!input) return;
    input.classList.toggle("is-invalid", !isValid);
    input.setAttribute("aria-invalid", isValid ? "false" : "true");
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
    if (diff < 1) return 0;
    if (diff > AYUNO_TOTAL_DAYS) return AYUNO_TOTAL_DAYS + 1;
    return diff;
  }

  function emptyProgress(extra) {
    return Object.assign(
      {
        phone: "",
        name: "",
        email: "",
        practices: { marked: {}, seen: { "0": true } },
        days: {},
        updatedAt: new Date().toISOString(),
      },
      extra || {}
    );
  }

  function isSupabaseConfigured() {
    var cfg = window.AYUNO_SUPABASE;
    return !!(
      cfg &&
      cfg.url &&
      cfg.anonKey &&
      cfg.url.indexOf("TU-PROYECTO") === -1 &&
      cfg.anonKey.indexOf("TU_ANON") === -1 &&
      window.supabase
    );
  }

  function getSupabase() {
    if (!isSupabaseConfigured()) return null;
    if (supabaseClient) return supabaseClient;
    var cfg = window.AYUNO_SUPABASE;
    supabaseClient = window.supabase.createClient(cfg.url, cfg.anonKey);
    return supabaseClient;
  }

  function rowToProgress(row) {
    return emptyProgress({
      phone: row.phone || "",
      name: row.name || "",
      email: row.email || "",
      days: row.days || {},
      updatedAt: row.updated_at || new Date().toISOString(),
    });
  }

  /* ---------- storage (local + Supabase) ---------- */

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

    loadRemote: function (phone) {
      var client = getSupabase();
      if (!client || !phone) return Promise.resolve(null);
      return client
        .from("leads")
        .select("*")
        .eq("phone", phone)
        .maybeSingle()
        .then(function (res) {
          if (res.error) throw res.error;
          return res.data ? rowToProgress(res.data) : null;
        });
    },

    saveRemote: function (phone, data) {
      var client = getSupabase();
      if (!client || !phone) return Promise.resolve(data);
      var payload = {
        phone: phone,
        name: data.name || "Participante",
        email: data.email || null,
        days: data.days || {},
        updated_at: new Date().toISOString(),
      };
      return client
        .from("leads")
        .upsert(payload, { onConflict: "phone" })
        .select()
        .maybeSingle()
        .then(function (res) {
          if (res.error) throw res.error;
          return res.data ? rowToProgress(res.data) : data;
        });
    },

    load: function (phone) {
      var self = this;
      var local = this.loadLocal(phone);
      return this.loadRemote(phone)
        .then(function (remote) {
          if (!remote) return local;
          var remoteTime = remote.updatedAt ? Date.parse(remote.updatedAt) : 0;
          var localTime = local.updatedAt ? Date.parse(local.updatedAt) : 0;
          var chosen = remoteTime >= localTime ? remote : local;
          self.saveLocal(phone, chosen);
          return chosen;
        })
        .catch(function () {
          return local;
        });
    },

    save: function (phone, data) {
      this.saveLocal(phone, data);
      return this.saveRemote(phone, data).catch(function () {
        return data;
      });
    },

    loginOrRegister: function (phone, name, email) {
      var self = this;
      var localMerged = this.migrateGuestToPhone(phone, name);
      if (email) localMerged.email = email;

      return this.loadRemote(phone)
        .then(function (remote) {
          var base = remote || localMerged;
          base.name = name || base.name || "";
          base.email = email || base.email || "";
          base.phone = phone;
          // merge days
          base.days = Object.assign({}, remote && remote.days, localMerged.days);
          return self.save(phone, base);
        })
        .catch(function () {
          return self.save(phone, localMerged);
        });
    },

    migrateGuestToPhone: function (phone, name) {
      var guest = this.loadLocal("guest");
      var existing = this.loadLocal(phone);
      var hasExisting = Object.keys(existing.days || {}).length > 0;
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
      var self = this;
      return ProgressStore.save(key, this.data).then(function (data) {
        self.data = data || self.data;
        self.notify();
        return self.data;
      });
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

  function initAlertToggles(root) {
    var toggles = root.querySelectorAll("[data-alert-toggle]");
    if (!toggles.length) return;

    toggles.forEach(function (toggle) {
      var panelId = toggle.getAttribute("aria-controls");
      var panel = panelId ? document.getElementById(panelId) : null;
      var label = toggle.querySelector("[data-alert-label]");
      var openLabel = label ? label.textContent.trim() : "";
      var closedLabel = openLabel;

      if (panelId === "hero-intro") {
        closedLabel = "Leer la introducción";
        openLabel = "Ocultar introducción";
      } else if (panelId === "cuidado-panel") {
        closedLabel = "Cuidado: No reemplaces una distracción por otra";
        openLabel = "Ocultar alerta de cuidado";
      }

      toggle.addEventListener("click", function () {
        var open = toggle.getAttribute("aria-expanded") === "true";
        var nextOpen = !open;
        toggle.setAttribute("aria-expanded", nextOpen ? "true" : "false");
        if (panel) panel.hidden = !nextOpen;
        if (label) label.textContent = nextOpen ? openLabel : closedLabel;
      });
    });
  }

  function initCarousel(root) {
    var carousel = root.querySelector("[data-carousel]");
    if (!carousel) return;

    var slides = Array.prototype.slice.call(
      carousel.querySelectorAll("[data-carousel-slide]")
    );
    var dotsWrap = carousel.querySelector("[data-carousel-dots]");
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
      }, 15000);
    }

    carousel.addEventListener("mouseenter", function () {
      clearInterval(timer);
    });
    carousel.addEventListener("mouseleave", restartAutoplay);

    restartAutoplay();
  }

  function initPracticeSlider(root) {
    var slider = root.querySelector("[data-practice-slider]");
    if (!slider) return;

    var slides = Array.prototype.slice.call(
      slider.querySelectorAll("[data-practice-slide]")
    );
    var dotsWrap = slider.querySelector("[data-practice-dots]");
    var index = 0;
    var timer;

    if (!slides.length) return;

    slides.forEach(function (_, i) {
      var dot = document.createElement("button");
      dot.type = "button";
      dot.className = "practice-slider__dot" + (i === 0 ? " is-active" : "");
      dot.setAttribute("aria-label", "Ir a la práctica " + (i + 1));
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
      var dots = dotsWrap ? dotsWrap.querySelectorAll(".practice-slider__dot") : [];
      dots.forEach(function (dot, i) {
        dot.classList.toggle("is-active", i === index);
      });
    }

    function restartAutoplay() {
      clearInterval(timer);
      timer = setInterval(function () {
        goTo(index + 1);
      }, 15000);
    }

    // Swipe simple en móvil
    var startX = 0;
    var viewport = slider.querySelector(".practice-slider__viewport");
    if (viewport) {
      viewport.addEventListener(
        "touchstart",
        function (e) {
          startX = e.changedTouches[0].screenX;
        },
        { passive: true }
      );
      viewport.addEventListener(
        "touchend",
        function (e) {
          var dx = e.changedTouches[0].screenX - startX;
          if (Math.abs(dx) < 40) return;
          if (dx < 0) goTo(index + 1);
          else goTo(index - 1);
          restartAutoplay();
        },
        { passive: true }
      );
    }

    slider.addEventListener("mouseenter", function () {
      clearInterval(timer);
    });
    slider.addEventListener("mouseleave", restartAutoplay);

    goTo(0);
    restartAutoplay();
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
    var hintEl = section.querySelector("[data-journey-today-hint]");
    var calendarEl = section.querySelector("[data-journey-calendar]");
    var checkinBtn = section.querySelector("[data-journey-checkin]");
    var statusEl = section.querySelector("[data-journey-status]");

    function setJourneyStatus(message, isError) {
      if (!statusEl) return;
      statusEl.hidden = false;
      statusEl.textContent = message;
      statusEl.classList.toggle("is-error", !!isError);
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
        var name = normalizeName(nameInput && nameInput.value);
        var phone = normalizePhone(phoneInput && phoneInput.value);
        var btn = form.querySelector(".btn-cta");
        var nameOk = isValidName(name);
        var phoneOk = isValidPhone(phone);

        setFieldValidity(nameInput, nameOk);
        setFieldValidity(phoneInput, phoneOk);

        if (!nameOk) {
          if (nameInput) nameInput.focus();
          setJourneyStatus(
            "Ingresa un nombre válido (solo letras, espacios, apóstrofe o guion).",
            true
          );
          return;
        }

        if (!phoneOk) {
          if (phoneInput) phoneInput.focus();
          setJourneyStatus("Ingresa un teléfono de exactamente 10 dígitos.", true);
          return;
        }

        if (nameInput) nameInput.value = name;
        if (phoneInput) phoneInput.value = formatPhoneDisplay(phone);

        if (btn) {
          btn.disabled = true;
          btn.textContent = "Entrando…";
        }

        ProgressStore.loginOrRegister(phone, name)
          .then(function (data) {
            AppState.phone = phone;
            AppState.data = data;
            ProgressStore.setSession({ phone: phone, name: data.name });
            AppState.notify();
            setJourneyStatus(
              isSupabaseConfigured()
                ? "Bienvenido. Tu avance quedó guardado en la nube."
                : "Sesión iniciada en este dispositivo. Configura Supabase para sincronizar."
            );
            renderDashboard();
          })
          .catch(function () {
            setJourneyStatus("No pudimos guardar ahora. Intenta de nuevo.", true);
          })
          .finally(function () {
            if (btn) {
              btn.disabled = false;
              btn.textContent = "Entrar a mi propósito";
            }
          });
      });

      ["input", "blur"].forEach(function (evt) {
        form.addEventListener(evt, function (e) {
          var target = e.target;
          if (!target || !target.name) return;
          if (target.name === "name") {
            setFieldValidity(target, !target.value || isValidName(target.value));
          }
          if (target.name === "phone") {
            setFieldValidity(target, !target.value || isValidPhone(target.value));
          }
        });
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

    function setStatus(form, message, isError) {
      var status = form.querySelector("[data-form-status]");
      if (!status) return;
      status.hidden = false;
      status.textContent = message;
      status.classList.toggle("is-error", !!isError);
    }

    forms.forEach(function (form) {
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        var nameInput = form.querySelector('input[name="nombre"]');
        var phoneInput = form.querySelector('input[name="telefono"]');
        var emailInput = form.querySelector('input[name="email"]');
        var btn = form.querySelector(".btn-cta");

        var name = normalizeName(nameInput && nameInput.value);
        var phone = normalizePhone(phoneInput && phoneInput.value);
        var email = emailInput ? emailInput.value.trim() : "";
        var nameOk = isValidName(name);
        var phoneOk = isValidPhone(phone);

        setFieldValidity(nameInput, nameOk);
        setFieldValidity(phoneInput, phoneOk);

        if (!nameOk) {
          setStatus(
            form,
            "Ingresa un nombre válido (solo letras, espacios, apóstrofe o guion).",
            true
          );
          return;
        }
        if (!phoneOk) {
          setStatus(form, "Ingresa un teléfono de exactamente 10 dígitos.", true);
          return;
        }

        if (btn) {
          btn.disabled = true;
          btn.textContent = "Enviando…";
        }

        ProgressStore.loginOrRegister(phone, name, email)
          .then(function (data) {
            AppState.phone = phone;
            AppState.data = data;
            ProgressStore.setSession({ phone: phone, name: data.name });
            AppState.notify();
            form.classList.add("is-submitted");
            if (btn) {
              btn.textContent = "Registro recibido";
              btn.disabled = true;
            }
            setStatus(
              form,
              isSupabaseConfigured()
                ? "¡Gracias! Ya estás registrado. Continúa en Tu camino de 21 días."
                : "Registro guardado en este dispositivo. Configura Supabase para sincronizar leads."
            );
          })
          .catch(function () {
            if (btn) {
              btn.disabled = false;
              btn.textContent = "Aceptar el desafío de 21 días";
            }
            setStatus(form, "No pudimos registrar ahora. Intenta de nuevo.", true);
          });
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

  function resetScrollOnLoad() {
    if ("scrollRestoration" in history) {
      history.scrollRestoration = "manual";
    }
    if (!window.location.hash || window.location.hash === "#registro") {
      window.scrollTo(0, 0);
    }
    requestAnimationFrame(function () {
      document.documentElement.classList.add("is-smooth-scroll");
    });
  }

  function boot() {
    var root = document.querySelector(".ayuno-landing");
    if (!root) return;

    resetScrollOnLoad();

    bootState().then(function () {
      initAccordion(root);
      initAlertToggles(root);
      initCarousel(root);
      initPracticeSlider(root);
      initJourney(root);
      initReveal(root);
      initForms(root);
      initStoryScroll(root);
      if (!window.location.hash || window.location.hash === "#registro") {
        window.scrollTo(0, 0);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
