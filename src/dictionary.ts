// 本地冻结词典：大写 ASCII。每个词典版本不可变；新增/修改词请新建版本。
const CORE_V1 = [
  'CAT', 'CATS', 'AT', 'AS', 'SAT', 'SCAT', 'ACT', 'ACTS', 'CAST', 'CASTS',
  'CAR', 'CARS', 'CART', 'CARTS', 'CARD', 'CARDS', 'SCAR', 'SCARS', 'SCAT',
  'ART', 'ARTS', 'RAT', 'RATS', 'STAR', 'STARS', 'TAR', 'TARS', 'TSAR',
  'DOG', 'DOGS', 'GOD', 'GO', 'DO', 'TO', 'SO', 'SI', 'IT', 'IS', 'IN', 'AN',
  'ON', 'NO', 'OR', 'OF', 'IF', 'AM', 'MA', 'PA', 'TA', 'A', 'I',
  'THE', 'HEN', 'TEN', 'NET', 'TON', 'NOT', 'ONE', 'TONE', 'STONE', 'TONES',
  'QUIZ', 'QUIT', 'QUITS', 'SUIT', 'SUITS', 'SIT', 'SITS', 'ITS',
  'HELLO', 'WORLD', 'WORD', 'WORDS', 'SWORD', 'LORD', 'LORDS',
  'PLAY', 'PLAYS', 'SPLAY', 'SPLAYS', 'LAY', 'LAYS', 'SAY', 'SAYS',
  'AA', 'AX', 'OX', 'XI', 'XU', 'ZA', 'QI',
  'BINGO', 'BINGOS', 'BINGOED', 'JACKPOT', 'JACKPOTS',
  'EXAMPLE', 'EXAMPLES', 'AMP', 'LAM', 'EXAM', 'EXAMS',
  'SCORE', 'SCORES', 'CORE', 'CORES', 'ORE', 'ORES', 'ROSE', 'ROSES',
  'TOE', 'TOES', 'TOW', 'TOWS', 'TWO', 'TWOS', 'OW', 'WO',
  'ME', 'MY', 'WE', 'HE', 'HI', 'OH', 'AH', 'EH', 'BE', 'BY',
  'COT', 'COTS', 'COAT', 'COATS', 'OAT', 'OATS', 'OAST',
  'EAT', 'EATS', 'TEA', 'TEAS', 'SEA', 'SEAS', 'SEAT', 'SEATS',
  'TEST', 'TESTS', 'SET', 'SETS', 'STET', 'TEN', 'TENS',
];

export interface Dictionary {
  name: string;
  words: ReadonlySet<string>;
}

const dictionaries: Record<string, Dictionary> = {
  'core-v1': { name: 'core-v1', words: new Set(CORE_V1.map((w) => w.toUpperCase())) },
};

export function getDictionary(name: string): Dictionary | null {
  return dictionaries[name] ?? null;
}

export function listDictionaries(): string[] {
  return Object.keys(dictionaries);
}

export const DEFAULT_DICTIONARY = 'core-v1';
