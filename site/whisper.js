/* WHISPER — the player is a voice, not a body.
 * Turns a message into an intent the pilot obeys for a while. Without an API
 * this is keyword matching; with one, the same interface carries real language.
 */
(function (root) {
  'use strict';

  const RULES = [
    { intent: 'attack',  words: ['attack', 'strike', 'hit', 'fight', 'kill', 'go', 'push', 'aggressive'] },
    { intent: 'hold',    words: ['wait', 'stop', 'hold', 'stay', 'careful', 'slow', 'no'] },
    { intent: 'catch',   words: ['catch', 'take', 'capture', 'mine', 'keep', 'friend'] },
    { intent: 'retreat', words: ['run', 'flee', 'back', 'away', 'escape', 'hide'] },
    { intent: 'heal',    words: ['heal', 'rest', 'breath', 'recover', 'mend'] },
    { intent: 'bless',   words: ['arceus', 'god', 'bless', 'light', 'guide', 'believe'] }
  ];

  const ACK = {
    attack:  ['As you say.', 'Then I go.', 'Yes. Forward.', 'I hear you.'],
    hold:    ['I will wait.', 'As you wish.', 'Holding.', 'You are right. Patience.'],
    catch:   ['Mine, then.', 'I will take it.', 'It comes with us.', 'Understood.'],
    retreat: ['Falling back.', 'Not today.', 'I hear you.', 'Away, then.'],
    heal:    ['A moment.', 'Let me breathe.', 'As you say.', 'Yes.'],
    bless:   ['...Arceus?', 'I felt that.', 'You are still there.', 'Then I am not alone.'],
    none:    ['...', 'Speak plainly.', 'What?', 'I do not understand.']
  };

  function parse(text) {
    const s = String(text || '').toLowerCase();
    for (const rule of RULES) {
      for (const w of rule.words) {
        if (s.indexOf(w) >= 0) return rule.intent;
      }
    }
    return 'none';
  }

  function ack(intent) {
    const list = ACK[intent] || ACK.none;
    return list[Math.floor(Math.random() * list.length)];
  }

  const api = { parse, ack, RULES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.WHISPER = api;
})(typeof window !== 'undefined' ? window : globalThis);
