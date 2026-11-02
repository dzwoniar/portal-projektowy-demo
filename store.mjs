// Presentation adapter for the table/role contracts in sql/01_baza.sql and 02_rls.sql.
// Every record below is invented. Nothing is persisted or sent outside this process.
export const SCENARIO_DATE = '2026-10-28';
export const SCENARIO_WEEK = '2026-10-26';
export const STATUSES = Object.freeze(['Do zrobienia', 'W trakcie', 'Zrobione', 'Zablokowane']);
const clone = value => structuredClone(value);
const seed = {
  profiles: [
    { id: 'owner', imie: 'Właściciel demo', rola: 'wlasciciel' },
    { id: 'team', imie: 'Opiekun demo', rola: 'zespol' },
    { id: 'client-a', imie: 'Klient demo A', rola: 'klient' },
    { id: 'client-b', imie: 'Klient demo B', rola: 'klient' },
    { id: 'client-c', imie: 'Klient demo C', rola: 'klient' }
  ],
  projekty: [
    { id: 'launch', nazwa: 'Premiera kursu', klient_id: 'client-a', opis: 'Od briefu do publikacji. Jasny podział odpowiedzialności między zespołem a klientem.', ukryte: false },
    { id: 'content', nazwa: 'Biblioteka treści', klient_id: 'client-b', opis: 'Stały rytm produkcji materiałów i tygodniowe cele publikacji.', ukryte: false },
    { id: 'onboarding', nazwa: 'Start współpracy', klient_id: 'client-c', opis: 'Powtarzalny onboarding: zasoby, dostępy i akceptacja kierunku.', ukryte: false }
  ],
  zadania: [
    ['t1','launch','Przygotować brief kampanii','Zrobione','Agencja','2026-10-26','team'],
    ['t2','launch','Zaakceptować propozycję scenariusza','Do zrobienia','Klient','2026-10-28','client-a'],
    ['t3','launch','Zmontować materiał do premiery','W trakcie','Agencja','2026-10-30','team'],
    ['t4','launch','Dostarczyć brakujące ujęcie produktu','Zablokowane','Klient','2026-10-27','client-a'],
    ['t5','launch','Opublikować stronę zapisów','Do zrobienia','Agencja','2026-11-02','owner'],
    ['t6','content','Ułożyć kalendarz publikacji','Zrobione','Agencja','2026-10-26','team'],
    ['t7','content','Nagrać kolejne krótkie materiały','W trakcie','Klient','2026-10-29','client-b'],
    ['t8','content','Przygotować opisy publikacji','Do zrobienia','Agencja','2026-10-30','team'],
    ['t9','onboarding','Uzgodnić cel współpracy','Zrobione','Agencja','2026-10-26','owner'],
    ['t10','onboarding','Uzupełnić ankietę startową','Do zrobienia','Klient','2026-10-29','client-c'],
    ['t11','onboarding','Przygotować szablon zadań','W trakcie','Agencja','2026-10-30','team']
  ].map(([id,projekt_id,nazwa,status,strona,termin,odpowiedzialny_id], i) => ({ id,projekt_id,nazwa,status,strona,termin,odpowiedzialny_id,kolejnosc:i*10,ukryte:false })),
  kpi: [
    { id:'k1', projekt_id:'launch', nazwa:'Materiały gotowe do publikacji', rodzaj:'rolki', okres:'tydzien', cel:4, ukryte:false },
    { id:'k2', projekt_id:'content', nazwa:'Opublikowane materiały', rodzaj:'rolki', okres:'tydzien', cel:5, ukryte:false },
    { id:'k3', projekt_id:'onboarding', nazwa:'Zamknięte kroki onboardingu', rodzaj:'inny', okres:'tydzien', cel:3, ukryte:false }
  ],
  kpi_tygodnie: [
    { kpi_id:'k1', tydzien:SCENARIO_WEEK, wartosc:2, zrodlo:'reka' },
    { kpi_id:'k2', tydzien:SCENARIO_WEEK, wartosc:4, zrodlo:'reka' },
    { kpi_id:'k3', tydzien:SCENARIO_WEEK, wartosc:1, zrodlo:'reka' }
  ],
  komentarze: [{ id:'c1', zadanie_id:'t2', autor_id:'team', tresc:'To przykładowa rozmowa: po akceptacji możemy przejść do montażu.', created_at:'2026-10-28T09:00:00Z' }],
  outbox: []
};

export function createDemoStore() {
  let state = clone(seed);
  let role = 'wlasciciel';
  let sequence = 0;
  const clientId = 'client-a';
  const identity = () => role === 'klient' ? clientId : 'owner';
  const projects = () => state.projekty.filter(p => !p.ukryte && (role !== 'klient' || p.klient_id === clientId));
  const project = id => {
    const result = projects().find(p => p.id === id);
    if (!result) throw new Error('Ten projekt jest poza wybranym widokiem demonstracyjnym.');
    return result;
  };
  const task = id => {
    const result = state.zadania.find(t => t.id === id && !t.ukryte);
    if (!result) throw new Error('Nie znaleziono zadania.');
    project(result.projekt_id);
    return result;
  };
  const ownerOnly = () => {
    if (role !== 'wlasciciel') throw new Error('Ta czynność jest dostępna w widoku właściciela.');
  };
  const queue = (record, reason) => {
    state.outbox.unshift({ id:`mail-${++sequence}`, zadanie_id:record.id, projekt_id:record.projekt_id, powod:reason,
      temat:`${reason}: ${record.nazwa}`, odbiorca:'odbiorca@example.invalid', status:'Symulacja · niewysłane' });
  };
  return {
    getRole: () => role,
    setRole(value) {
      if (!['wlasciciel','klient'].includes(value)) throw new Error('Nieznany widok.');
      role = value;
    },
    getProjects: () => clone(projects()),
    getProject(id) { return clone(project(id)); },
    getProfiles: () => clone(state.profiles.filter(p => role !== 'klient' || ['owner','team',clientId].includes(p.id))),
    getTasks(id) { project(id); return clone(state.zadania.filter(t => t.projekt_id === id && !t.ukryte)); },
    getKpis(id) {
      project(id);
      return clone(state.kpi.filter(k => k.projekt_id === id && !k.ukryte).map(k => ({ ...k,
        wartosc: state.kpi_tygodnie.find(t => t.kpi_id === k.id && t.tydzien === SCENARIO_WEEK)?.wartosc || 0
      })));
    },
    getComments(id) { task(id); return clone(state.komentarze.filter(c => c.zadanie_id === id)); },
    getOutbox() { ownerOnly(); return clone(state.outbox); },
    setTaskStatus(id, status) {
      const record = task(id);
      if (role === 'klient' && record.strona !== 'Klient') throw new Error('Klient zmienia status wyłącznie własnej części pracy.');
      if (!STATUSES.includes(status)) throw new Error('Nieznany status zadania.');
      record.status = status;
    },
    addComment(id, text, notify = false) {
      const record = task(id);
      if (typeof text !== 'string' || !text.trim() || text.trim().length > 600) throw new Error('Wpisz od 1 do 600 znaków.');
      state.komentarze.push({ id:`comment-${++sequence}`, zadanie_id:id, autor_id:identity(), tresc:text.trim(), created_at:`${SCENARIO_DATE}T10:00:00Z` });
      if (notify) queue(record, 'Wzmianka w komentarzu');
    },
    incrementKpi(id) {
      ownerOnly();
      const metric = state.kpi.find(k => k.id === id && !k.ukryte);
      if (!metric) throw new Error('Nie znaleziono KPI.');
      project(metric.projekt_id);
      const week = state.kpi_tygodnie.find(t => t.kpi_id === id && t.tydzien === SCENARIO_WEEK);
      if (!week || week.wartosc >= 1000) throw new Error('Osiągnięto limit demonstracji.');
      week.wartosc += 1;
    },
    simulateAssignment(id) {
      ownerOnly();
      queue(task(id), 'Przypisanie zadania');
    },
    reset() { state = clone(seed); role = 'wlasciciel'; sequence = 0; }
  };
}
