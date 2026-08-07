/**
 * Вся логика времени строго в часовом поясе Europe/Moscow (MSK, UTC+3).
 * Локальный часовой пояс устройства НЕ используется для расчётов поездок.
 */

const MSK_TIMEZONE = 'Europe/Moscow';

/** Поездки загружаются из data/trips.json — публичная часть не хранит их в коде. */
const TRIPS_URL = './data/trips.json';
const CMS_TRIPS_STORAGE_KEY = 'trainsite.cms.trips';

/**
 * Создаёт объект Date из компонентов московского времени.
 * Использует ISO-строку с явным смещением +03:00 (MSK).
 */
function createMSKDate(year, month, day, hour, minute, second = 0) {
  const pad = (n) => String(n).padStart(2, '0');
  const iso = `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}+03:00`;
  return new Date(iso);
}

/** Преобразует статическую запись в формат, который используют существующие таймеры. */
function normalizeTrip(trip) {
  const [departureYear, departureMonth, departureDay] = trip.departureDate.split('-').map(Number);
  const [departureHour, departureMinute] = trip.departureTime.split(':').map(Number);
  const [arrivalYear, arrivalMonth, arrivalDay] = trip.arrivalDate.split('-').map(Number);
  const [arrivalHour, arrivalMinute] = trip.arrivalTime.split(':').map(Number);
  const offset = trip.utcOffset || '+03:00';
  const makeDate = (year, month, day, hour, minute) => {
    const pad = (value) => String(value).padStart(2, '0');
    return new Date(`${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00${offset}`);
  };
  const displayDate = (date, time) => {
    const [year, month, day] = date.split('-');
    const [hours, minutes] = time.split(':');
    return `${day}.${month}.${year} · ${Number(hours)}:${minutes}`;
  };

  return {
    ...trip,
    departure: makeDate(departureYear, departureMonth, departureDay, departureHour, departureMinute),
    arrival: makeDate(arrivalYear, arrivalMonth, arrivalDay, arrivalHour, arrivalMinute),
    departureLabel: displayDate(trip.departureDate, trip.departureTime),
    arrivalLabel: displayDate(trip.arrivalDate, trip.arrivalTime),
  };
}

async function loadTrips() {
  try {
    const localRecords = JSON.parse(localStorage.getItem(CMS_TRIPS_STORAGE_KEY));
    if (Array.isArray(localRecords)) return localRecords.map(normalizeTrip);
  } catch {
    // Повреждённый локальный каталог не должен останавливать публичную страницу.
  }

  const response = await fetch(TRIPS_URL, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Trips request failed: ${response.status}`);
  const records = await response.json();
  if (!Array.isArray(records)) throw new Error('Trips data must be an array');
  return records.map(normalizeTrip);
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character]);
}

function safeColor(value) {
  return /^#[0-9a-f]{3,8}$/i.test(value || '') ? value : '#a78bfa';
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
  const stops = trip.stops || [];
  const routeItems = stops.map((stop, index) => {
    const time = stop.departureTime || stop.arrivalTime || '—';
    const detail = stop.stopDuration ? ` · ${stop.stopDuration}` : '';
    return `<li class="trip-stop${index === 0 ? ' is-origin' : ''}${index === stops.length - 1 ? ' is-destination' : ''}"><span>${index + 1}</span><strong>${escapeHtml(stop.stationName || 'Станция')}</strong><time>${escapeHtml(time)}${escapeHtml(detail)}</time></li>`;
  }).join('');

  return `
    <article class="trip-card" data-trip-id="${escapeHtml(trip.id)}" style="--trip-accent: ${safeColor(trip.color)}">
      <h2 class="trip-card__title">${escapeHtml(trip.title)}</h2>
      <p class="trip-card__meta">
        <strong>Выезд:</strong> ${escapeHtml(trip.departureLabel)} MSK<br>
        <strong>Прибытие:</strong> ${escapeHtml(trip.arrivalLabel)} MSK
      </p>

      <div class="journey-stages" aria-label="Состояние поездки">
        <section class="trip-stage"><p class="trip-stage__label">До выезда</p><div data-role="departure-timer"></div></section>
        <section class="trip-stage"><p class="trip-stage__label">До прибытия</p><div data-role="transit-timer"></div></section>
        <section class="trip-stage"><p class="trip-stage__label">До станции</p><div data-role="station-status"></div></section>
        <section class="trip-stage"><p class="trip-stage__label">Стоянка</p><div data-role="stop-status"></div></section>
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
            <span>${escapeHtml(stops[0]?.stationName || 'Отправление')}</span>
            <span>${escapeHtml(stops.at(-1)?.stationName || 'Прибытие')}</span>
          </div>
        </div>
      </div>
      <div class="trip-route"><div class="trip-route__heading"><span>Остановки маршрута</span><b>${stops.length}</b></div><ol class="trip-stops">${routeItems || '<li class="trip-stop is-empty">Остановки не добавлены.</li>'}</ol></div>
      <button class="trip-card__details" type="button" data-open-trip="${escapeHtml(trip.id)}">Подробнее <span>→</span></button>
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
  const stationContainer = card.querySelector('[data-role="station-status"]');
  const stopContainer = card.querySelector('[data-role="stop-status"]');
  const fill = card.querySelector('[data-role="progress-fill"]');
  const train = card.querySelector('[data-role="progress-train"]');
  const percentEl = card.querySelector('[data-role="progress-percent"]');

  const prefix = trip.id;
  const percent = getProgressPercent(now, departure, arrival);
  const stops = trip.stops || [];
  const nextStopIndex = Math.min(stops.length - 1, Math.max(0, Math.ceil((percent / 100) * Math.max(stops.length - 1, 0))));
  const nextStop = stops[nextStopIndex];
  const setStatus = (container, message, modifier = 'waiting') => {
    container.innerHTML = `<span class="status-badge status-badge--${modifier}">${escapeHtml(message)}</span>`;
  };

  if (trip.status === 'cancelled') {
    setStatus(depContainer, 'Поезд отменён', 'cancelled');
    setStatus(transitContainer, 'Рейс не состоится', 'cancelled');
    setStatus(stationContainer, 'Движение отменено', 'cancelled');
    setStatus(stopContainer, 'Нет данных о стоянке', 'cancelled');
    fill.style.width = '0%'; train.style.left = '0%'; percentEl.textContent = '0%';
    return;
  }

  if (trip.status === 'completed' || phase === 'after') {
    setStatus(depContainer, 'Поезд отправился', 'departed');
    setStatus(transitContainer, 'Поезд на месте! 🎉', 'arrived');
    setStatus(stationContainer, `Прибытие: ${stops.at(-1)?.stationName || 'конечная станция'}`, 'arrived');
    setStatus(stopContainer, trip.footerText || 'Поздравляем, вы доехали!', 'arrived');
    fill.style.width = '100%'; train.style.left = '100%'; percentEl.textContent = '100%';
    return;
  }

  // ── Таймер 1: до выезда ──
  if (phase === 'before' && trip.status !== 'draft') {
    const remaining = splitDuration(departure - now);
    updateCountdown(depContainer, `${prefix}-dep`, remaining);
  } else if (phase === 'transit') {
    setStatus(depContainer, 'Поезд в пути!', 'transit');
  } else {
    setStatus(depContainer, 'Поезд не в пути', 'waiting');
  }

  // ── Таймер 2: до прибытия ──
  if (phase === 'before') {
    setStatus(transitContainer, 'Ожидание прибытия', 'waiting');
  } else if (phase === 'transit') {
    const remaining = splitDuration(arrival - now);
    updateCountdown(transitContainer, `${prefix}-transit`, remaining, true);
  }

  if (phase === 'transit' && nextStop) {
    setStatus(stationContainer, `Следующая: ${nextStop.stationName}${nextStop.arrivalTime ? ` · ${nextStop.arrivalTime}` : ''}`, 'transit');
    setStatus(stopContainer, nextStop.stopDuration ? `Стоянка ${nextStop.stopDuration}` : 'Ожидание прибытия станции', 'waiting');
  } else {
    setStatus(stationContainer, 'Поезд не в пути', 'waiting');
    setStatus(stopContainer, stops[0] ? `Отправление: ${stops[0].stationName}` : 'Остановки не заданы', 'waiting');
  }

  // ── Прогресс-бар и поезд ──
  fill.style.width = `${percent}%`;
  train.style.left = `${percent}%`;
  percentEl.textContent = `${Math.round(percent)}%`;
}

function showTripDetails(trip) {
  if (!trip) return;
  let dialog = document.getElementById('trip-details-dialog');
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'trip-details-dialog';
    dialog.className = 'trip-dialog';
    document.body.append(dialog);
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog || event.target.closest('[data-close-dialog]')) dialog.close();
    });
  }
  const stops = trip.stops || [];
  dialog.innerHTML = `<div class="trip-dialog__content" style="--trip-accent: ${safeColor(trip.color)}"><button class="trip-dialog__close" type="button" data-close-dialog aria-label="Закрыть">×</button><p class="trip-dialog__eyebrow">${escapeHtml(trip.trainNumber || 'ПОЕЗД')} · ${escapeHtml(trip.trainName || 'Рейс')}</p><h2>${escapeHtml(trip.title)}</h2><p class="trip-dialog__route">${escapeHtml(stops[0]?.stationName || 'Отправление')} → ${escapeHtml(stops.at(-1)?.stationName || 'Прибытие')}</p><ol class="trip-dialog__stops">${stops.map((stop, index) => `<li><span>${String(index + 1).padStart(2, '0')}</span><strong>${escapeHtml(stop.stationName || 'Станция')}</strong><time>${escapeHtml(stop.arrivalTime || '—')} — ${escapeHtml(stop.departureTime || '—')}</time><small>${escapeHtml(stop.stopDuration || 'Без стоянки')}${stop.platform ? ` · платформа ${escapeHtml(stop.platform)}` : ''}${stop.delay ? ` · задержка ${escapeHtml(stop.delay)} мин` : ''}</small></li>`).join('') || '<li>Остановки маршрута пока не добавлены.</li>'}</ol></div>`;
  dialog.showModal();
}

/** Инициализация приложения */
async function init() {
  const cardsRoot = document.getElementById('trip-cards');
  const clockEl = document.getElementById('msk-clock');

  let trips;
  try {
    trips = await loadTrips();
  } catch (error) {
    console.error(error);
    cardsRoot.innerHTML = '<p class="status-badge status-badge--departed">Не удалось загрузить расписание.</p>';
    return;
  }

  cardsRoot.innerHTML = trips.map(renderTripCard).join('');
  const cardElements = [...cardsRoot.querySelectorAll('.trip-card')];

  function tick() {
    const now = new Date(); // абсолютный момент; сравнение с MSK-датами корректно

    clockEl.textContent = formatMSKClock(now);
    clockEl.setAttribute('datetime', now.toISOString());

    cardElements.forEach((card, i) => {
      updateTripCard(card, trips[i], now);
    });
  }

  tick();
  setInterval(tick, 1000);
}

init();
