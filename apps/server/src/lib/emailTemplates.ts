// ---------------------------------------------------------------------------
// Email templates — PURE. No provider, no env, no I/O.
//
// Every message the platform sends is built here and handed to `send()` in
// ./email.ts. Kept apart from delivery so a template can be rendered (to preview
// it, or to test it) without importing a mail client or reading a single secret.
//
// THE DESIGN is the Stable Press masthead at letter scale: a forest-green band
// with the name set in spaced capitals between gold rules, a cream card framed
// like a print plate, a small-caps kicker over a serif headline, and facts set as
// a ruled ledger rather than run into a sentence.
//
// THE CONSTRAINTS are email's, and they decide almost every line below:
//   - TABLES for layout and INLINE styles for everything. Gmail strips <style>
//     from some clients and every client ignores flex/grid; Outlook on Windows
//     renders with Word, which understands tables, bgcolor and borders, and
//     little else.
//   - NO IMAGES. Most clients block remote images until the reader opts in, so
//     an image logo arrives as a broken box on the first open — the one that
//     matters. The masthead is type, and type always loads.
//   - THE BUTTON IS "BULLETPROOF": a padded <a> inside a coloured cell, plus a
//     VML roundrect for Outlook, which ignores padding on links.
//   - Web fonts are a bonus, never a dependency: Playfair Display loads in Apple
//     Mail and iOS; everyone else gets Georgia, which the stacks name next.
//     Outlook would otherwise fall back to Times, so it is pinned to Georgia in a
//     conditional block.
//   - The card is 560px and fluid below that, via one media query (supported by
//     Gmail, Apple Mail, iOS and Outlook.com) and `width:100%` defaults that
//     degrade sensibly where the query is ignored.
// ---------------------------------------------------------------------------

export interface RenderedEmail {
  subject: string
  text: string
  html: string
}

// ── Palette — the site's brand tokens (apps/web/src/styles/brand.css) ───────

const FOREST = '#1a3322' // --forest-deep
const FOREST_MID = '#234432' // --forest-mid
const GOLD = '#d4a843' // --gold-bright — rules and fills
const GOLD_INK = '#7d5a1c' // --brand-accent-ink — gold as TEXT on cream (6:1)
const PARCHMENT = '#f5edda' // --parchment
const PAPER = '#fffdf7' // card stock
const PAGE_BG = '#efe6d2' // the "desk" the card lies on
const FRAME = '#d9cba8' // outer plate edge
const FRAME_IN = '#ebe1c9' // inner plate edge
const INK = '#1f2b24' // body text
const INK_SOFT = '#4a5a50' // supporting text
const INK_FAINT = '#7d7a6e' // footnotes
const RULE = '#e4d9c0' // ledger hairlines

const SERIF = "'Playfair Display', Georgia, 'Times New Roman', serif"
const BODY = "Georgia, 'Times New Roman', serif"
const SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif"
const MONO = "'SFMono-Regular', Menlo, Consolas, 'Courier New', monospace"

/** Escape untrusted text before it goes into an HTML template. */
export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ── Building blocks ─────────────────────────────────────────────────────────

/** A paragraph of body copy. `html` is trusted markup — escape before passing. */
function para(html: string, opts: { size?: number; color?: string; margin?: string } = {}): string {
  const { size = 16, color = INK_SOFT, margin = '0 0 20px' } = opts
  return `<p style="margin:${margin};font-family:${BODY};font-size:${size}px;line-height:1.65;color:${color};">${html}</p>`
}

/** Bold, ink-coloured emphasis for a name, a role, a title. Escapes for you. */
function strong(s: string): string {
  return `<strong style="color:${INK};font-weight:bold;">${esc(s)}</strong>`
}

/** A magazine title in curly quotes, italic — the way a masthead cites a title. */
function title(s: string): string {
  return `<em style="color:${INK};font-style:italic;">&ldquo;${esc(s)}&rdquo;</em>`
}

/**
 * Bulletproof call-to-action. The <a> carries the padding so the whole button is
 * the link in every client that honours it; the VML block draws the same button
 * for Outlook on Windows, which does not.
 */
function button(href: string, label: string): string {
  const h = esc(href)
  const l = esc(label)
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 28px;">
    <tr>
      <td>
        <!--[if mso]>
        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${h}" style="height:50px;v-text-anchor:middle;width:260px;" arcsize="8%" strokecolor="${GOLD}" strokeweight="1px" fillcolor="${FOREST}">
          <w:anchorlock/>
          <center style="color:${PARCHMENT};font-family:Georgia,serif;font-size:15px;font-weight:bold;letter-spacing:1px;">${l} &rarr;</center>
        </v:roundrect>
        <![endif]-->
        <!--[if !mso]><!-- -->
        <a href="${h}" target="_blank" style="display:inline-block;background-color:${FOREST};border:1px solid ${GOLD};border-radius:4px;color:${PARCHMENT};font-family:${SANS};font-size:14px;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase;text-decoration:none;padding:16px 30px;mso-hide:all;">${l}&nbsp;&nbsp;<span style="color:${GOLD};">&rarr;</span></a>
        <!--<![endif]-->
      </td>
    </tr>
  </table>`
}

/** "Or paste this link" — for clients that strip the button, and for the wary. */
function linkFallback(href: string): string {
  return `
  <p style="margin:0;font-family:${SANS};font-size:12px;line-height:1.6;color:${INK_FAINT};">
    Button not working? Paste this link into your browser:<br>
    <a href="${esc(href)}" target="_blank" style="color:${GOLD_INK};text-decoration:underline;word-break:break-all;">${esc(href)}</a>
  </p>`
}

/**
 * Facts as a ruled ledger — label left in small caps, value right in ink. Reads at
 * a glance where the same facts run into a sentence do not. Values are escaped.
 */
function ledger(rows: Array<[label: string, value: string]>): string {
  const body = rows
    .map(
      ([k, v], i) => `
    <tr>
      <td style="padding:11px 0;${i > 0 ? `border-top:1px dotted ${FRAME};` : ''}font-family:${SANS};font-size:11px;font-weight:bold;letter-spacing:1.6px;text-transform:uppercase;color:${GOLD_INK};white-space:nowrap;vertical-align:middle;" width="38%">${esc(k)}</td>
      <td style="padding:11px 0;${i > 0 ? `border-top:1px dotted ${FRAME};` : ''}font-family:${BODY};font-size:15px;line-height:1.45;color:${INK};text-align:right;vertical-align:middle;">${esc(v)}</td>
    </tr>`,
    )
    .join('')
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 26px;border-top:2px solid ${FOREST};border-bottom:2px solid ${FOREST};">
    ${body}
  </table>`
}

/**
 * A person's note, set as a pull quote: gold rule, a hanging serif quote mark,
 * italic. It must read as THEIR words, not ours.
 */
function quote(note: string, by?: string): string {
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px;">
    <tr>
      <td width="3" style="background-color:${GOLD};font-size:0;line-height:0;">&nbsp;</td>
      <td style="background-color:${PARCHMENT};padding:16px 20px 16px 18px;">
        <div style="font-family:${SERIF};font-size:34px;line-height:20px;color:${GOLD};height:18px;">&ldquo;</div>
        <div style="font-family:${BODY};font-size:15px;line-height:1.65;font-style:italic;color:${INK};white-space:pre-wrap;">${esc(note)}</div>
        ${by ? `<div style="margin-top:10px;font-family:${SANS};font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:${GOLD_INK};">&mdash; ${esc(by)}</div>` : ''}
      </td>
    </tr>
  </table>`
}

/**
 * The OTP, set like a printed ticket: a dashed gold frame on parchment, the code
 * in a monospace face (old-style serif figures dip below the line, and a code is
 * the one place every digit must read identically). ONE text run, not a cell per
 * digit, so copy-paste yields the code and not a row of tab-separated digits.
 */
function codeTicket(code: string): string {
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 26px;">
    <tr>
      <td align="center" style="background-color:${PARCHMENT};border:2px dashed ${GOLD};border-radius:6px;padding:22px 12px 20px;">
        <div style="font-family:${SANS};font-size:10px;font-weight:bold;letter-spacing:3px;text-transform:uppercase;color:${GOLD_INK};margin-bottom:10px;">Your one-time code</div>
        <div class="sp-code" style="font-family:${MONO};font-size:38px;font-weight:bold;letter-spacing:12px;color:${FOREST};line-height:1.1;padding-left:12px;">${esc(code)}</div>
      </td>
    </tr>
  </table>`
}

/** Small note at the foot of the body, under a hairline. */
function footnote(html: string): string {
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;">
    <tr><td style="border-top:1px solid ${RULE};padding-top:18px;font-family:${SANS};font-size:12px;line-height:1.6;color:${INK_FAINT};">${html}</td></tr>
  </table>`
}

// ── The frame ───────────────────────────────────────────────────────────────

interface LayoutOpts {
  /** Small-caps kicker over the headline, e.g. "Invitation". */
  kicker: string
  /** Headline. TRUSTED markup — escape any user text before passing. */
  heading: string
  /** Body. TRUSTED markup. */
  body: string
  /** Footnote under the body. TRUSTED markup. */
  footer?: string
  /**
   * Inbox preview line (the grey text after the subject). Plain text. Without
   * it, clients show the first words they find — which is the masthead.
   */
  preheader: string
}

function layout(o: LayoutOpts): string {
  // Zero-width filler after the preheader stops clients pulling body text in
  // behind it.
  const filler = '&#847;&zwnj;&nbsp;'.repeat(60)
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>Stable Press</title>
<!--[if mso]>
<noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
<style>h1,.sp-serif{font-family:Georgia,serif !important;}</style>
<![endif]-->
<!--[if !mso]><!-->
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,700;1,600&display=swap" rel="stylesheet">
<!--<![endif]-->
<style>
  body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
  table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;}
  body{margin:0 !important;padding:0 !important;width:100% !important;}
  a[x-apple-data-detectors]{color:inherit !important;text-decoration:none !important;}
  @media screen and (max-width:600px){
    .sp-card{width:100% !important;}
    .sp-outer{padding:16px 10px !important;}
    .sp-pad{padding:30px 22px 26px !important;}
    .sp-mast{padding:26px 18px 22px !important;}
    .sp-h1{font-size:25px !important;line-height:1.25 !important;}
    .sp-name{font-size:19px !important;letter-spacing:5px !important;}
    .sp-code{font-size:30px !important;letter-spacing:8px !important;padding-left:8px !important;}
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${PAGE_BG};">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${esc(o.preheader)}${filler}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAGE_BG}" style="background-color:${PAGE_BG};">
  <tr>
    <td class="sp-outer" align="center" style="padding:36px 16px;">
      <!--[if mso]><table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <table role="presentation" class="sp-card" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px;max-width:560px;">

        <!-- Plate: an outer edge, a cream mat, an inner edge — a framed print. -->
        <tr>
          <td style="background-color:${PAPER};border:1px solid ${FRAME};padding:7px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${FRAME_IN};">

              <!-- Masthead -->
              <tr>
                <td class="sp-mast" align="center" bgcolor="${FOREST}" style="background-color:${FOREST};padding:30px 24px 24px;">
                  <div style="font-family:${SERIF};font-size:13px;line-height:1;color:${GOLD};letter-spacing:8px;">&#10022;&nbsp;&#10022;&nbsp;&#10022;</div>
                  <div class="sp-name sp-serif" style="margin-top:12px;font-family:${SERIF};font-size:24px;font-weight:700;line-height:1.2;letter-spacing:7px;text-transform:uppercase;color:${PARCHMENT};">Stable&nbsp;Press</div>
                  <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:12px auto 0;">
                    <tr>
                      <td width="34" style="border-top:1px solid ${GOLD};font-size:0;line-height:0;">&nbsp;</td>
                      <td style="padding:0 10px;font-family:${SANS};font-size:10px;font-weight:bold;letter-spacing:3px;text-transform:uppercase;color:${GOLD};white-space:nowrap;">The Newsroom</td>
                      <td width="34" style="border-top:1px solid ${GOLD};font-size:0;line-height:0;">&nbsp;</td>
                    </tr>
                  </table>
                </td>
              </tr>
              <!-- Double rule under the masthead: gold, a sliver of green, gold. -->
              <tr><td height="3" bgcolor="${GOLD}" style="background-color:${GOLD};font-size:0;line-height:0;height:3px;">&nbsp;</td></tr>
              <tr><td height="2" bgcolor="${FOREST_MID}" style="background-color:${FOREST_MID};font-size:0;line-height:0;height:2px;">&nbsp;</td></tr>
              <tr><td height="1" bgcolor="${GOLD}" style="background-color:${GOLD};font-size:0;line-height:0;height:1px;">&nbsp;</td></tr>

              <!-- Body -->
              <tr>
                <td class="sp-pad" bgcolor="${PAPER}" style="background-color:${PAPER};padding:40px 44px 34px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px;">
                    <tr>
                      <td width="22" style="border-top:2px solid ${GOLD};font-size:0;line-height:0;">&nbsp;</td>
                      <td style="padding-left:10px;font-family:${SANS};font-size:11px;font-weight:bold;letter-spacing:2.6px;text-transform:uppercase;color:${GOLD_INK};white-space:nowrap;">${esc(o.kicker)}</td>
                    </tr>
                  </table>
                  <h1 class="sp-h1 sp-serif" style="margin:0 0 20px;font-family:${SERIF};font-size:29px;font-weight:700;line-height:1.22;color:${FOREST};">${o.heading}</h1>
                  ${o.body}
                  ${o.footer ? footnote(o.footer) : ''}
                </td>
              </tr>

              <!-- Colophon -->
              <tr>
                <td align="center" bgcolor="${PARCHMENT}" style="background-color:${PARCHMENT};border-top:1px solid ${FRAME_IN};padding:16px 24px;font-family:${SANS};font-size:11px;line-height:1.6;letter-spacing:0.4px;color:${INK_FAINT};">
                  <span style="color:${GOLD_INK};">&#10022;</span>&nbsp;&nbsp;Sent by the Stable Press newsroom&nbsp;&nbsp;<span style="color:${GOLD_INK};">&#10022;</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td align="center" style="padding:18px 12px 0;font-family:${SANS};font-size:11px;line-height:1.6;color:${INK_FAINT};">
            This is an automated message &mdash; replies to it are not monitored.
          </td>
        </tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td>
  </tr>
</table>
</body>
</html>`
}

// ── OTP ─────────────────────────────────────────────────────────────────────

export function otpEmail(code: string): RenderedEmail {
  return {
    subject: 'Your Stable Press verification code',
    text: `Your Stable Press verification code is ${code}. It expires shortly and can only be used once.`,
    html: layout({
      kicker: 'Sign-in',
      heading: 'Your verification code',
      preheader: `${code} is your Stable Press code. It expires shortly.`,
      body:
        para('Enter this code to continue signing in to Stable Press.') +
        codeTicket(code) +
        para('It expires shortly and can only be used once. Never share it &mdash; nobody from Stable Press will ever ask you for it.', {
          size: 14,
          margin: '0',
        }),
      footer: "If you didn't request this, you can safely ignore this email &mdash; no one can sign in without the code.",
    }),
  }
}

// ── Team invite ─────────────────────────────────────────────────────────────

export interface InviteEmail {
  to: string
  /** Role label as shown in the UI, e.g. "Editor". */
  roleLabel: string
  /** Who sent it — display name or email. */
  invitedBy: string
  /** Absolute accept URL carrying the one-time token. */
  acceptUrl: string
  /** Human expiry, e.g. "14 days". */
  expiresIn: string
}

export function inviteEmail(invite: InviteEmail): RenderedEmail {
  const { roleLabel, invitedBy, acceptUrl, expiresIn } = invite
  return {
    subject: `${invitedBy} invited you to Stable Press`,
    text:
      `${invitedBy} has invited you to join Stable Press as ${roleLabel}.\n\n` +
      `Open this link and you're in — no password, no code to type: ${acceptUrl}\n\n` +
      `This link expires in ${expiresIn} and can only be used once.`,
    html: layout({
      kicker: 'Invitation',
      heading: `You&rsquo;re invited to join the newsroom`,
      preheader: `${invitedBy} invited you to Stable Press as ${roleLabel}.`,
      body:
        para(
          `${strong(invitedBy)} has invited you to join the Stable Press newsroom. Open the link below and you&rsquo;re in &mdash; no password to set and no code to type.`,
        ) +
        ledger([
          ['Your role', roleLabel],
          ['Invited by', invitedBy],
          ['Link expires', `in ${expiresIn}`],
        ]) +
        button(acceptUrl, 'Accept invitation') +
        linkFallback(acceptUrl),
      footer: `This invitation can only be used once. If you weren&rsquo;t expecting it, you can safely ignore this email.`,
    }),
  }
}

// ── Role granted (existing account) ─────────────────────────────────────────

export function roleGrantedEmail(opts: { roleLabel: string; invitedBy: string; newsroomUrl: string }): RenderedEmail {
  const { roleLabel, invitedBy, newsroomUrl } = opts
  return {
    subject: `You've been given the ${roleLabel} role on Stable Press`,
    text: `${invitedBy} has given you the ${roleLabel} role on Stable Press.\n\n` + `Open the newsroom: ${newsroomUrl}`,
    html: layout({
      kicker: 'Access granted',
      heading: `You&rsquo;re now ${esc(roleLabel)}`,
      preheader: `${invitedBy} gave you the ${roleLabel} role on Stable Press.`,
      body:
        para(
          `${strong(invitedBy)} has given you a new role in the Stable Press newsroom. It is active now &mdash; sign in with your existing account to use it.`,
        ) +
        ledger([
          ['Your role', roleLabel],
          ['Granted by', invitedBy],
          ['Status', 'Active now'],
        ]) +
        button(newsroomUrl, 'Open the newsroom') +
        linkFallback(newsroomUrl),
      footer: 'If this looks wrong, contact whoever administers your newsroom.',
    }),
  }
}

// ── Magazine share ──────────────────────────────────────────────────────────

export function magazineShareEmail(opts: {
  magazineTitle: string
  sharedBy: string
  magazineUrl: string
  /** 'all' or a count of specific pages, already phrased for a human. */
  scope: string
}): RenderedEmail {
  const { magazineTitle, sharedBy, magazineUrl, scope } = opts
  return {
    subject: `${sharedBy} shared "${magazineTitle}" with you`,
    text:
      `${sharedBy} has shared the magazine "${magazineTitle}" with you on Stable Press.\n\n` +
      `${scope}\n\nOpen it: ${magazineUrl}`,
    html: layout({
      kicker: 'Shared with you',
      heading: 'A magazine is waiting for you',
      preheader: `${sharedBy} shared “${magazineTitle}” with you.`,
      body:
        para(`${strong(sharedBy)} shared ${title(magazineTitle)} with you on Stable Press.`) +
        ledger([
          ['Magazine', magazineTitle],
          ['Shared by', sharedBy],
        ]) +
        para(esc(scope), { size: 14 }) +
        button(magazineUrl, 'Open the magazine') +
        linkFallback(magazineUrl),
      footer: "You'll be asked to sign in first if you aren't already.",
    }),
  }
}

// ── Magazine submissions & review ───────────────────────────────────────────
//
// Three notifications around the per-page review flow. The state change is
// ALREADY committed when these are sent, so they report rather than gate, and
// they NAME the pages ("pages 4, 5 and 6") instead of counting them.

/** To the OWNER: a collaborator has sent pages for review. */
export function magazineSubmittedEmail(opts: {
  magazineTitle: string
  submittedBy: string
  magazineUrl: string
  /** Already phrased, e.g. "pages 4, 5 and 6". */
  pages: string
  note?: string
}): RenderedEmail {
  const { magazineTitle, submittedBy, magazineUrl, pages, note } = opts
  return {
    subject: `${submittedBy} submitted ${pages} of "${magazineTitle}" for review`,
    text:
      `${submittedBy} has submitted ${pages} of "${magazineTitle}" for your review.\n\n` +
      (note ? `Their note:\n${note}\n\n` : '') +
      `Review it: ${magazineUrl}`,
    html: layout({
      kicker: 'For your review',
      heading: 'Pages are waiting for your review',
      preheader: `${submittedBy} submitted ${pages} of “${magazineTitle}”.`,
      body:
        para(`${strong(submittedBy)} has submitted work on ${title(magazineTitle)} for you to look over.`) +
        ledger([
          ['Pages', pages],
          ['Submitted by', submittedBy],
        ]) +
        (note ? quote(note, submittedBy) : '') +
        button(magazineUrl, 'Review the pages'),
      footer: 'You are getting this because you own this magazine.',
    }),
  }
}

/** To the COLLABORATOR: the owner has approved, or sent pages back. */
export function magazineReviewedEmail(opts: {
  magazineTitle: string
  reviewedBy: string
  magazineUrl: string
  pages: string
  decision: 'approved' | 'changes-requested'
  note?: string
}): RenderedEmail {
  const { magazineTitle, reviewedBy, magazineUrl, pages, decision, note } = opts
  const approved = decision === 'approved'
  const headline = approved ? `${reviewedBy} approved ${pages}` : `${reviewedBy} asked for changes to ${pages}`
  return {
    subject: `${headline} of "${magazineTitle}"`,
    text:
      `${headline} of "${magazineTitle}".\n\n` +
      (note ? `Their note:\n${note}\n\n` : '') +
      (approved
        ? 'No further action is needed from you.\n\n'
        : 'Those pages are editable again, so you can make the changes and resubmit.\n\n') +
      `Open it: ${magazineUrl}`,
    html: layout({
      kicker: approved ? 'Approved' : 'Changes requested',
      heading: approved ? 'Your pages were approved' : 'A few changes, please',
      preheader: `${headline} of “${magazineTitle}”.`,
      body:
        para(
          `${strong(reviewedBy)} ${approved ? 'approved' : 'asked for changes to'} your work on ${title(magazineTitle)}.`,
        ) +
        ledger([
          ['Pages', pages],
          ['Decision', approved ? 'Approved' : 'Changes requested'],
          ['Reviewed by', reviewedBy],
        ]) +
        (note ? quote(note, reviewedBy) : '') +
        para(
          approved
            ? 'Nothing more is needed from you &mdash; the owner will publish when the whole issue is ready.'
            : 'Those pages are editable again, so you can make the changes and submit them once more.',
          { size: 14 },
        ) +
        button(magazineUrl, approved ? 'Open the magazine' : 'Make the changes'),
      footer: 'You are getting this because these pages are shared with you.',
    }),
  }
}

/**
 * To the COLLABORATOR: a page they had submitted was deleted by the owner. Sent
 * because the alternative is silence — their work simply vanishes.
 */
export function magazinePageRemovedEmail(opts: {
  magazineTitle: string
  removedBy: string
  magazineUrl: string
  pages: string
}): RenderedEmail {
  const { magazineTitle, removedBy, magazineUrl, pages } = opts
  return {
    subject: `${removedBy} removed ${pages} of "${magazineTitle}"`,
    text:
      `${removedBy} removed ${pages} of "${magazineTitle}" — a page you had submitted for review.\n\n` +
      `It is no longer part of the magazine, so there is nothing waiting on you.\n\n` +
      `Open the magazine: ${magazineUrl}`,
    html: layout({
      kicker: 'Page removed',
      heading: 'A page you submitted was removed',
      preheader: `${removedBy} removed ${pages} of “${magazineTitle}”.`,
      body:
        para(`${strong(removedBy)} removed a page you had submitted for review from ${title(magazineTitle)}.`) +
        ledger([
          ['Pages', pages],
          ['Removed by', removedBy],
        ]) +
        para(
          'It is no longer part of the magazine, so nothing is waiting on you. If that looks like a mistake, talk to whoever owns the magazine.',
          { size: 14 },
        ) +
        button(magazineUrl, 'Open the magazine'),
      footer: 'You are getting this because the page was shared with you.',
    }),
  }
}
