/* Unit tests for the pure functions in site/index.html (no browser needed). */
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'site', 'index.html'), 'utf8');
const m = /\/\*PURE-START\*\/([\s\S]*?)\/\*PURE-END\*\//.exec(html);
if (!m) { console.error('PURE block not found'); process.exit(1); }
const api = new Function(m[1] + '\nreturn { expandButtons, parseReply, parseIntent, BTN };')();

let failures = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log((ok ? '  PASS ' : '  FAIL ') + name + (ok ? '' : '  got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)));
}

// buttons
eq('expand repeat', api.expandButtons(['UP x3', 'a']), ['UP', 'UP', 'UP', 'A']);
eq('expand drops junk', api.expandButtons(['FLY', 'up', '???']), ['UP']);
eq('expand default cap', api.expandButtons(Array(30).fill('UP')).length, 16);
eq('expand caps exactly', api.expandButtons(Array(30).fill('UP'), 16).length, 16);

// model replies
eq('reply json', api.parseReply('{"say":"hi","buttons":["LEFT","A"]}'), { say: 'hi', buttons: ['LEFT', 'A'] });
eq('reply in code fence', api.parseReply('```json\n{"say":"x","buttons":["UP"]}\n```'), { say: 'x', buttons: ['UP'] });
eq('reply legacy act', api.parseReply('{"say":"ok","act":"left","steps":2}'), { say: 'ok', buttons: ['LEFT', 'LEFT'] });
eq('reply buttons string', api.parseReply('{"say":"","buttons":"UP, UP A"}'), { say: '', buttons: ['UP', 'UP', 'A'] });
eq('reply plain text', api.parseReply('hello there'), { say: 'hello there', buttons: [] });
eq('reply broken json', api.parseReply('{"say": oops}').buttons, []);

// local brain
eq('go left', api.parseIntent('go left').buttons, ['LEFT']);
eq('3 steps right', api.parseIntent('walk right 3 steps').buttons, ['RIGHT', 'RIGHT', 'RIGHT']);
eq('"know" is not "no"', api.parseIntent('I know you').buttons, ['A']);
eq('"what\'s up" walks up', api.parseIntent("what's up").buttons, ['UP']);
eq('wait stays', api.parseIntent('please wait').buttons, []);
eq('menu', api.parseIntent('open the menu').buttons, ['START']);

console.log('\n' + (failures ? failures + ' FAILURE(S)' : 'all pure checks passed'));
process.exit(failures ? 1 : 0);
