const DATA_FILES = {
  trips: '../data/trips.json',
  stations: '../data/stations.json',
  settings: '../data/settings.json',
};

const STORAGE_PREFIX = 'trainsite.cms.';
const state = { trips: [], stations: [], settings: {}, view: 'dashboard' };

const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
const storageKey = (key) => `${STORAGE_PREFIX}${key}`;

function formatDate(date) {
  if (!date) return '—';
  const [year, month, day] = date.split('-');
  return `${day}.${month}.${year}`;
}

function getTripRoute(trip) {
  const stops = trip.stops || [];
  if (!stops.length) return 'Маршрут не указан';
  return `${stops[0].stationName} — ${stops.at(-1).stationName}`;
}

function getTravelDuration(trip) {
  const departure = new Date(`${trip.departureDate}T${trip.departureTime || '00:00'}:00${trip.utcOffset || '+03:00'}`);
  const arrival = new Date(`${trip.arrivalDate}T${trip.arrivalTime || '00:00'}:00${trip.utcOffset || '+03:00'}`);
  const minutes = Math.max(0, Math.round((arrival - departure) / 60_000));
  return `${Math.floor(minutes / 60)} ч ${minutes % 60} мин`;
}

function getPlatform(trip) {
  return trip.stops?.find((stop) => stop.platform)?.platform || '—';
}

function getStoredData(key) {
  try {
    const value = localStorage.getItem(storageKey(key));
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function saveData(key, value) {
  localStorage.setItem(storageKey(key), JSON.stringify(value));
}

async function fetchSeed(key) {
  const response = await fetch(DATA_FILES[key], { cache: 'no-store' });
  if (!response.ok) throw new Error(`Не удалось получить ${key}`);
  return response.json();
}

async function loadData() {
  const keys = Object.keys(DATA_FILES);
  const seed = await Promise.all(keys.map(fetchSeed));
  keys.forEach((key, index) => {
    state[key] = getStoredData(key) ?? seed[index];
  });
}

function showToast(message) {
  const region = document.getElementById('toast-region');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  region.append(toast);
  window.setTimeout(() => toast.remove(), 3200);
}

function updateClock() {
  const clock = document.getElementById('admin-clock');
  clock.textContent = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
}

function metric(label, value, detail, color) {
  return `<article class="metric-card glass-card" style="--metric-color:${color}"><p class="metric-label">${label}</p><p class="metric-value">${value}</p><p class="metric-detail">${detail}</p></article>`;
}

function renderDashboard() {
  const trips = state.trips;
  const active = trips.filter((trip) => trip.status === 'active').length;
  const upcoming = [...trips]
    .filter((trip) => `${trip.departureDate}T${trip.departureTime}` >= new Date().toISOString().slice(0, 16))
    .sort((a, b) => `${a.departureDate} ${a.departureTime}`.localeCompare(`${b.departureDate} ${b.departureTime}`))[0] ?? trips[0];
  const latest = trips.map((trip) => trip.updatedAt).filter(Boolean).sort().at(-1);
  const main = document.getElementById('admin-main');

  main.innerHTML = `
    <header class="view-header">
      <div><p class="view-kicker">Оперативный центр</p><h1 class="view-title">Главная</h1><p class="view-subtitle">Сводка по расписанию и последним изменениям.</p></div>
      <button class="button button--primary" type="button" data-action="create-trip">＋ Создать поездку</button>
    </header>
    <section class="metric-grid" aria-label="Ключевые показатели">
      ${metric('Всего поездок', trips.length, 'в локальном каталоге', '#8a2be2')}
      ${metric('Активные рейсы', active, active ? 'отображаются на сайте' : 'нет активных рейсов', '#22d3ee')}
      ${metric('Ближайший выезд', upcoming ? upcoming.departureTime : '—', upcoming ? formatDate(upcoming.departureDate) : 'нет данных', '#a78bfa')}
      ${metric('Станции', state.stations.length, 'в справочнике', '#38bdf8')}
      ${metric('Последнее изменение', latest ? formatDate(latest.slice(0, 10)) : '—', 'локальные данные', '#34d399')}
    </section>
    <section class="overview-grid">
      <article class="panel glass-card"><h2 class="panel-title">Последняя активность <small>LOCAL STORAGE</small></h2><div class="activity-list">
        ${trips.length ? trips.slice(0, 4).map((trip) => `<div class="activity"><span class="activity-icon">◷</span><p>${escapeHtml(trip.title)}<span>${escapeHtml(getTripRoute(trip))}</span></p><time>${formatDate(trip.updatedAt?.slice(0, 10) || trip.departureDate)}</time></div>`).join('') : '<p class="view-subtitle">Пока нет сохранённых поездок.</p>'}
      </div></article>
      <article class="next-trip glass-card">${upcoming ? `<span class="route-code">${escapeHtml(upcoming.trainNumber || 'TRIP')}</span><h2 class="next-title">${escapeHtml(upcoming.title)}</h2><p class="next-route">${escapeHtml(getTripRoute(upcoming))}</p><div class="next-times"><div class="next-time"><span>ВЫЕЗД</span><strong>${escapeHtml(upcoming.departureTime)}</strong></div><div class="next-time"><span>ПРИБЫТИЕ</span><strong>${escapeHtml(upcoming.arrivalTime)}</strong></div></div>` : '<p class="view-subtitle">Создайте первую поездку.</p>'}</article>
    </section>`;
}

const statusLabels = { active: 'Активен', draft: 'Черновик', completed: 'Завершён', cancelled: 'Отменён' };

function newId(prefix) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createBlankTrip() {
  return {
    id: newId('trip'), title: 'Новая поездка', description: '', trainNumber: '', trainName: '', trainType: 'Скорый', carrier: '',
    departureDate: '2026-08-09', departureTime: '12:00', arrivalDate: '2026-08-09', arrivalTime: '18:00',
    timezone: state.settings.timezone || 'Europe/Moscow', utcOffset: '+03:00', status: 'draft', color: state.settings.accentColor || '#8A2BE2', image: '',
    previewText: 'Ожидание отправления', footerText: '',
    stops: [
      { id: newId('stop'), stationId: '', stationName: 'Москва', arrivalTime: '', departureTime: '12:00', stopDuration: '', platform: '', track: '', delay: 0, notes: 'Начальная станция' },
      { id: newId('stop'), stationId: '', stationName: 'Санкт-Петербург', arrivalTime: '18:00', departureTime: '', stopDuration: '', platform: '', track: '', delay: 0, notes: 'Конечная станция' },
    ],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}

function openEditor(id) {
  state.draft = id ? clone(state.trips.find((trip) => trip.id === id)) : createBlankTrip();
  state.view = 'editor';
  render();
}

function statusSelect(value, className = '') {
  return `<select class="${className}" data-field="status" aria-label="Статус">${Object.entries(statusLabels).map(([key, label]) => `<option value="${key}"${key === value ? ' selected' : ''}>${label}</option>`).join('')}</select>`;
}

function renderTrips() {
  const query = (state.tripQuery || '').trim().toLocaleLowerCase('ru-RU');
  const filtered = state.trips.filter((trip) => `${trip.title} ${trip.trainNumber} ${trip.trainName} ${getTripRoute(trip)}`.toLocaleLowerCase('ru-RU').includes(query));
  document.getElementById('admin-main').innerHTML = `
    <header class="view-header"><div><p class="view-kicker">Расписание</p><h1 class="view-title">Поездки</h1><p class="view-subtitle">Создавайте и редактируйте рейсы, маршруты и их публичное представление.</p></div><button class="button button--primary" type="button" data-action="create-trip">＋ Создать поездку</button></header>
    <section class="glass-card table-shell">
      <div class="table-tools"><label class="search-field">⌕ <input data-trip-search type="search" value="${escapeHtml(state.tripQuery || '')}" placeholder="Найти поездку или поезд"></label><span class="table-count">${filtered.length} из ${state.trips.length}</span></div>
      <div class="trip-list">
        ${filtered.length ? filtered.map((trip) => `<article class="trip-row"><div class="trip-row__main"><span class="status-dot status-dot--${escapeHtml(trip.status)}"></span><div><h2>${escapeHtml(trip.title)}</h2><p>${escapeHtml(trip.trainNumber || 'Без номера')} · ${escapeHtml(trip.trainName || 'Без названия')} · ${escapeHtml(getTripRoute(trip))}</p></div></div><div class="trip-row__date"><span>ВЫЕЗД</span><strong>${formatDate(trip.departureDate)} · ${escapeHtml(trip.departureTime)}</strong></div><span class="status-pill status-pill--${escapeHtml(trip.status)}">${statusLabels[trip.status] || 'Черновик'}</span><div class="row-actions"><button type="button" class="icon-button" data-action="duplicate-trip" data-id="${trip.id}" title="Дублировать">⧉</button><button type="button" class="icon-button" data-action="edit-trip" data-id="${trip.id}" title="Редактировать">✎</button><button type="button" class="icon-button icon-button--danger" data-action="delete-trip" data-id="${trip.id}" title="Удалить">⌫</button></div></article>`).join('') : '<div class="empty-inline">Поездки не найдены. Создайте новую или измените строку поиска.</div>'}
      </div>
    </section>`;
}

function refreshTripsAfterSearch() {
  renderTrips();
  const search = document.querySelector('[data-trip-search]');
  search?.focus();
  search?.setSelectionRange(state.tripQuery.length, state.tripQuery.length);
}

function formatPreviewCountdown(trip) {
  const date = new Date(`${trip.departureDate}T${trip.departureTime || '00:00'}:00${trip.utcOffset || '+03:00'}`);
  const arrival = new Date(`${trip.arrivalDate}T${trip.arrivalTime || '00:00'}:00${trip.utcOffset || '+03:00'}`);
  const now = new Date();
  const target = now < date ? date : now < arrival ? arrival : null;
  if (!target) return [{ value: '00', label: 'дн' }, { value: '00', label: 'ч' }, { value: '00', label: 'мин' }, { value: '00', label: 'сек' }];
  let seconds = Math.max(0, Math.floor((target - now) / 1000));
  const values = [Math.floor(seconds / 86400), Math.floor((seconds % 86400) / 3600), Math.floor((seconds % 3600) / 60), seconds % 60];
  return values.map((value, index) => ({ value: String(value).padStart(2, '0'), label: ['дн', 'ч', 'мин', 'сек'][index] }));
}

function previewMarkup(trip) {
  const stops = trip.stops || [];
  const progress = trip.status === 'completed' ? 100 : 0;
  return `<article class="preview-card" style="--preview-accent:${escapeHtml(trip.color || '#8A2BE2')}">
    <div class="preview-card__glow"></div><div class="preview-content"><span class="preview-status preview-status--${escapeHtml(trip.status || 'draft')}">${statusLabels[trip.status] || 'Черновик'}</span><h2>${escapeHtml(trip.title || 'Название поездки')}</h2><p class="preview-dates">Выезд: ${formatDate(trip.departureDate)} · ${escapeHtml(trip.departureTime || '--:--')} MSK<br>Прибытие: ${formatDate(trip.arrivalDate)} · ${escapeHtml(trip.arrivalTime || '--:--')} MSK</p>
    <div class="preview-divider"></div><p class="preview-label">${trip.status === 'completed' ? 'Поездка завершена' : 'До выезда'}</p><div class="preview-timer">${formatPreviewCountdown(trip).map((unit) => `<div><strong>${unit.value}</strong><span>${unit.label}</span></div>`).join('')}</div>
    <p class="preview-label preview-label--route">Путь осталось</p><p class="preview-state">${escapeHtml(trip.previewText || 'Ожидание отправления')}</p><div class="preview-progress"><span>Маршрут</span><b>${progress}%</b><i><em style="width:${progress}%"></em></i></div><div class="preview-route"><span>${escapeHtml(stops[0]?.stationName || 'Отправление')}</span><b>▣</b><span>${escapeHtml(stops.at(-1)?.stationName || 'Прибытие')}</span></div><p class="preview-stop-trail">${stops.map((stop) => escapeHtml(stop.stationName)).join(' · ')}</p></div>
  </article>`;
}

function stopRow(stop, index) {
  return `<article class="stop-editor" draggable="true" data-stop-row="${index}"><span class="drag-handle" title="Перетащите остановку">⠿</span><span class="stop-number">${index + 1}</span><div class="stop-fields"><label>Станция<input data-stop-index="${index}" data-stop-field="stationName" value="${escapeHtml(stop.stationName)}" required></label><label>Прибытие<input data-stop-index="${index}" data-stop-field="arrivalTime" type="time" value="${escapeHtml(stop.arrivalTime)}"></label><label>Отправление<input data-stop-index="${index}" data-stop-field="departureTime" type="time" value="${escapeHtml(stop.departureTime)}"></label><label>Стоянка<input data-stop-index="${index}" data-stop-field="stopDuration" value="${escapeHtml(stop.stopDuration)}" placeholder="2 мин"></label><label>Платформа<input data-stop-index="${index}" data-stop-field="platform" value="${escapeHtml(stop.platform)}"></label><label>Путь<input data-stop-index="${index}" data-stop-field="track" value="${escapeHtml(stop.track)}"></label><label>Задержка<input data-stop-index="${index}" data-stop-field="delay" type="number" min="0" value="${escapeHtml(stop.delay ?? 0)}"></label><label class="stop-fields__notes">Примечание<input data-stop-index="${index}" data-stop-field="notes" value="${escapeHtml(stop.notes)}"></label></div><button class="icon-button icon-button--danger" type="button" data-action="remove-stop" data-index="${index}" title="Удалить остановку">⌫</button></article>`;
}

function field(label, name, value, type = 'text', extra = '') {
  return `<label class="form-field">${label}<input data-field="${name}" type="${type}" value="${escapeHtml(value)}" ${extra}></label>`;
}

function renderTripEditor() {
  const trip = state.draft;
  document.getElementById('admin-main').innerHTML = `
    <header class="view-header"><div><button type="button" class="back-link" data-action="back-to-trips">← Назад к поездкам</button><p class="view-kicker">Редактор рейса</p><h1 class="view-title">${escapeHtml(trip.title || 'Новая поездка')}</h1></div><div class="header-buttons"><button class="button" type="button" data-action="duplicate-draft">⧉ Дублировать</button><button class="button button--primary" type="submit" form="trip-editor-form">▣ Сохранить</button></div></header>
    <form id="trip-editor-form" class="editor-layout">
      <div class="editor-main"><section class="editor-section glass-card"><h2>Основная информация</h2><div class="form-grid form-grid--two">${field('Название поездки', 'title', trip.title, 'text', 'required')}${field('Описание', 'description', trip.description)}</div><div class="form-grid form-grid--four">${field('Дата выезда', 'departureDate', trip.departureDate, 'date', 'required')}${field('Время выезда', 'departureTime', trip.departureTime, 'time', 'required')}${field('Дата прибытия', 'arrivalDate', trip.arrivalDate, 'date', 'required')}${field('Время прибытия', 'arrivalTime', trip.arrivalTime, 'time', 'required')}</div><div class="form-grid form-grid--two"><label class="form-field">Часовой пояс<select data-field="timezone"><option value="Europe/Moscow"${trip.timezone === 'Europe/Moscow' ? ' selected' : ''}>MSK (UTC+3)</option></select></label><label class="form-field">Статус${statusSelect(trip.status)}</label></div></section>
        <section class="editor-section glass-card"><div class="section-heading"><h2>Информация о поезде</h2><span>${escapeHtml(trip.trainNumber || '—')}</span></div><div class="form-grid form-grid--four">${field('Номер поезда', 'trainNumber', trip.trainNumber)}${field('Название поезда', 'trainName', trip.trainName)}${field('Тип поезда', 'trainType', trip.trainType)}${field('Перевозчик', 'carrier', trip.carrier)}</div><div class="form-grid form-grid--two">${field('Изображение / URL', 'image', trip.image, 'url', 'placeholder="https://…"')}${field('Акцент', 'color', trip.color, 'color')}</div></section>
        <section class="editor-section glass-card"><div class="section-heading"><div><h2>Остановки маршрута</h2><p>Перетаскивайте строки за маркер ⠿. Изменения сразу отражаются в превью.</p></div><button class="button button--primary button--small" type="button" data-action="add-stop">＋ Остановка</button></div><div class="stop-list" id="stop-list">${trip.stops.map(stopRow).join('')}</div></section>
        <section class="editor-section glass-card"><h2>Тексты для карточки</h2><div class="form-grid form-grid--two">${field('Текст под таймером', 'previewText', trip.previewText)}${field('Дополнительный текст', 'footerText', trip.footerText)}</div></section>
      </div>
      <aside class="editor-side"><section class="preview-panel glass-card"><div class="section-heading"><h2>Предпросмотр таймера</h2><span class="preview-live">● LIVE</span></div><div id="live-preview">${previewMarkup(trip)}</div></section><section class="editor-actions glass-card"><h2>Действия</h2><button class="button button--primary button--wide" type="submit">▣ Сохранить изменения</button><button class="button button--wide" type="button" data-action="duplicate-draft">⧉ Дублировать поездку</button><button class="button button--wide button--danger" type="button" data-action="delete-draft">⌫ Удалить поездку</button></section></aside>
    </form>`;
}

function updatePreview() {
  const target = document.getElementById('live-preview');
  if (target && state.draft) target.innerHTML = previewMarkup(state.draft);
}

function renderTimetable() {
  const query = (state.timetableQuery || '').toLocaleLowerCase('ru-RU');
  const status = state.timetableStatus || 'all';
  const sort = state.timetableSort || 'departureDate';
  const records = state.trips.filter((trip) => (status === 'all' || trip.status === status) && `${trip.title} ${trip.trainNumber} ${getTripRoute(trip)}`.toLocaleLowerCase('ru-RU').includes(query)).sort((left, right) => `${left[sort] || ''}${left.departureTime || ''}`.localeCompare(`${right[sort] || ''}${right.departureTime || ''}`));
  const pageSize = 6; const pages = Math.max(1, Math.ceil(records.length / pageSize)); state.timetablePage = Math.min(state.timetablePage || 1, pages); const shown = records.slice((state.timetablePage - 1) * pageSize, state.timetablePage * pageSize);
  document.getElementById('admin-main').innerHTML = `<header class="view-header"><div><p class="view-kicker">Расписание</p><h1 class="view-title">Табло поездов</h1><p class="view-subtitle">Поиск, фильтрация и сортировка опубликованных рейсов.</p></div><button class="button button--primary" type="button" data-action="create-trip">＋ Создать поездку</button></header><section class="glass-card table-shell"><div class="table-tools table-tools--filters"><label class="search-field">⌕ <input data-timetable-search type="search" value="${escapeHtml(state.timetableQuery || '')}" placeholder="Поиск"></label><select data-timetable-status><option value="all">Все статусы</option>${Object.entries(statusLabels).map(([key, label]) => `<option value="${key}"${key === status ? ' selected' : ''}>${label}</option>`).join('')}</select><select data-timetable-sort><option value="departureDate">По дате отправления</option><option value="title"${sort === 'title' ? ' selected' : ''}>По названию</option><option value="status"${sort === 'status' ? ' selected' : ''}>По статусу</option></select></div><div class="data-table-wrap"><table class="data-table"><thead><tr><th>Поезд</th><th>Маршрут</th><th>Отправление</th><th>Прибытие</th><th>В пути</th><th>Платформа</th><th>Статус</th><th>Действие</th></tr></thead><tbody>${shown.map((trip) => `<tr><td><strong>${escapeHtml(trip.trainNumber || '—')}</strong><small>${escapeHtml(trip.trainName || trip.title)}</small></td><td>${escapeHtml(getTripRoute(trip))}</td><td>${formatDate(trip.departureDate)}<small>${escapeHtml(trip.departureTime)}</small></td><td>${formatDate(trip.arrivalDate)}<small>${escapeHtml(trip.arrivalTime)}</small></td><td>${getTravelDuration(trip)}</td><td>${escapeHtml(getPlatform(trip))}</td><td><span class="status-pill status-pill--${escapeHtml(trip.status)}">${statusLabels[trip.status]}</span></td><td><button type="button" class="button button--small" data-action="edit-trip" data-id="${trip.id}">Открыть</button></td></tr>`).join('') || '<tr><td colspan="8" class="empty-inline">Нет поездок с выбранными условиями.</td></tr>'}</tbody></table></div><div class="pagination"><span>Страница ${state.timetablePage} из ${pages}</span><div><button class="icon-button" type="button" data-action="previous-page" ${state.timetablePage === 1 ? 'disabled' : ''}>←</button><button class="icon-button" type="button" data-action="next-page" ${state.timetablePage === pages ? 'disabled' : ''}>→</button></div></div></section>`;
}

function refreshTimetableAfterSearch() {
  renderTimetable();
  const search = document.querySelector('[data-timetable-search]');
  search?.focus();
  search?.setSelectionRange(state.timetableQuery.length, state.timetableQuery.length);
}

function renderStations() {
  document.getElementById('admin-main').innerHTML = `<header class="view-header"><div><p class="view-kicker">Справочник</p><h1 class="view-title">Станции</h1><p class="view-subtitle">Общий каталог станций для маршрутов.</p></div></header><section class="glass-card station-add"><h2>Добавить станцию</h2><form data-form="add-station" class="station-add__form"><input name="name" required placeholder="Название станции"><input name="city" placeholder="Город"><input name="code" placeholder="Код, например MSK"><input name="platforms" type="number" min="0" placeholder="Платформы"><button class="button button--primary" type="submit">＋ Добавить</button></form></section><section class="station-grid">${state.stations.map((station) => `<article class="station-card glass-card"><form data-form="edit-station" data-id="${station.id}"><div class="station-card__head"><span>⌖</span><button type="button" class="icon-button icon-button--danger" data-action="delete-station" data-id="${station.id}" title="Удалить">⌫</button></div><label>Название<input name="name" value="${escapeHtml(station.name)}" required></label><div class="station-card__fields"><label>Город<input name="city" value="${escapeHtml(station.city || '')}"></label><label>Код<input name="code" value="${escapeHtml(station.code || '')}"></label></div><label>Платформы<input name="platforms" type="number" min="0" value="${escapeHtml(station.platforms || 0)}"></label><button class="button button--small" type="submit">Сохранить</button></form></article>`).join('')}</section>`;
}

function renderSettings() {
  const settings = state.settings;
  document.getElementById('admin-main').innerHTML = `<header class="view-header"><div><p class="view-kicker">Система</p><h1 class="view-title">Настройки</h1><p class="view-subtitle">Параметры локальной административной панели и публичной карточки.</p></div></header><form class="settings-layout" data-form="settings"><section class="editor-section glass-card"><h2>Основные</h2><div class="form-grid form-grid--two"><label class="form-field">Название сайта<input name="siteTitle" value="${escapeHtml(settings.siteTitle || '')}"></label><label class="form-field">Часовой пояс<select name="timezone"><option value="Europe/Moscow"${settings.timezone === 'Europe/Moscow' ? ' selected' : ''}>MSK (UTC+3)</option></select></label><label class="form-field">Цвет акцента<input name="accentColor" type="color" value="${escapeHtml(settings.accentColor || '#8A2BE2')}"></label><label class="form-field">Логотип / URL<input name="logo" type="url" value="${escapeHtml(settings.logo || '')}" placeholder="https://…"></label><label class="form-field form-field--wide">Фоновое изображение / URL<input name="background" type="url" value="${escapeHtml(settings.background || '')}" placeholder="https://…"></label></div><label class="check-field"><input name="animations" type="checkbox"${settings.animations ? ' checked' : ''}> Включить анимации и световые эффекты</label></section><section class="editor-actions glass-card"><h2>Данные</h2><button class="button button--primary button--wide" type="submit">▣ Сохранить настройки</button><button class="button button--wide" type="button" data-action="export-data">⇩ Экспортировать JSON</button><button class="button button--wide button--danger" type="button" data-action="reset-data">↺ Сбросить локальные изменения</button><p class="settings-note">Изменения сохраняются только в браузере. Для публикации на GitHub Pages экспортируйте JSON и замените файлы в <code>data/</code>.</p></section></form>`;
}

function render() {
  document.querySelectorAll('[data-view]').forEach((item) => item.classList.toggle('is-active', item.dataset.view === state.view));
  ({ dashboard: renderDashboard, trips: renderTrips, editor: renderTripEditor, timetable: renderTimetable, stations: renderStations, settings: renderSettings }[state.view] || renderDashboard)();
}

function saveDraft() {
  const required = ['title', 'departureDate', 'departureTime', 'arrivalDate', 'arrivalTime'];
  if (required.some((fieldName) => !state.draft[fieldName])) { showToast('Заполните обязательные поля поездки.'); return; }
  state.draft.updatedAt = new Date().toISOString();
  const existingIndex = state.trips.findIndex((trip) => trip.id === state.draft.id);
  if (existingIndex === -1) state.trips.push(clone(state.draft)); else state.trips[existingIndex] = clone(state.draft);
  saveData('trips', state.trips); state.view = 'trips'; render(); showToast('Поездка сохранена в локальном каталоге.');
}

function duplicateTrip(id) {
  const source = state.trips.find((trip) => trip.id === id);
  if (!source) return;
  const copy = clone(source); copy.id = newId('trip'); copy.title = `${copy.title} — копия`; copy.status = 'draft'; copy.createdAt = new Date().toISOString(); copy.updatedAt = copy.createdAt; copy.stops.forEach((stop) => { stop.id = newId('stop'); }); state.trips.push(copy); saveData('trips', state.trips); render(); showToast('Создана копия поездки.');
}

function deleteTrip(id) {
  const trip = state.trips.find((item) => item.id === id);
  if (!trip || !window.confirm(`Удалить «${trip.title}»?`)) return;
  state.trips = state.trips.filter((item) => item.id !== id); saveData('trips', state.trips); state.view = 'trips'; render(); showToast('Поездка удалена.');
}

function exportData() {
  const payload = { trips: state.trips, stations: state.stations, settings: state.settings, exportedAt: new Date().toISOString() };
  const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })); link.download = 'trainsite-data.json'; link.click(); URL.revokeObjectURL(link.href); showToast('JSON подготовлен для загрузки.');
}

function bindEvents() {
  document.getElementById('admin-nav').addEventListener('click', (event) => { const item = event.target.closest('[data-view]'); if (item) { state.view = item.dataset.view; render(); } });
  document.getElementById('admin-main').addEventListener('input', (event) => {
    const target = event.target;
    if (target.matches('[data-trip-search]')) { state.tripQuery = target.value; refreshTripsAfterSearch(); return; }
    if (target.matches('[data-timetable-search]')) { state.timetableQuery = target.value; state.timetablePage = 1; refreshTimetableAfterSearch(); return; }
    if (state.view !== 'editor') return;
    if (target.dataset.field) state.draft[target.dataset.field] = target.value;
    if (target.dataset.stopIndex !== undefined) { const stop = state.draft.stops[Number(target.dataset.stopIndex)]; stop[target.dataset.stopField] = target.type === 'number' ? Number(target.value) : target.value; }
    updatePreview();
  });
  document.getElementById('admin-main').addEventListener('change', (event) => {
    const target = event.target;
    if (target.matches('[data-timetable-status]')) { state.timetableStatus = target.value; state.timetablePage = 1; renderTimetable(); }
    if (target.matches('[data-timetable-sort]')) { state.timetableSort = target.value; state.timetablePage = 1; renderTimetable(); }
    if (state.view === 'editor' && target.dataset.field) { state.draft[target.dataset.field] = target.value; updatePreview(); }
  });
  document.getElementById('admin-main').addEventListener('submit', (event) => {
    event.preventDefault(); const form = event.target;
    if (form.id === 'trip-editor-form') { saveDraft(); return; }
    if (form.dataset.form === 'add-station') { const data = new FormData(form); const name = data.get('name').trim(); if (!name) return; state.stations.push({ id: newId('station'), name, city: data.get('city').trim(), code: data.get('code').trim().toUpperCase(), platforms: Number(data.get('platforms')) || 0 }); saveData('stations', state.stations); renderStations(); showToast('Станция добавлена.'); }
    if (form.dataset.form === 'edit-station') { const station = state.stations.find((item) => item.id === form.dataset.id); if (!station) return; const data = new FormData(form); Object.assign(station, { name: data.get('name').trim(), city: data.get('city').trim(), code: data.get('code').trim().toUpperCase(), platforms: Number(data.get('platforms')) || 0 }); saveData('stations', state.stations); showToast('Станция сохранена.'); }
    if (form.dataset.form === 'settings') { const data = new FormData(form); state.settings = { ...state.settings, siteTitle: data.get('siteTitle').trim(), timezone: data.get('timezone'), accentColor: data.get('accentColor'), logo: data.get('logo').trim(), background: data.get('background').trim(), animations: data.get('animations') === 'on' }; saveData('settings', state.settings); document.documentElement.style.setProperty('--admin-accent', state.settings.accentColor); showToast('Настройки сохранены.'); }
  });
  document.getElementById('admin-main').addEventListener('click', async (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action; if (!action) return;
    const id = event.target.closest('[data-id]')?.dataset.id; const index = Number(event.target.closest('[data-index]')?.dataset.index);
    if (action === 'create-trip') openEditor();
    if (action === 'edit-trip') openEditor(id);
    if (action === 'back-to-trips') { state.view = 'trips'; render(); }
    if (action === 'duplicate-trip') duplicateTrip(id);
    if (action === 'delete-trip') deleteTrip(id);
    if (action === 'duplicate-draft') { const source = clone(state.draft); source.id = newId('trip'); source.title = `${source.title} — копия`; source.status = 'draft'; source.stops.forEach((stop) => { stop.id = newId('stop'); }); state.draft = source; render(); showToast('Открыта копия рейса.'); }
    if (action === 'delete-draft') { if (state.trips.some((trip) => trip.id === state.draft.id)) deleteTrip(state.draft.id); else { state.view = 'trips'; render(); } }
    if (action === 'add-stop') { state.draft.stops.push({ id: newId('stop'), stationId: '', stationName: 'Новая станция', arrivalTime: '', departureTime: '', stopDuration: '', platform: '', track: '', delay: 0, notes: '' }); renderTripEditor(); updatePreview(); }
    if (action === 'remove-stop' && state.draft.stops.length > 2) { state.draft.stops.splice(index, 1); renderTripEditor(); updatePreview(); }
    if (action === 'next-page') { state.timetablePage += 1; renderTimetable(); }
    if (action === 'previous-page') { state.timetablePage -= 1; renderTimetable(); }
    if (action === 'delete-station') { const used = state.trips.some((trip) => trip.stops.some((stop) => stop.stationId === id)); if (used) { showToast('Станция используется в маршруте и не может быть удалена.'); return; } if (window.confirm('Удалить станцию из справочника?')) { state.stations = state.stations.filter((station) => station.id !== id); saveData('stations', state.stations); renderStations(); showToast('Станция удалена.'); } }
    if (action === 'export-data') exportData();
    if (action === 'reset-data' && window.confirm('Сбросить все локальные изменения?')) { Object.keys(DATA_FILES).forEach((key) => localStorage.removeItem(storageKey(key))); await loadData(); render(); showToast('Локальные данные сброшены.'); }
  });
  document.getElementById('admin-main').addEventListener('dragstart', (event) => { const row = event.target.closest('[data-stop-row]'); if (row) { state.dragIndex = Number(row.dataset.stopRow); if (event.dataTransfer) { event.dataTransfer.setData('text/plain', String(state.dragIndex)); event.dataTransfer.effectAllowed = 'move'; } row.classList.add('is-dragging'); } });
  document.getElementById('admin-main').addEventListener('dragover', (event) => { if (event.target.closest('[data-stop-row]')) event.preventDefault(); });
  document.getElementById('admin-main').addEventListener('drop', (event) => { const row = event.target.closest('[data-stop-row]'); if (!row || state.dragIndex === undefined) return; event.preventDefault(); const to = Number(row.dataset.stopRow); const [stop] = state.draft.stops.splice(state.dragIndex, 1); state.draft.stops.splice(to, 0, stop); state.dragIndex = undefined; renderTripEditor(); updatePreview(); });
  document.getElementById('admin-main').addEventListener('dragend', (event) => event.target.closest('[data-stop-row]')?.classList.remove('is-dragging'));
}

async function init() {
  updateClock();
  window.setInterval(updateClock, 30_000);
  bindEvents();
  try {
    await loadData();
    render();
  } catch (error) {
    console.error(error);
    document.getElementById('admin-main').innerHTML = '<section class="empty-state glass-card"><div class="empty-mark">!</div><h2>Данные не загружены</h2><p>Откройте проект через GitHub Pages или локальный веб-сервер.</p></section>';
  }
}

init();
