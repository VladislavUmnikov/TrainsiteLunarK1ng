/**
 * Вся логика времени строго в часовом поясе Europe/Moscow (MSK, UTC+3).
 * Локальный часовой пояс устройства НЕ используется для расчётов поездок.
 */

const MSK_TIMEZONE = 'Europe/Moscow';

/** Конфигурация поездок — даты/время заданы в MSK */
const TRIPS = [
  {
    id: 'pasha-diana',
    title: 'Поездка Паша и Диана',
    departure: createMSKDate(2026, 7, 7, 22, 5, 0),
    arrival: createMSKDate(2026, 7, 8, 8, 3, 0),
    departureLabel: '07.07.2026 · 22:05',
    arrivalLabel: '08.07.2026 · 08:03',
  },
  {
    id: 'vlad',
    title: 'Поездка Влад',
    departure: createMSKDate(2026, 7, 8, 2, 4, 0),
    arrival: createMSKDate(2026, 7, 8, 10, 16, 0),
    departureLabel: '08.07.2026 · 02:04',
    arrivalLabel: '08.07.2026 · 10:16',
  },
];

/**
 * Создаёт объект Date из компонентов московского времени.
 * Использует ISO-строку с явным смещением +03:00 (MSK).
 */
function createMSKDate(year, month, day, hour, minute, second = 0) {
  const pad = (n) => String(n).padStart(2, '0');
  const iso = `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}+03:00`;
  return new Date(iso);
}

/**
 * Форматирует текущий момент как московское время (для отображения часов).
 */
function formatMSKClock(date = new Date()) {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: MSK_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

/**
 * Разбивает миллисекунды на d/h/m/s (неотрицательные).
 */
function splitDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { days, hours, minutes, seconds };
}

/**
 * Определяет состояние поездки относительно текущего момента.
 */
function getTripPhase(now, departure, arrival) {
  if (now < departure) return 'before';
  if (now >= departure && now < arrival) return 'transit';
  return 'after';
}

/**
 * Процент прогресса пути (0–100) между выездом и прибытием.
 */
function getProgressPercent(now, departure, arrival) {
  if (now <= departure) return 0;
  if (now >= arrival) return 100;
  const total = arrival - departure;
  const elapsed = now - departure;
  return Math.min(100, Math.max(0, (elapsed / total) * 100));
}

/** SVG-иконка поезда */
function trainSVG() {
  return `
    <svg class="train-svg" viewBox="0 0 64 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="4" y="12" width="44" height="14" rx="3" fill="#1e293b" stroke="#38bdf8" stroke-width="1.2"/>
      <rect x="48" y="10" width="12" height="16" rx="2" fill="#334155" stroke="#22d3ee" stroke-width="1"/>
      <rect class="train-svg__window" x="10" y="15" width="7" height="5" rx="1" fill="#fef08a"/>
      <rect class="train-svg__window" x="20" y="15" width="7" height="5" rx="1" fill="#fef08a"/>
      <rect class="train-svg__window" x="30" y="15" width="7" height="5" rx="1" fill="#fef08a"/>
      <rect class="train-svg__window" x="50" y="13" width="6" height="4" rx="1" fill="#fde047"/>
      <circle cx="14" cy="27" r="3.5" fill="#0f172a" stroke="#64748b" stroke-width="1"/>
      <circle cx="28" cy="27" r="3.5" fill="#0f172a" stroke="#64748b" stroke-width="1"/>
      <circle cx="42" cy="27" r="3.5" fill="#0f172a" stroke="#64748b" stroke-width="1"/>
      <rect x="2" y="18" width="4" height="4" rx="1" fill="#475569"/>
    </svg>
  `;
}

/** Рендер одной карточки поездки */
function renderTripCard(trip) {
  return `
    <article class="trip-card" data-trip-id="${trip.id}">
      <h2 class="trip-card__title">${trip.title}</h2>
      <p class="trip-card__meta">
        <strong>Выезд:</strong> ${trip.departureLabel} MSK<br>
        <strong>Прибытие:</strong> ${trip.arrivalLabel} MSK
      </p>

      <div class="timer-block">
        <p class="timer-block__label">До выезда</p>
        <div class="timer-departure" data-role="departure-timer"></div>
      </div>

      <div class="timer-block">
        <p class="timer-block__label">Путь осталось</p>
        <div class="timer-transit" data-role="transit-timer"></div>
      </div>

      <div class="progress">
        <div class="progress__header">
          <span>Маршрут</span>
          <span class="progress__percent" data-role="progress-percent">0%</span>
        </div>
        <div class="progress__track">
          <div class="progress__line">
            <div class="progress__fill" data-role="progress-fill"></div>
          </div>
          <div class="progress__train-wrap">
            <div class="progress__train" data-role="progress-train">
              <div class="train-smoke" aria-hidden="true">
                <span></span><span></span><span></span>
              </div>
              ${trainSVG()}
            </div>
          </div>
          <div class="progress__stations">
            <span>Отправление</span>
            <span>Прибытие</span>
          </div>
        </div>
      </div>
    </article>
  `;
}

/** Рендер блока обратного отсчёта (4 единицы) */
function renderCountdown(idPrefix, { days, hours, minutes, seconds }, glow = false) {
  const units = [
    { key: 'days', label: 'дн', value: days },
    { key: 'hours', label: 'ч', value: hours },
    { key: 'minutes', label: 'мин', value: minutes },
    { key: 'seconds', label: 'сек', value: seconds },
  ];

  return `
    <div class="timer-grid" role="timer">
      ${units
        .map(
          ({ key, label, value }) => `
        <div class="timer-unit">
          <div
            class="timer-unit__value${glow ? ' is-glow' : ''}"
            id="${idPrefix}-${key}"
            data-unit="${key}"
          >${String(value).padStart(2, '0')}</div>
          <div class="timer-unit__label">${label}</div>
        </div>
      `
        )
        .join('')}
    </div>
  `;
}

/** Обновляет DOM таймера с flip-анимацией при смене значения */
function updateCountdown(container, idPrefix, duration, glow = false) {
  const units = ['days', 'hours', 'minutes', 'seconds'];
  const values = [duration.days, duration.hours, duration.minutes, duration.seconds];

  if (!container.querySelector('.timer-grid')) {
    container.innerHTML = renderCountdown(idPrefix, duration, glow);
    return;
  }

  units.forEach((unit, i) => {
    const el = container.querySelector(`[data-unit="${unit}"]`);
    if (!el) return;
    const next = String(values[i]).padStart(2, '0');
    if (el.textContent !== next) {
      el.textContent = next;
      el.classList.remove('is-flip');
      void el.offsetWidth; // reflow для перезапуска анимации
      el.classList.add('is-flip');
    }
    el.classList.toggle('is-glow', glow);
  });
}

/** Обновляет одну карточку поездки */
function updateTripCard(card, trip, now) {
  const { departure, arrival } = trip;
  const phase = getTripPhase(now, departure, arrival);

  const depContainer = card.querySelector('[data-role="departure-timer"]');
  const transitContainer = card.querySelector('[data-role="transit-timer"]');
  const fill = card.querySelector('[data-role="progress-fill"]');
  const train = card.querySelector('[data-role="progress-train"]');
  const percentEl = card.querySelector('[data-role="progress-percent"]');

  const prefix = trip.id;

  // ── Таймер 1: до выезда ──
  if (phase === 'before') {
    const remaining = splitDuration(departure - now);
    updateCountdown(depContainer, `${prefix}-dep`, remaining);
  } else if (phase === 'transit') {
    depContainer.innerHTML =
      '<span class="status-badge status-badge--transit">Поезд уже в пути</span>';
  } else {
    depContainer.innerHTML =
      '<span class="status-badge status-badge--departed">Поезд уехал</span>';
  }

  // ── Таймер 2: путь осталось ──
  if (phase === 'before') {
    transitContainer.innerHTML =
      '<span class="status-badge status-badge--waiting">Ожидание отправления</span>';
  } else if (phase === 'transit') {
    const remaining = splitDuration(arrival - now);
    updateCountdown(transitContainer, `${prefix}-transit`, remaining, true);
  } else {
    transitContainer.innerHTML =
      '<span class="status-badge status-badge--arrived">Прибыли! 🎉</span>';
  }

  // ── Прогресс-бар и поезд ──
  const percent = getProgressPercent(now, departure, arrival);
  fill.style.width = `${percent}%`;
  train.style.left = `${percent}%`;
  percentEl.textContent = `${Math.round(percent)}%`;
}

/** Инициализация приложения */
function init() {
  const cardsRoot = document.getElementById('trip-cards');
  const clockEl = document.getElementById('msk-clock');

  cardsRoot.innerHTML = TRIPS.map(renderTripCard).join('');
  const cardElements = [...cardsRoot.querySelectorAll('.trip-card')];

  function tick() {
    const now = new Date(); // абсолютный момент; сравнение с MSK-датами корректно

    clockEl.textContent = formatMSKClock(now);
    clockEl.setAttribute('datetime', now.toISOString());

    cardElements.forEach((card, i) => {
      updateTripCard(card, TRIPS[i], now);
    });
  }

  tick();
  setInterval(tick, 1000);
}

init();
