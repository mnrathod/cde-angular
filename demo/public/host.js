/**
 * The demo host's page wiring.
 *
 * The protocol itself is in `host-protocol.js` and has no DOM in it; this file
 * is the DOM and holds no protocol rules. Keeping them apart is what lets the
 * protocol half be tested against the real viewer channel with no browser
 * (`src/app/features/embed/protocol-conversation.spec.ts`).
 *
 * Read `host-protocol.js` first if you are here to learn the integration.
 * Everything in this file is one way of building a UI over it, and none of it
 * is required — §9's minimum integration is four steps and does not include
 * anything below.
 */
import { ViewerHost, MarkupStore, decideOperation } from './host-protocol.js';

/**
 * Where the viewer is served — a different origin from this page, deliberately.
 *
 * Taken from the server rather than hardcoded, because the server uses the
 * same value for `Access-Control-Allow-Origin` on the document fetch. When
 * those two disagree the frame loads and the document silently fails to, which
 * reads like a protocol fault and is not one.
 */
const VIEWER_ORIGIN = await fetch('/config.json')
  .then((response) => response.json())
  .then((config) => config.viewerOrigin)
  .catch(() => 'http://localhost:4200');

/**
 * The documents this host is willing to show, and the URL it mints for each.
 *
 * In a real host the URL is short-lived and signed. Here it is a plain path on
 * the host's own origin, because minting a credential the demo would then have
 * to protect adds nothing to what the demo is showing.
 */
const DOCUMENTS = [
  {
    externalId: 'demo-doc-drawing',
    displayName: 'sample-drawing.pdf',
    mediaType: 'application/pdf',
    path: '/files/sample-drawing.pdf',
    note: 'Renders in the browser. Three sheets, a text layer, and a scale bar.',
  },
  {
    externalId: 'demo-doc-specification',
    displayName: 'sample-specification.docx',
    mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    path: '/files/sample-specification.docx',
    note: 'Needs the conversion service. Shows the viewer.error path when it is absent.',
  },
  {
    externalId: 'demo-doc-model',
    displayName: 'sample-model.ifc',
    mediaType: 'application/x-step',
    path: '/files/sample-model.ifc',
    note: 'Needs the conversion service, for the same reason.',
  },
];

const elements = {
  frame: document.getElementById('viewer-frame'),
  placeholder: document.getElementById('frame-placeholder'),
  documents: document.getElementById('documents'),
  log: document.getElementById('log'),
  markupRows: document.getElementById('markup-rows'),
  displayName: document.getElementById('display-name'),
  capabilityCreate: document.getElementById('cap-create'),
  capabilityDelete: document.getElementById('cap-delete'),
  capabilitySign: document.getElementById('cap-sign'),
};

const store = new MarkupStore(globalThis.localStorage ?? null);
/** @type {import('./host-protocol.js').ViewerHost | null} */
let host = null;
let openDocument = DOCUMENTS[0];

function currentSession() {
  const capabilities = [];
  if (elements.capabilityCreate.checked) capabilities.push('markup:create');
  if (elements.capabilityDelete.checked) capabilities.push('markup:delete');
  if (elements.capabilitySign.checked) capabilities.push('document:sign');
  return {
    displayName: elements.displayName.value.trim() || 'Unattributed',
    subjectId: 'demo-user-1',
    capabilities,
  };
}

function documentDescriptor(entry) {
  return {
    url: new URL(entry.path, location.origin).toString(),
    mediaType: entry.mediaType,
    displayName: entry.displayName,
    externalId: entry.externalId,
  };
}

// ── The log ─────────────────────────────────────────────────────────────────

function appendLog({ direction, message }) {
  const line = document.createElement('p');
  line.className = `entry ${direction}`;

  const arrow = document.createElement('span');
  arrow.className = 'arrow';
  // The arrow is decorative; the direction is also in the text, because
  // colour and glyph alone would carry the meaning (§1A.2).
  arrow.setAttribute('aria-hidden', 'true');
  arrow.textContent = direction === 'out' ? '→' : '←';

  const label = document.createElement('span');
  label.className = 'type';
  label.textContent = `${direction === 'out' ? 'host sent' : 'viewer sent'} ${message.type}`;

  line.append(arrow, label);

  const detail = summarise(message);
  if (detail) {
    const summary = document.createElement('span');
    summary.className = 'detail';
    summary.textContent = detail;
    line.append(summary);
  }

  elements.log.append(line);
  elements.log.scrollTop = elements.log.scrollHeight;
}

/** A short, human summary. Never the whole payload — logs are read, not parsed. */
function summarise(message) {
  const payload = message.payload ?? {};
  if (message.type === 'viewer.loaded') return `${payload.pageCount} pages`;
  if (message.type === 'viewer.error') return payload.problem?.title ?? '';
  if (message.type === 'viewer.viewChanged') return `page ${payload.page}`;
  if (message.type === 'viewer.operationRequest') return payload.operation ?? '';
  if (message.type === 'host.operationResult') return payload.status ?? '';
  if (message.type === 'host.command') return payload.command ?? '';
  if (message.type?.startsWith('viewer.markup')) {
    return payload.markup ? `page ${payload.markup.page}` : (payload.markupId ?? '');
  }
  return '';
}

// ── Markup ──────────────────────────────────────────────────────────────────

function renderMarkupTable() {
  const stored = store.list(openDocument.externalId);
  elements.markupRows.replaceChildren();

  if (!stored.length) {
    const row = document.createElement('tr');
    row.className = 'empty';
    const cell = document.createElement('td');
    cell.colSpan = 5;
    cell.textContent = 'Nothing yet. Draw on the document.';
    row.append(cell);
    elements.markupRows.append(row);
    return;
  }

  for (const markup of stored) {
    const row = document.createElement('tr');
    for (const value of [markup.page, markup.type, markup.comment || '—', markup.author]) {
      const cell = document.createElement('td');
      cell.textContent = String(value);
      row.append(cell);
    }

    const actionCell = document.createElement('td');
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'button small';
    remove.textContent = 'Forget';
    // Named for the row it acts on, so it is not one of many "Forget" buttons
    // to a screen reader (§1A.2).
    remove.setAttribute(
      'aria-label',
      `Forget ${markup.type} on page ${markup.page}`,
    );
    remove.addEventListener('click', () => {
      store.remove(openDocument.externalId, markup.markupId);
      renderMarkupTable();
    });
    actionCell.append(remove);
    row.append(actionCell);

    elements.markupRows.append(row);
  }
}

// ── The session ─────────────────────────────────────────────────────────────

function load(entry) {
  openDocument = entry;
  host?.close();
  elements.placeholder.hidden = true;

  const frameUrl = new URL('/embed', VIEWER_ORIGIN);
  // §2: addressing, not authorisation. The viewer decides who may frame it
  // with frame-ancestors; this only tells it who to talk to.
  frameUrl.searchParams.set('parentOrigin', location.origin);
  elements.frame.src = frameUrl.toString();

  host = new ViewerHost({
    // Read at delivery time, not captured now: assigning `src` navigates the
    // frame, and the window that then sends `viewer.ready` is not the one
    // `contentWindow` referred to a moment ago. Capturing it made every
    // inbound message fail rule 3 and the demo sat silent.
    frame: () => elements.frame.contentWindow,
    viewerOrigin: VIEWER_ORIGIN,
    self: window,
    onTraffic: appendLog,
  });

  // §9, step 3: this is the only handler an integration must have.
  host.on('viewer.ready', () => {
    host.send('host.init', {
      document: documentDescriptor(entry),
      identity: currentSession(),
      ui: { locale: 'en-AU', theme: 'light' },
    });
  });

  host.on('viewer.loaded', () => {
    host.send('host.loadMarkup', { markup: store.list(entry.externalId) });
  });

  host.on('viewer.markupCreated', (message) => {
    // The author is stamped here, from the host's own session. The message
    // does not carry one and would not be believed if it did (§6.2).
    store.upsert(entry.externalId, message.payload.markup, currentSession().displayName);
    renderMarkupTable();
  });

  host.on('viewer.markupUpdated', (message) => {
    store.upsert(entry.externalId, message.payload.markup, currentSession().displayName);
    renderMarkupTable();
  });

  host.on('viewer.markupDeleted', (message) => {
    store.remove(entry.externalId, message.payload.markupId);
    renderMarkupTable();
  });

  host.on('viewer.operationRequest', (message) => {
    const outcome = decideOperation(message.payload.operation, currentSession());
    host.send('host.operationResult', outcome, message.id);
  });

  renderMarkupTable();
}

// ── Wiring ──────────────────────────────────────────────────────────────────

function renderDocumentList() {
  for (const entry of DOCUMENTS) {
    const item = document.createElement('li');

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button document';
    button.textContent = entry.displayName;
    button.addEventListener('click', () => load(entry));

    const note = document.createElement('span');
    note.className = 'hint';
    note.textContent = entry.note;

    item.append(button, note);
    elements.documents.append(item);
  }
}

document.getElementById('apply-identity').addEventListener('click', () => {
  host?.send('host.setIdentity', { identity: currentSession() });
});

document.getElementById('send-anonymous').addEventListener('click', () => {
  host?.send('host.setIdentity', { identity: {} });
});

document.getElementById('reload-markup').addEventListener('click', () => {
  host?.send('host.loadMarkup', { markup: store.list(openDocument.externalId) });
});

for (const button of document.querySelectorAll('[data-command]')) {
  button.addEventListener('click', () => {
    const command = button.dataset.command;
    const args = command === 'goToPage' ? { page: Number(button.dataset.page) }
      : command === 'setZoom' ? { zoom: Number(button.dataset.zoom) }
      : { query: button.dataset.query };
    host?.send('host.command', { command, arguments: args });
  });
}

renderDocumentList();
renderMarkupTable();
