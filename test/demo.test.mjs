import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createDemoStore, SCENARIO_WEEK } from '../store.mjs';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');

test('client view cannot read other projects, alter agency work, KPI, or owner outbox', () => {
  const store = createDemoStore();
  store.setRole('klient');
  assert.deepEqual(store.getProjects().map(p => p.id), ['launch']);
  for (const operation of [
    () => store.getProject('content'), () => store.getTasks('content'),
    () => store.getKpis('content'), () => store.getComments('t7'),
    () => store.setTaskStatus('t7','Zrobione'), () => store.setTaskStatus('t3','Zrobione'),
    () => store.addComment('t7','Przykładowy komentarz',true),
    () => store.getOutbox(), () => store.simulateAssignment('t2'),
    () => store.incrementKpi('k1'), () => store.setRole('service_role')
  ]) assert.throws(operation);
  store.setTaskStatus('t2','Zrobione');
  assert.equal(store.getTasks('launch').find(t => t.id === 't2').status,'Zrobione');
  store.setRole('wlasciciel');
  assert.equal(store.getOutbox().length,0);
  assert.equal(store.getTasks('launch').find(t => t.id === 't3').status,'W trakcie');
  assert.equal(store.getTasks('content').find(t => t.id === 't7').status,'W trakcie');
});

test('comments and assignment events produce simulated messages with invalid recipients', () => {
  const store = createDemoStore();
  store.addComment('t2','Przykładowa akceptacja',false);
  assert.equal(store.getOutbox().length,0);
  store.setRole('klient');
  store.addComment('t2','  Przykładowa wzmianka  ',true);
  assert.equal(store.getComments('t2').at(-1).autor_id,'client-a');
  assert.equal(store.getComments('t2').at(-1).tresc,'Przykładowa wzmianka');
  store.setRole('wlasciciel');
  store.simulateAssignment('t3');
  const messages = store.getOutbox();
  assert.equal(messages.length,2);
  assert.deepEqual(new Set(messages.map(m=>m.powod)),new Set(['Przypisanie zadania','Wzmianka w komentarzu']));
  for (const message of messages) {
    assert.equal(message.odbiorca,'odbiorca@example.invalid');
    assert.equal(message.status,'Symulacja · niewysłane');
  }
});

test('invalid edits fail without partial writes and snapshots cannot mutate stored data', () => {
  const store = createDemoStore();
  const before = store.getComments('t2');
  for (const text of ['', '   ', 'x'.repeat(601), undefined, { text:'example' }]) {
    assert.throws(()=>store.addComment('t2',text,true));
  }
  assert.deepEqual(store.getComments('t2'),before);
  assert.equal(store.getOutbox().length,0);
  assert.throws(()=>store.setTaskStatus('t2','arbitrary-status'));
  const tasks = store.getTasks('launch');
  tasks[0].status = 'arbitrary-status';
  assert.equal(store.getTasks('launch')[0].status,'Zrobione');
  assert.throws(()=>store.incrementKpi('unknown-kpi'));
});

test('weekly KPI update is deterministic and reset clears all edited state', () => {
  const store = createDemoStore();
  assert.equal(SCENARIO_WEEK,'2026-10-26');
  store.incrementKpi('k1');
  assert.equal(store.getKpis('launch')[0].wartosc,3);
  store.setTaskStatus('t2','Zrobione');
  store.addComment('t2','Przykładowa zmiana do usunięcia',true);
  store.setRole('klient');
  store.reset();
  assert.equal(store.getRole(),'wlasciciel');
  assert.equal(store.getProjects().length,3);
  assert.equal(store.getTasks('launch').find(t=>t.id==='t2').status,'Do zrobienia');
  assert.equal(store.getKpis('launch')[0].wartosc,2);
  assert.equal(store.getComments('t2').length,1);
  assert.equal(store.getOutbox().length,0);
});

test('the renderer receives untrusted comment text as text, never as HTML', () => {
  const store = createDemoStore();
  const text = '<img src=x onerror=alert(1)>';
  store.addComment('t2',text);
  assert.equal(store.getComments('t2').at(-1).tresc,text);
  const script = read('app.mjs');
  assert.match(script,/element\('p',comment\.tresc\)/);
  assert.match(script,/node\.textContent = text/);
  assert.doesNotMatch(script,/(?:innerHTML|outerHTML|insertAdjacentHTML|eval)\b/);
});

test('demo asset graph is local, has no provider credentials and denies network connections', () => {
  const directory = new URL('./',root);
  const codeFiles = readdirSync(directory).filter(name=>/\.(?:html|mjs|css)$/.test(name));
  const html = read('index.html');
  assert.match(html,/connect-src 'none'/);
  assert.match(html,/form-action 'none'/);
  assert.match(html,/script-src 'self'/);
  assert.match(html,/DANE SYNTETYCZNE/);
  for (const reference of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    assert.ok(!/^(?:https?:|\/\/|data:|javascript:)/i.test(reference[1]),reference[1]);
  }
  for (const name of codeFiles) {
    const code = read(`${name}`);
    assert.doesNotMatch(code,/\b(?:fetch|WebSocket|EventSource|XMLHttpRequest|sendBeacon|importScripts)\s*\(/);
    assert.doesNotMatch(code,/\b(?:localStorage|sessionStorage|indexedDB)\b|document\.cookie/);
    assert.doesNotMatch(code,/\b(?:BREVO_API_KEY|SUPABASE_(?:URL|KEY|SECRET)|SERVICE_ROLE)\b|sb_secret_|xkeysib-/i);
    assert.doesNotMatch(code,/(?:innerHTML|outerHTML|insertAdjacentHTML|eval)\b/);
    assert.doesNotMatch(code,/(?:https?:\/\/|['"`]\/\/)/);
  }
  assert.match(read('app.mjs'),/node\.textContent = text/);
});
