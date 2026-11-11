// ============================================================================
//  SUPERLEAGUE FOOTBALL — league data
//  Attributes are 0..99: [pace, shooting, passing, dribbling, defending, physical]
// ============================================================================

const P = (num, name, role, a, skin, hair, h = 182) => ({
  num, name, role,
  pace: a[0], shoot: a[1], pass: a[2], dribble: a[3], def: a[4], phys: a[5],
  skin, hair, height: h,
});

// role weights for overall rating
const W = {
  GK:  [0.10, 0.02, 0.13, 0.10, 0.50, 0.15],
  CB:  [0.14, 0.03, 0.12, 0.08, 0.42, 0.21],
  LB:  [0.24, 0.06, 0.19, 0.16, 0.25, 0.10],
  RB:  [0.24, 0.06, 0.19, 0.16, 0.25, 0.10],
  CDM: [0.12, 0.09, 0.24, 0.14, 0.28, 0.13],
  CM:  [0.14, 0.14, 0.29, 0.20, 0.13, 0.10],
  CAM: [0.16, 0.22, 0.27, 0.26, 0.04, 0.05],
  LW:  [0.29, 0.22, 0.16, 0.28, 0.02, 0.03],
  RW:  [0.29, 0.22, 0.16, 0.28, 0.02, 0.03],
  ST:  [0.23, 0.34, 0.10, 0.20, 0.02, 0.11],
};
export function overall(p) {
  const w = W[p.role] || W.CM;
  return Math.round(p.pace * w[0] + p.shoot * w[1] + p.pass * w[2] + p.dribble * w[3] + p.def * w[4] + p.phys * w[5]);
}

export const SKIN = [0xf0c9a4, 0xe0b184, 0xc98d5e, 0xa06a3c, 0x7a4a26, 0x543018, 0xf6d5b8];
export const HAIRC = [0x120e0a, 0x241708, 0x3d2412, 0x5c3a1c, 0x8a6a3a, 0x0b0b0b, 0xb9a07a];
// hair style ids: 0 crop, 1 fade, 2 curls, 3 afro, 4 long, 5 bald, 6 bun, 7 mohawk
export const HAIRS = ['crop', 'fade', 'curls', 'afro', 'long', 'bald', 'bun', 'mohawk'];

export const TEAMS = [
  {
    id: 'solar', name: 'Solar FC', short: 'SOL', city: 'Ember City', crest: 'phoenix',
    kit: { shirt: 0xff5a1f, shirt2: 0x14100c, shorts: 0x14100c, socks: 0xff5a1f, trim: 0xffd23f },
    away: { shirt: 0xf2f4f8, shirt2: 0xff5a1f, shorts: 0xf2f4f8, socks: 0xf2f4f8, trim: 0xff5a1f },
    gk: { shirt: 0x1fd6a0, shirt2: 0x0c2b24, shorts: 0x0c2b24, socks: 0x1fd6a0, trim: 0xffffff },
    pattern: 'sash', formation: '4-3-3', style: 'High press', css: '#ff5a1f', css2: '#ffd23f',
    players: [
      P(1, 'R. Vale', 'GK', [58, 32, 72, 55, 88, 86], 2, 0, 190),
      P(2, 'T. Marchetti', 'RB', [84, 55, 76, 74, 79, 74], 0, 1, 178),
      P(4, 'D. Okafor', 'CB', [70, 40, 68, 60, 90, 91], 5, 5, 191),
      P(5, 'M. Halvorsen', 'CB', [66, 38, 71, 58, 88, 89], 0, 4, 189),
      P(3, 'J. Okoye', 'LB', [86, 52, 75, 77, 77, 72], 4, 2, 176),
      P(6, 'S. Ibarra', 'CDM', [70, 62, 84, 74, 84, 84], 1, 0, 183),
      P(8, 'T. Silva', 'CM', [76, 74, 89, 85, 68, 74], 3, 2, 177),
      P(10, 'L. Moreau', 'CAM', [82, 82, 90, 92, 45, 66], 1, 3, 174),
      P(7, 'K. Asano', 'RW', [94, 78, 79, 90, 40, 64], 2, 1, 172),
      P(9, 'A. Reyes', 'ST', [85, 94, 72, 84, 38, 86], 3, 0, 185),
      P(11, 'C. Mensah', 'LW', [93, 82, 76, 89, 38, 68], 5, 3, 179),
      P(13, 'P. Nkemdi', 'GK', [55, 28, 66, 50, 82, 82], 5, 5, 188),
      P(14, 'E. Duarte', 'CM', [74, 70, 84, 80, 66, 72], 1, 1, 180),
      P(17, 'J. Park', 'RW', [90, 74, 74, 85, 42, 62], 2, 6, 175),
      P(19, 'B. Osei', 'ST', [83, 86, 68, 79, 36, 84], 5, 2, 187),
      P(23, 'N. Ferrante', 'CB', [64, 36, 66, 55, 83, 85], 0, 0, 188),
    ],
  },
  {
    id: 'volt', name: 'Volt United', short: 'VLT', city: 'Neon Harbor', crest: 'bolt',
    kit: { shirt: 0x1f8fff, shirt2: 0x061226, shorts: 0x061226, socks: 0x1f8fff, trim: 0x35f2ff },
    away: { shirt: 0x0b1220, shirt2: 0x35f2ff, shorts: 0x0b1220, socks: 0x0b1220, trim: 0x35f2ff },
    gk: { shirt: 0xffd84d, shirt2: 0x2b2408, shorts: 0x2b2408, socks: 0xffd84d, trim: 0x111111 },
    pattern: 'halves', formation: '4-2-3-1', style: 'Fast counters', css: '#1f8fff', css2: '#35f2ff',
    players: [
      P(1, 'S. Ito', 'GK', [60, 30, 74, 58, 89, 85], 2, 1, 188),
      P(2, 'A. Whitlock', 'RB', [82, 50, 74, 72, 80, 76], 0, 0, 180),
      P(3, 'B. Traoré', 'CB', [74, 38, 66, 58, 91, 90], 5, 5, 190),
      P(4, 'O. Lind', 'CB', [65, 36, 70, 56, 89, 88], 0, 4, 192),
      P(3, 'M. Bello', 'LB', [85, 54, 77, 76, 78, 71], 4, 2, 177),
      P(6, 'F. Diallo', 'CDM', [72, 64, 85, 76, 85, 83], 4, 1, 184),
      P(8, 'H. Kovač', 'CDM', [70, 66, 86, 75, 82, 82], 0, 0, 182),
      P(7, 'N. Volkov', 'RW', [96, 76, 78, 88, 38, 66], 1, 1, 176),
      P(10, 'E. Costa', 'CAM', [84, 80, 92, 93, 44, 64], 1, 3, 173),
      P(11, 'Y. Tanaka', 'LW', [92, 79, 78, 90, 40, 62], 2, 6, 171),
      P(9, 'M. Kovač', 'ST', [84, 93, 74, 83, 40, 88], 0, 0, 188),
      P(22, 'D. Rusu', 'GK', [56, 26, 68, 52, 83, 84], 0, 1, 189),
      P(15, 'K. Adeyemi', 'CB', [72, 34, 64, 54, 85, 87], 5, 2, 190),
      P(16, 'L. Bianchi', 'CM', [75, 72, 86, 82, 68, 73], 0, 3, 179),
      P(18, 'P. Novak', 'RW', [89, 75, 75, 86, 40, 64], 1, 0, 175),
      P(20, 'G. Rossi', 'ST', [82, 87, 70, 80, 36, 82], 0, 1, 183),
    ],
  },
  {
    id: 'verdant', name: 'Verdant SC', short: 'VRD', city: 'Canopy', crest: 'leaf',
    kit: { shirt: 0x1f9d4d, shirt2: 0xf4f7f2, shorts: 0xf4f7f2, socks: 0x1f9d4d, trim: 0xb6ff3d },
    away: { shirt: 0x2b2f36, shirt2: 0xb6ff3d, shorts: 0x2b2f36, socks: 0x2b2f36, trim: 0xb6ff3d },
    gk: { shirt: 0xff4fd8, shirt2: 0x2a0a24, shorts: 0x2a0a24, socks: 0xff4fd8, trim: 0xffffff },
    pattern: 'hoops', formation: '4-4-2', style: 'Relentless press', css: '#1f9d4d', css2: '#b6ff3d',
    players: [
      P(1, 'H. Nguyen', 'GK', [57, 28, 70, 54, 87, 84], 2, 1, 186),
      P(2, 'C. Mbeki', 'RB', [83, 52, 75, 74, 79, 75], 5, 2, 179),
      P(4, 'S. Mamba', 'CB', [71, 40, 67, 58, 89, 90], 5, 5, 191),
      P(5, 'L. Green', 'CB', [64, 38, 70, 55, 87, 89], 0, 4, 190),
      P(3, 'R. Santos', 'LB', [87, 55, 78, 79, 76, 70], 3, 2, 175),
      P(6, 'D. Mbeki', 'CM', [74, 68, 86, 79, 76, 80], 4, 3, 182),
      P(8, 'A. Kone', 'CM', [78, 72, 88, 84, 70, 74], 5, 2, 180),
      P(7, 'W. Silva', 'RW', [91, 78, 77, 88, 42, 65], 3, 2, 174),
      P(11, 'E. Ford', 'LW', [90, 74, 79, 85, 44, 66], 0, 4, 178),
      P(9, 'V. Osimhen', 'ST', [88, 92, 70, 82, 38, 90], 5, 5, 186),
      P(10, 'K. Yamamoto', 'ST', [86, 85, 76, 86, 40, 70], 2, 1, 177),
      P(12, 'T. Boateng', 'GK', [54, 26, 65, 50, 81, 83], 5, 5, 189),
      P(14, 'M. Haas', 'CDM', [69, 60, 82, 72, 83, 84], 0, 0, 185),
      P(17, 'J. Castillo', 'LW', [89, 76, 74, 87, 38, 63], 1, 3, 173),
      P(19, 'F. Nwosu', 'ST', [84, 86, 68, 78, 36, 86], 5, 2, 188),
      P(23, 'A. Petrov', 'CB', [66, 34, 65, 54, 84, 86], 0, 1, 189),
    ],
  },
  {
    id: 'nova', name: 'Royal Nova', short: 'NVA', city: 'Cosmos', crest: 'star',
    kit: { shirt: 0x6d28d9, shirt2: 0xf7f3ff, shorts: 0xf7f3ff, socks: 0x6d28d9, trim: 0xffd84d },
    away: { shirt: 0x100a1c, shirt2: 0xc4a4ff, shorts: 0x100a1c, socks: 0x100a1c, trim: 0xffd84d },
    gk: { shirt: 0x22e0ff, shirt2: 0x07222b, shorts: 0x07222b, socks: 0x22e0ff, trim: 0x0b0b0b },
    pattern: 'stripes', formation: '4-3-3', style: 'Possession', css: '#8b5cf6', css2: '#ffd84d',
    players: [
      P(1, 'C. Vega', 'GK', [59, 30, 76, 57, 90, 86], 1, 0, 189),
      P(2, 'H. Sato', 'RB', [85, 56, 79, 78, 78, 72], 2, 1, 176),
      P(4, 'R. Stone', 'CB', [68, 42, 72, 60, 90, 91], 0, 0, 192),
      P(5, 'K. Magnus', 'CB', [63, 38, 74, 57, 91, 92], 0, 4, 194),
      P(3, 'T. White', 'LB', [84, 54, 80, 77, 79, 73], 0, 4, 179),
      P(6, 'N. Ali', 'CDM', [70, 64, 88, 78, 86, 84], 3, 2, 183),
      P(8, 'S. Laurent', 'CM', [77, 78, 93, 89, 66, 72], 1, 3, 176),
      P(10, 'B. Ferreira', 'CAM', [83, 84, 92, 94, 44, 66], 3, 2, 175),
      P(7, 'Z. Adeyemi', 'RW', [97, 80, 78, 91, 38, 66], 5, 3, 178),
      P(9, 'D. Cruz', 'ST', [86, 95, 74, 86, 38, 87], 1, 0, 184),
      P(11, 'I. Petrov', 'LW', [92, 81, 80, 90, 40, 64], 0, 1, 177),
      P(13, 'M. Dubois', 'GK', [55, 28, 70, 52, 84, 84], 0, 1, 188),
      P(14, 'O. Bakker', 'CM', [74, 70, 87, 81, 72, 76], 0, 4, 185),
      P(16, 'A. Mensah', 'CB', [70, 36, 68, 56, 86, 88], 5, 5, 191),
      P(18, 'L. Ricci', 'RW', [91, 77, 76, 88, 38, 62], 0, 3, 174),
      P(21, 'K. Diallo', 'ST', [85, 88, 70, 80, 36, 88], 5, 2, 189),
    ],
  },
  {
    id: 'iron', name: 'Ironclad AC', short: 'IRN', city: 'Forge Bay', crest: 'anvil',
    kit: { shirt: 0x2b3038, shirt2: 0xd8dee8, shorts: 0x2b3038, socks: 0x2b3038, trim: 0xff3b47 },
    away: { shirt: 0xe8ecf2, shirt2: 0x2b3038, shorts: 0xe8ecf2, socks: 0xe8ecf2, trim: 0xff3b47 },
    gk: { shirt: 0xff7a1f, shirt2: 0x2a1408, shorts: 0x2a1408, socks: 0xff7a1f, trim: 0x111111 },
    pattern: 'plain', formation: '4-4-2', style: 'Low block', css: '#98a4b5', css2: '#ff3b47',
    players: [
      P(1, 'V. Kraus', 'GK', [56, 28, 71, 54, 89, 89], 0, 0, 193),
      P(2, 'D. Halloran', 'RB', [79, 48, 72, 68, 83, 80], 0, 1, 181),
      P(4, 'B. Steiner', 'CB', [62, 40, 68, 54, 91, 93], 0, 0, 194),
      P(5, 'M. Torvald', 'CB', [60, 38, 66, 52, 90, 94], 0, 4, 195),
      P(3, 'E. Novak', 'LB', [80, 50, 74, 70, 82, 79], 0, 1, 180),
      P(6, 'G. Petrov', 'CDM', [66, 60, 82, 70, 88, 89], 0, 0, 187),
      P(8, 'R. Blackwood', 'CM', [72, 70, 85, 76, 78, 82], 0, 1, 183),
      P(7, 'A. Farkas', 'RW', [86, 74, 74, 82, 48, 72], 0, 0, 178),
      P(11, 'S. Doyle', 'LW', [85, 72, 76, 81, 50, 73], 0, 4, 179),
      P(9, 'H. Brandt', 'ST', [78, 89, 70, 76, 40, 92], 0, 0, 191),
      P(10, 'I. Vasquez', 'ST', [82, 86, 76, 83, 42, 80], 1, 3, 181),
      P(12, 'T. Lindqvist', 'GK', [54, 26, 66, 50, 83, 85], 0, 4, 191),
      P(14, 'N. Oyelaran', 'CB', [68, 36, 64, 54, 87, 90], 5, 5, 192),
      P(16, 'C. Weber', 'CM', [70, 66, 84, 74, 76, 80], 0, 1, 182),
      P(18, 'J. Mbala', 'RW', [90, 72, 72, 84, 40, 70], 5, 2, 176),
      P(20, 'P. Sørensen', 'ST', [76, 85, 68, 74, 38, 90], 0, 4, 190),
    ],
  },
  {
    id: 'crimson', name: 'Crimson Athletic', short: 'CRM', city: 'Redcliff', crest: 'flame',
    kit: { shirt: 0xc0182b, shirt2: 0xffffff, shorts: 0xffffff, socks: 0xc0182b, trim: 0x111111 },
    away: { shirt: 0x1a1d22, shirt2: 0xff5a6a, shorts: 0x1a1d22, socks: 0x1a1d22, trim: 0xff5a6a },
    gk: { shirt: 0xb6ff3d, shirt2: 0x1c2408, shorts: 0x1c2408, socks: 0xb6ff3d, trim: 0x111111 },
    pattern: 'stripes', formation: '3-5-2', style: 'Wing play', css: '#e02436', css2: '#ffffff',
    players: [
      P(1, 'M. Ferreira', 'GK', [58, 30, 73, 56, 88, 86], 3, 2, 188),
      P(4, 'A. Rugani', 'CB', [66, 38, 70, 56, 88, 89], 0, 0, 190),
      P(5, 'K. Boateng', 'CB', [70, 40, 68, 58, 89, 91], 5, 5, 192),
      P(6, 'L. Moretti', 'CB', [64, 36, 72, 55, 87, 88], 0, 1, 189),
      P(2, 'R. Tanaka', 'RB', [88, 58, 80, 80, 76, 70], 2, 1, 174),
      P(3, 'O. Ndiaye', 'LB', [89, 56, 79, 79, 75, 71], 5, 2, 177),
      P(8, 'D. Kaur', 'CM', [75, 72, 88, 83, 72, 75], 3, 4, 176),
      P(10, 'F. Lombardi', 'CAM', [81, 82, 91, 91, 46, 68], 0, 3, 175),
      P(7, 'S. Achebe', 'RW', [93, 79, 78, 89, 40, 66], 5, 3, 178),
      P(9, 'G. Ibrahim', 'ST', [87, 93, 72, 84, 38, 88], 4, 5, 186),
      P(11, 'T. Andersen', 'ST', [84, 88, 74, 81, 40, 85], 0, 4, 187),
      P(13, 'W. Zhao', 'GK', [56, 28, 68, 52, 84, 84], 2, 1, 187),
      P(14, 'E. Mwangi', 'CDM', [70, 62, 84, 74, 85, 86], 5, 2, 184),
      P(16, 'C. Herrera', 'CM', [76, 74, 86, 82, 70, 74], 1, 0, 179),
      P(18, 'Y. Kim', 'LW', [92, 76, 76, 88, 38, 62], 2, 6, 172),
      P(20, 'B. Toure', 'ST', [86, 87, 68, 79, 36, 89], 5, 5, 190),
    ],
  },
  {
    id: 'azure', name: 'Azure Maritime', short: 'AZR', city: 'Port Celeste', crest: 'wave',
    kit: { shirt: 0x0fb5c9, shirt2: 0x042a30, shorts: 0x042a30, socks: 0x0fb5c9, trim: 0xffffff },
    away: { shirt: 0xf6f8fa, shirt2: 0x0fb5c9, shorts: 0xf6f8fa, socks: 0xf6f8fa, trim: 0x042a30 },
    gk: { shirt: 0x8b5cf6, shirt2: 0x1a0e2e, shorts: 0x1a0e2e, socks: 0x8b5cf6, trim: 0xffffff },
    pattern: 'sash', formation: '4-3-3', style: 'Tiki-taka', css: '#0fb5c9', css2: '#7ef0ff',
    players: [
      P(1, 'L. Marchand', 'GK', [57, 28, 75, 56, 87, 84], 0, 1, 187),
      P(2, 'K. Osei', 'RB', [86, 54, 78, 77, 78, 72], 5, 2, 177),
      P(4, 'M. Vidal', 'CB', [67, 38, 73, 58, 88, 88], 1, 0, 189),
      P(5, 'J. Sørensen', 'CB', [64, 36, 74, 56, 89, 90], 0, 4, 191),
      P(3, 'A. Diallo', 'LB', [87, 55, 80, 79, 77, 71], 5, 3, 176),
      P(6, 'R. Nakamura', 'CDM', [71, 62, 89, 80, 85, 80], 2, 1, 178),
      P(8, 'P. Almeida', 'CM', [76, 74, 92, 88, 68, 71], 3, 2, 175),
      P(10, 'N. Haddad', 'CAM', [82, 80, 93, 93, 45, 64], 3, 3, 173),
      P(7, 'E. Mbappé', 'RW', [96, 82, 79, 92, 38, 66], 5, 2, 178),
      P(9, 'S. Kowalski', 'ST', [83, 92, 76, 84, 40, 86], 0, 0, 185),
      P(11, 'T. Okafor', 'LW', [94, 80, 78, 91, 38, 64], 5, 5, 177),
      P(12, 'F. Rossi', 'GK', [55, 26, 68, 52, 82, 83], 0, 1, 188),
      P(14, 'D. Bakker', 'CM', [74, 70, 88, 82, 72, 74], 0, 4, 183),
      P(16, 'I. Santos', 'CB', [68, 34, 70, 55, 85, 87], 3, 2, 190),
      P(18, 'H. Yusuf', 'RW', [92, 77, 76, 89, 38, 63], 4, 5, 175),
      P(21, 'C. Larsen', 'ST', [82, 86, 72, 79, 36, 84], 0, 4, 186),
    ],
  },
  {
    id: 'gold', name: 'Goldcrest City', short: 'GLD', city: 'Aurelia', crest: 'crown',
    kit: { shirt: 0xf2c018, shirt2: 0x1a1408, shorts: 0x1a1408, socks: 0xf2c018, trim: 0x0b0b0b },
    away: { shirt: 0x141821, shirt2: 0xf2c018, shorts: 0x141821, socks: 0x141821, trim: 0xf2c018 },
    gk: { shirt: 0x1f8fff, shirt2: 0x061226, shorts: 0x061226, socks: 0x1f8fff, trim: 0xffffff },
    pattern: 'hoops', formation: '4-2-3-1', style: 'Direct attack', css: '#f2c018', css2: '#fff3b0',
    players: [
      P(1, 'A. Novotny', 'GK', [58, 30, 72, 55, 88, 87], 0, 0, 190),
      P(2, 'S. Adekunle', 'RB', [85, 56, 77, 76, 79, 74], 5, 2, 179),
      P(4, 'B. Kovács', 'CB', [66, 40, 70, 56, 89, 91], 0, 1, 192),
      P(5, 'M. Traoré', 'CB', [71, 38, 68, 58, 90, 92], 5, 5, 193),
      P(3, 'L. Fontaine', 'LB', [86, 54, 79, 78, 78, 72], 0, 3, 177),
      P(6, 'T. Abebe', 'CDM', [70, 64, 86, 76, 86, 85], 5, 2, 185),
      P(8, 'D. Serrano', 'CDM', [72, 66, 87, 77, 83, 82], 1, 0, 182),
      P(7, 'K. Mensah', 'RW', [94, 79, 78, 90, 40, 66], 5, 3, 176),
      P(10, 'V. Rossi', 'CAM', [83, 83, 91, 92, 45, 66], 0, 3, 174),
      P(11, 'J. Nakagawa', 'LW', [93, 78, 79, 90, 38, 63], 2, 1, 172),
      P(9, 'O. Balogun', 'ST', [88, 94, 72, 85, 38, 89], 5, 5, 188),
      P(13, 'R. Lindgren', 'GK', [55, 26, 67, 51, 83, 84], 0, 4, 189),
      P(14, 'E. Castellanos', 'CM', [75, 72, 87, 83, 70, 74], 1, 2, 180),
      P(16, 'N. Abara', 'CB', [69, 36, 66, 55, 86, 89], 5, 2, 191),
      P(18, 'F. Delgado', 'RW', [91, 76, 76, 88, 38, 64], 1, 0, 175),
      P(20, 'W. Johansson', 'ST', [84, 88, 70, 80, 36, 87], 0, 4, 189),
    ],
  },
];

// ---------------------------------------------------------------------------
// Formations: positions in normalised pitch space.
// x: -1 = own goal line, +1 = opponent goal line.  z: -1 = left touchline, +1 = right
// ---------------------------------------------------------------------------
export const FORMATIONS = {
  '4-3-3': [
    ['GK', -0.94, 0], ['LB', -0.60, -0.66], ['CB', -0.70, -0.24], ['CB', -0.70, 0.24], ['RB', -0.60, 0.66],
    ['CDM', -0.36, 0], ['CM', -0.16, -0.36], ['CM', -0.16, 0.36],
    ['LW', 0.34, -0.72], ['ST', 0.46, 0], ['RW', 0.34, 0.72],
  ],
  '4-4-2': [
    ['GK', -0.94, 0], ['LB', -0.62, -0.68], ['CB', -0.72, -0.24], ['CB', -0.72, 0.24], ['RB', -0.62, 0.68],
    ['LW', -0.18, -0.70], ['CM', -0.26, -0.22], ['CM', -0.26, 0.22], ['RW', -0.18, 0.70],
    ['ST', 0.42, -0.20], ['ST', 0.42, 0.20],
  ],
  '4-2-3-1': [
    ['GK', -0.94, 0], ['LB', -0.62, -0.68], ['CB', -0.72, -0.24], ['CB', -0.72, 0.24], ['RB', -0.62, 0.68],
    ['CDM', -0.38, -0.20], ['CDM', -0.38, 0.20],
    ['LW', 0.16, -0.68], ['CAM', 0.14, 0], ['RW', 0.16, 0.68],
    ['ST', 0.48, 0],
  ],
  '3-5-2': [
    ['GK', -0.94, 0], ['CB', -0.74, -0.36], ['CB', -0.76, 0], ['CB', -0.74, 0.36],
    ['LB', -0.24, -0.80], ['CM', -0.30, -0.26], ['CDM', -0.42, 0], ['CM', -0.30, 0.26], ['RB', -0.24, 0.80],
    ['ST', 0.44, -0.20], ['ST', 0.44, 0.20],
  ],
};

export const STADIUMS = [
  {
    id: 'solaris', name: 'Solaris Park', tag: 'Golden hour', capacity: 62400,
    skyTop: 0x1d3a6e, skyHorizon: 0xffa860, skyGround: 0x2a2438, sunAz: 2.3, sunEl: 0.16,
    sun: 0xffc98a, sunI: 2.6, ambient: 0x9fb6d8, ambientI: 0.55, fog: 0x6d7fa0, fogDensity: 0.0022,
    grass: 0x3f8f43, grassDark: 0x357a3a, night: false, crowdTint: 0xffcf9a, exposure: 1.0,
    roof: 0x2a2f3a, seat: 0xd8481f,
  },
  {
    id: 'circuit', name: 'Circuit Arena', tag: 'Floodlit night', capacity: 71000,
    skyTop: 0x02040c, skyHorizon: 0x0a1830, skyGround: 0x05070f, sunAz: 0.7, sunEl: 0.85,
    sun: 0xeaf4ff, sunI: 3.1, ambient: 0x2a3d5c, ambientI: 0.5, fog: 0x0a1424, fogDensity: 0.0034,
    grass: 0x2f8442, grassDark: 0x276f38, night: true, crowdTint: 0xa8c8ff, exposure: 1.06,
    roof: 0x161a22, seat: 0x1f8fff,
  },
  {
    id: 'eclipse', name: 'Eclipse Dome', tag: 'Closed roof', capacity: 58800,
    skyTop: 0x0a0616, skyHorizon: 0x2a1040, skyGround: 0x0a0616, sunAz: 1.9, sunEl: 0.95,
    sun: 0xffe6f6, sunI: 3.0, ambient: 0x3a2a52, ambientI: 0.55, fog: 0x160e26, fogDensity: 0.0030,
    grass: 0x33884a, grassDark: 0x2a7340, night: true, crowdTint: 0xd8b0ff, exposure: 1.04,
    roof: 0x1a1424, seat: 0x8b5cf6,
  },
  {
    id: 'harbor', name: 'Harbor Grounds', tag: 'Overcast day', capacity: 48500,
    skyTop: 0x8fa4bd, skyHorizon: 0xd8e2ec, skyGround: 0x6a7480, sunAz: 3.6, sunEl: 0.55,
    sun: 0xf2f6ff, sunI: 1.9, ambient: 0xc4d4e6, ambientI: 0.85, fog: 0xc0ccd8, fogDensity: 0.0026,
    grass: 0x3d8a48, grassDark: 0x337a3f, night: false, crowdTint: 0xdce6f0, exposure: 0.96,
    roof: 0x3a4048, seat: 0x0fb5c9,
  },
];

export const DIFFICULTIES = {
  amateur:   { label: 'Amateur',    aiSpeed: 0.86, reaction: 0.55, accuracy: 0.60, aggression: 0.55, gkSkill: 0.62 },
  semipro:   { label: 'Semi-Pro',   aiSpeed: 0.94, reaction: 0.40, accuracy: 0.70, aggression: 0.70, gkSkill: 0.74 },
  pro:       { label: 'Professional', aiSpeed: 1.00, reaction: 0.28, accuracy: 0.80, aggression: 0.85, gkSkill: 0.84 },
  worldclass:{ label: 'World Class', aiSpeed: 1.05, reaction: 0.19, accuracy: 0.88, aggression: 0.95, gkSkill: 0.92 },
  legend:    { label: 'Legendary',  aiSpeed: 1.10, reaction: 0.12, accuracy: 0.95, aggression: 1.05, gkSkill: 0.98 },
};

export const MATCH_LENGTHS = [
  { id: 'short', label: 'Quick', minutes: 3, halves: 2 },
  { id: 'normal', label: 'Standard', minutes: 5, halves: 2 },
  { id: 'long', label: 'Full', minutes: 8, halves: 2 },
];

export const COMMENTARY = {
  kickoff: ['We are underway here at {stadium}.', 'And the referee gets us started.', '{home} get the ball rolling.'],
  goal: ['GOAL! {scorer} finds the net for {team}!', 'It\'s in! {scorer} with a superb finish!', '{scorer} scores! What a moment for {team}!', 'Unstoppable! {scorer} beats the keeper!'],
  save: ['Brilliant save by {keeper}!', '{keeper} gets down well to deny it.', 'Superb stop! {keeper} keeps it out.'],
  post: ['Off the woodwork! Inches away.', 'It rattles the frame of the goal!', 'So close — the post saves it.'],
  miss: ['Dragged wide by {scorer}.', 'Over the bar — good chance gone.', '{scorer} can\'t hit the target.'],
  foul: ['That\'s a foul, the referee has no hesitation.', 'Free kick given away.', 'Clumsy challenge — the whistle goes.'],
  yellow: ['Yellow card. He\'s on a booking now.', 'Into the book for that challenge.'],
  corner: ['Corner kick.', 'Behind for a corner.'],
  savegk: ['Comfortable for the keeper.', 'Gathered by {keeper}.'],
  tackle: ['Superb tackle!', 'Won it cleanly.', 'Great defending there.'],
  pass: ['Lovely ball through the middle.', 'Crisp passing here.', 'Switching the play nicely.'],
  halftime: ['Half time at {stadium}.'],
  fulltime: ['The referee blows for full time.'],
  offside: ['Flag\'s up — offside.', 'Offside given.'],
};

export function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }
