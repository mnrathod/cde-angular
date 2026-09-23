/**
 * Chapter 10: the security posture, including the two framing decisions that
 * the embed surface depends on.
 */
const B = require('../build.js');
const { p, lead, h1, h2, h3, bullet, code, note, table, caption,
        diagramBoundary, diagramIngress, diagramIdentity,
        titleBlock, makeDoc, section, Packer, Paragraph, TextRun,
        TableOfContents, PageBreak, HeadingLevel, AlignmentType, fs,
        TEAL, RED, GRAPHITE, HEAD_BG, TEAL_BG, RED_BG } = B;

module.exports = [
  h1('10.  Security posture'),
  p('Most of §5 is inherited from the platform and documented there — RLS tenant isolation, the '
  + 'hash-chained audit trail, PBKDF2 password storage, the §5.4 response headers. What the '
  + '**viewer product** must own itself once distributed is the question this table answers.'),
  table([2700, 3400, 3646], [
    { header: true, cells: [{ t: 'Control' }, { t: 'Where it lives now' }, { t: 'Where it must live' }] },
    { cells: [{ t: 'SSRF policy on the ingress' }, { t: 'Platform fetch/ package' },
              { t: 'Travels with the product — it is the product’s own attack surface' }] },
    { cells: [{ t: 'Upload magic-byte + AV' }, { t: 'Platform' }, { t: 'Travels' }] },
    { cells: [{ t: 'Content Security Policy' }, { t: 'Platform response headers; frame-ancestors is an allow-list on the embed route, \'none\' everywhere else' },
              { t: 'Travels with the product. Deployment-level today; per-tenant needs a discriminator the request cannot forge' }] },
    { cells: [{ t: 'Tenant isolation' }, { t: 'Platform RLS' },
              { t: 'Does NOT travel. The host owns tenancy; the viewer must not assume it', fill: RED_BG }] },
    { cells: [{ t: 'Audit' }, { t: 'Platform hash chain' },
              { t: 'Host’s concern; the viewer emits events, it does not store them', fill: RED_BG }] }
  ]),
  caption('Table 5 — What travels with the product and what does not.'),
  p('The last two rows matter most in the long run: a distributed viewer that assumes it owns '
  + 'tenancy would be wrong in a way that is expensive to unwind. **The third row is what matters '
  + 'this week.**'),

  h2('10.1  frame-ancestors, and what it did and did not unblock'),
  p('**Done.** `cde.web.embed-parent-origins` names the host origins permitted to frame the '
  + '`/embed` route. Every other route keeps `\'none\'`, and a test fails if a relaxation lands '
  + 'globally rather than on that route. `X-Frame-Options` is now written per route rather than '
  + 'globally — it has no allow-list form, so on the embed route it could only say `SAMEORIGIN` '
  + 'and a browser honouring it would refuse the frame however the CSP reads.'),
  p('**Closed by default.** An empty list yields `frame-ancestors \'none\'` — the same policy, '
  + 'byte for byte, that every other route gets. Adding the route does not on its own make '
  + 'anything framable, which is what made the change safe to merge before anyone had decided '
  + 'which customers may embed.'),
  note('**This is a security change, not a configuration change.** `frame-ancestors` is the '
     + 'authorisation decision about who may frame the viewer; `parentOrigin` in the handshake is '
     + 'only addressing — it says where to post, not who is allowed. Confusing the two would '
     + 'produce a viewer that any site could frame as long as it sent the right message.'),
  p('Values are validated at startup, because **a `frame-ancestors` source a browser cannot parse '
  + 'is not a closed door** — the browser drops the unparseable source and applies what is left, '
  + 'so a typo silently widens the policy instead of breaking visibly. Wildcards, the `null` '
  + 'origin, CSP keywords offered as origins, anything carrying a path, and non-http schemes are '
  + 'all refused by name.'),
  p('**Deployment-level, not per-tenant, and that limit is deliberate.** The embed route carries '
  + 'no credential by design, so there is no authenticated principal to derive a tenant from; '
  + 'deriving one from a query parameter or a header would let a caller nominate its own '
  + 'allow-list, which is a wildcard with extra steps. For the viewer as ADR 12 sells it — a '
  + 'product a customer installs — one deployment is one customer, and that is the boundary this '
  + 'draws. Narrowing further needs a discriminator the request cannot forge.'),
  p('Where a deployment puts the Angular build behind a separate web tier, that tier serves the '
  + 'document and must carry the same header — the backend’s copy governs only what the backend '
  + 'answers. The supported way to avoid that split is 10.2.'),

  h2('10.2  Serving the embed document from the image'),
  p('The allow-list was necessary and not sufficient: until recently nothing in the deployment '
  + 'served `/embed` at all, because the image carried no frontend while `k8s/ingress.yaml` '
  + 'routed every page request to it. ADR 15 closed that. `cde.web.app.path` points the image at '
  + 'a staged Angular build, and the same component then emits both the document and the policy '
  + 'that governs it.'),
  p('**Empty by default.** An image with nothing staged serves no pages and answers page routes '
  + 'with 404 — the behaviour before ADR 15, and the right one where a web tier serves the '
  + 'build. The bundle is staged into the backend’s build context before the image is built, '
  + 'because the Angular sources live in a sibling repository a Docker context cannot reach.'),
  note('**The document cannot be a static file.** §5.4 forbids `style-src \'unsafe-inline\'`, and '
     + 'a production build carries inlined critical CSS, module scripts and a small script that '
     + 'promotes the deferred stylesheet — all of which need a nonce matching the header on the '
     + 'same response. So the document is rendered per request, with `Cache-Control: no-store`, '
     + 'and the build stamps a placeholder the server substitutes. Splitting the document from '
     + 'its header across two components is what this design exists to avoid.'),
  p('**Verified by running the demo host against it, end to end.** The full journey works: the '
  + 'document opens, three pages render, markup is drawn and stored by the host, the host page '
  + 'is reloaded and the markup is handed back and painted, `goToPage` and `setZoom` drive the '
  + 'viewer, and a capability that was not granted does not render its control. No content '
  + 'blocked, no console errors.'),
  note('**That run found six defects that every unit test had passed over.** A policy refusing '
     + 'the build\u2019s own stylesheet-promoting script, so the main stylesheet never applied. '
     + '`/embed` failing dependency injection before rendering anything. A pdf.js worker URL that '
     + 'had never resolved on any deployment. A `connect-src` with no way to name an '
     + 'integrator\u2019s storage. A service worker serving the entry document from cache, which '
     + 'defeats a per-request nonce by construction. And markup that never rendered in either '
     + 'direction, because the overlay bound `[innerHTML]` to SVG and Angular\u2019s sanitiser '
     + 'strips it \u2014 while every protocol message stayed correct, so the host\u2019s log '
     + 'looked perfect and the page was blank. **Run the demo against a served viewer before '
     + 'believing an integration works.**'),
];
