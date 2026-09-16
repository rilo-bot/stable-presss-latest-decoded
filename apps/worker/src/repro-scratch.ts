import { renderBulletinPdf } from '../../server/src/lib/pdf.js';
renderBulletinPdf('http://127.0.0.1:9/nothing', '', undefined, false)
  .then(() => console.log('RESULT: rendered (unexpected)'))
  .catch((e) => console.log('RESULT ERROR:', String(e && e.message).slice(0, 160)));
