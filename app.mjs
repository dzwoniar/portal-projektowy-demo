import { createDemoStore, SCENARIO_DATE, STATUSES } from './store.mjs';

const store = createDemoStore();
const $ = id => document.getElementById(id);
let selectedProject = store.getProjects()[0].id;
let selectedTask = 't2';
let noticeTimer;
const element = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
const date = value => new Intl.DateTimeFormat('pl', { day:'2-digit', month:'2-digit', timeZone:'UTC' }).format(new Date(`${value}T12:00:00Z`));
function notify(message) {
  $('notice').textContent = message;
  $('notice').hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { $('notice').hidden = true; }, 4500);
}
function action(fn, success) {
  try { fn(); render(); if (success) notify(success); }
  catch (error) { notify(error.message); }
}
function renderProjects() {
  const list = $('project-list');
  list.replaceChildren();
  const projects = store.getProjects();
  $('project-count').textContent = projects.length;
  for (const [index, project] of projects.entries()) {
    const button = element('button', undefined, 'project-link');
    button.type = 'button';
    button.setAttribute('aria-current', project.id === selectedProject ? 'page' : 'false');
    button.append(element('span', String(index + 1).padStart(2,'0'), 'project-number'), element('span', project.nazwa));
    button.addEventListener('click', () => { selectedProject = project.id; selectedTask = ''; render(); });
    list.append(button);
  }
  const owner = store.getRole() === 'wlasciciel';
  $('role-note').textContent = owner ? 'Przegląd pracy zespołu, celów i powiadomień.' : 'Jeden projekt. Edycja statusu zadań po stronie klienta.';
}
function renderStats(tasks) {
  const done = tasks.filter(t => t.status === 'Zrobione').length;
  const blocked = tasks.filter(t => t.status === 'Zablokowane').length;
  const overdue = tasks.filter(t => t.status !== 'Zrobione' && t.termin < SCENARIO_DATE).length;
  $('stats').replaceChildren();
  for (const [value, label, hint, style] of [
    [`${done}/${tasks.length}`,'Zamknięte zadania',`${Math.round(done/tasks.length*100)}% planu`, ''],
    [tasks.filter(t=>t.status!=='Zrobione' && t.strona==='Klient').length,'Po stronie klienta','Kolejne kroki do wykonania',''],
    [blocked,'Wymaga odblokowania',`${overdue} po terminie w scenariuszu`,blocked ? 'warning' : '']
  ]) {
    const card = element('div', undefined, `stat ${style}`);
    card.append(element('span',label,'stat-label'),element('strong',String(value)),element('span',hint,'muted'));
    $('stats').append(card);
  }
}
function renderTasks(tasks) {
  $('tasks').replaceChildren();
  $('tasks-count').textContent = `${tasks.length} zadań`;
  const owner = store.getRole() === 'wlasciciel';
  for (const task of tasks) {
    const row = element('article', undefined, `task ${task.status === 'Zrobione' ? 'is-done' : ''}`);
    const header = element('div', undefined, 'task-main');
    const body = element('div');
    body.append(element('h4', task.nazwa));
    const meta = element('p', undefined, 'task-meta');
    meta.append(element('span', task.strona, `side-tag ${task.strona === 'Klient' ? 'client' : ''}`), element('span', `Do ${date(task.termin)}`));
    if (task.status !== 'Zrobione' && task.termin < SCENARIO_DATE) meta.append(element('span','Po terminie','overdue'));
    body.append(meta);
    const select = element('select');
    select.setAttribute('aria-label', `Status: ${task.nazwa}`);
    for (const status of STATUSES) { const option = element('option', status); option.value = status; select.append(option); }
    select.value = task.status;
    select.disabled = !owner && task.strona !== 'Klient';
    select.title = select.disabled ? 'Ta część pracy należy do zespołu.' : 'Zmień status lokalnego zadania.';
    select.addEventListener('change', () => action(() => store.setTaskStatus(task.id,select.value),'Zapisano w pamięci demo.'));
    header.append(body,select);
    row.append(header);
    const actions = element('div',undefined,'task-actions');
    const commentButton = element('button',`Komentarze · ${store.getComments(task.id).length}`,'text-button');
    commentButton.type = 'button';
    commentButton.addEventListener('click',() => { selectedTask = task.id; renderComments(tasks); $('comment-text').focus(); });
    actions.append(commentButton);
    if (owner) {
      const simulate = element('button','Symuluj przypisanie','text-button');
      simulate.type = 'button';
      simulate.addEventListener('click',() => action(() => store.simulateAssignment(task.id),'Powstał lokalny wpis w outboxie. Nic nie wysłano.'));
      actions.append(simulate);
    }
    row.append(actions);
    $('tasks').append(row);
  }
}
function renderKpis() {
  $('kpis').replaceChildren();
  for (const metric of store.getKpis(selectedProject)) {
    const card = element('div',undefined,'metric');
    card.append(element('h4',metric.nazwa));
    const result = element('div',undefined,'metric-value');
    result.append(element('strong',String(metric.wartosc)),element('span',`/ ${metric.cel} w tym tygodniu`,'muted'));
    card.append(result);
    const progress = element('progress');
    progress.max = Math.max(metric.cel,1); progress.value = metric.wartosc;
    progress.setAttribute('aria-label',metric.nazwa);
    card.append(progress);
    const button = element('button','+1 gotowy materiał','button quiet');
    if (selectedProject === 'onboarding') button.textContent = '+1 zamknięty krok';
    button.type = 'button'; button.disabled = store.getRole() !== 'wlasciciel';
    button.addEventListener('click',() => action(() => store.incrementKpi(metric.id),'Zaktualizowano licznik bieżącego tygodnia.'));
    card.append(button,element('p','Jeden zapis na KPI i tydzień. W oryginale: RPC kpi_plus.','field-help'));
    $('kpis').append(card);
  }
}
function renderComments(tasks) {
  if (!tasks.some(t => t.id === selectedTask)) selectedTask = tasks[0].id;
  const select = $('comment-task');
  select.replaceChildren();
  for (const task of tasks) { const option = element('option',task.nazwa); option.value = task.id; select.append(option); }
  select.value = selectedTask;
  const profiles = store.getProfiles();
  $('comments').replaceChildren();
  const comments = store.getComments(selectedTask);
  for (const comment of comments) {
    const card = element('div',undefined,'comment');
    card.append(element('strong',profiles.find(p=>p.id===comment.autor_id)?.imie || 'Osoba demo'),element('p',comment.tresc));
    $('comments').append(card);
  }
  if (!comments.length) $('comments').append(element('p','Tu zaczyna się rozmowa o tym zadaniu.','empty'));
}
function renderOutbox() {
  const owner = store.getRole() === 'wlasciciel';
  $('outbox-section').hidden = !owner;
  $('outbox').replaceChildren();
  if (!owner) return;
  const messages = store.getOutbox();
  if (!messages.length) $('outbox').append(element('p','Outbox jest pusty. Dodaj komentarz z powiadomieniem albo zasymuluj przypisanie zadania.','empty'));
  for (const message of messages) {
    const row = element('div',undefined,'outbox-row');
    const text = element('div');
    text.append(element('strong',message.temat),element('p',message.odbiorca,'muted'));
    row.append(text,element('span',message.status,'simulation-pill'));
    $('outbox').append(row);
  }
}
function render() {
  const projects = store.getProjects();
  if (!projects.some(p=>p.id===selectedProject)) { selectedProject = projects[0].id; selectedTask = ''; }
  const project = store.getProject(selectedProject);
  $('project-name').textContent = project.nazwa;
  $('project-description').textContent = project.opis;
  $('client-name').textContent = store.getProfiles().find(p=>p.id===project.klient_id)?.imie || 'Projekt demonstracyjny';
  const tasks = store.getTasks(selectedProject);
  renderProjects(); renderStats(tasks); renderTasks(tasks); renderKpis(); renderComments(tasks); renderOutbox();
}
$('role').addEventListener('change',() => action(() => store.setRole($('role').value),'Zmieniono perspektywę demonstracyjną.'));
$('reset').addEventListener('click',() => action(() => {
  store.reset(); selectedProject = store.getProjects()[0].id; selectedTask = 't2';
  $('role').value = 'wlasciciel'; $('comment-form').reset();
},'Przywrócono dane przykładowe i wyczyszczono lokalny outbox.'));
$('comment-task').addEventListener('change',() => { selectedTask = $('comment-task').value; renderComments(store.getTasks(selectedProject)); });
$('comment-form').addEventListener('submit',event => {
  event.preventDefault();
  action(() => { store.addComment(selectedTask,$('comment-text').value,$('notify').checked); $('comment-text').value = ''; },'Dodano komentarz. Powiadomienia pozostają wyłącznie w lokalnym outboxie.');
});
render();
