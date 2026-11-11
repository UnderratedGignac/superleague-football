export const POWERS = {
  aegis:   { name:'Aegis Wall',      icon:'⬡', color:0x39ffb0, css:'#39ffb0', desc:'Projects a wide energy shield. Goalkeepers save almost everything for 3s.', kind:'save' },
  seismic: { name:'Seismic Tackle',  icon:'◈', color:0xffb020, css:'#ffb020', desc:'A shockwave slide that steals the ball in a 5m radius. Reckless use risks a card.', kind:'tackle' },
  flash:   { name:'Flash Step',      icon:'↯', color:0x28d7ff, css:'#28d7ff', desc:'Superhuman speed for 2.4s with lightning afterimages. Burns past any defender.', kind:'speed' },
  phase:   { name:'Phase Shift',     icon:'✦', color:0xb477ff, css:'#b477ff', desc:'Teleports up to 9m through defenders, leaving a rift and brief invulnerability.', kind:'teleport' },
  meteor:  { name:'Meteor Strike',   icon:'☄', color:0xff5a2a, css:'#ff5a2a', desc:'Unleashes a flaming rocket shot. Raw power can blast through a keeper.', kind:'shot' },
  iron:    { name:'Iron Colossus',   icon:'⛨', color:0xcfd8e6, css:'#cfd8e6', desc:'Hardens the body for 3s: immune to tackles and wins every shoulder challenge.', kind:'shield' },
  thread:  { name:'Thread Pass',     icon:'⌁', color:0x7d8cff, css:'#7d8cff', desc:'A guided, curving pass that finds the best teammate through traffic.', kind:'pass' },
  nova:    { name:'Nova Curve',      icon:'✺', color:0xff3fa4, css:'#ff3fa4', desc:'A bending shot that swerves toward the far corner with a plasma spiral.', kind:'curve' },
  sky:     { name:'Sky Leap',        icon:'▲', color:0xffd84d, css:'#ffd84d', desc:'Launches 3m into the air with golden wings; headers the ball goalward if close.', kind:'aerial' },
  gravity: { name:'Gravity Well',    icon:'◎', color:0xffa63d, css:'#ffa63d', desc:'Bends space to rip the ball toward you from up to 12m, even from opponents.', kind:'pull' },
};

const R = (num, name, role, power, powerName, skin, hair, st) => ({ num, name, role, power, powerName, skin, hair, stats: { speed:st[0], shot:st[1], control:st[2], defense:st[3], power:st[4] } });
// stats 0..100
export const TEAMS = [
  {
    id:'solar', name:'Solar FC', short:'SOL', city:'Ember City', crest:'phoenix',
    primary:0xff5a1f, secondary:0x1a0d08, accent:0xffd23f, css:'#ff5a1f', css2:'#ffd23f',
    formation:'2–2', style:'Explosive attack',
    players:[
      R(1,'R. Vale','GK','aegis','Solar Aegis',3,0,[62,45,58,88,90]),
      R(4,'D. Okafor','DEF','seismic','Ember Quake',1,2,[70,55,62,92,86]),
      R(7,'K. Asano','LM','flash','Blaze Rush',4,1,[96,70,88,60,84]),
      R(10,'L. Moreau','RM','phase','Mirage Step',2,3,[82,78,94,58,92]),
      R(9,'A. Reyes','ST','meteor','Sunfall Cannon',3,2,[84,97,82,45,96]),
      R(5,'M. Haaland','DEF','iron','Forge Body',5,0,[68,60,65,90,82]),
      R(8,'T. Silva','MID','thread','Ember Thread',2,1,[78,74,90,70,88]),
      R(11,'C. Mensah','ST','nova','Flare Curve',1,2,[86,90,84,40,90]),
      R(17,'J. Park','RM','sky','Phoenix Leap',4,0,[88,82,80,50,86]),
      R(21,'I. Petrov','LM','gravity','Core Pull',5,3,[74,68,82,66,88]),
    ]
  },
  {
    id:'volt', name:'Volt United', short:'VLT', city:'Neon Harbor', crest:'bolt',
    primary:0x1f8fff, secondary:0x061226, accent:0x35f2ff, css:'#1f8fff', css2:'#35f2ff',
    formation:'2–2', style:'Lightning counters',
    players:[
      R(1,'S. Ito','GK','aegis','Static Ward',4,0,[64,42,60,90,88]),
      R(3,'B. Traoré','DEF','seismic','Thunder Slide',1,1,[74,52,60,93,88]),
      R(7,'N. Volkov','LM','flash','Volt Sprint',5,0,[97,68,86,58,90]),
      R(10,'E. Costa','RM','phase','Blink Circuit',2,2,[84,76,95,55,94]),
      R(9,'M. Kovač','ST','meteor','Railgun Boot',3,3,[82,96,80,48,95]),
      R(4,'O. Lind','DEF','iron','Tesla Armor',5,0,[66,58,64,91,84]),
      R(8,'F. Diallo','MID','thread','Arc Conductor',1,2,[80,72,92,68,90]),
      R(11,'Y. Tanaka','ST','nova','Plasma Bend',4,1,[88,89,86,42,92]),
      R(17,'P. Novak','RM','sky','Storm Vault',3,0,[86,84,78,52,88]),
      R(21,'G. Rossi','LM','gravity','Magnet Pulse',2,3,[76,70,84,64,86]),
    ]
  },
  {
    id:'verdant', name:'Verdant SC', short:'VRD', city:'Canopy', crest:'leaf',
    primary:0x27d970, secondary:0x062015, accent:0xb6ff3d, css:'#27d970', css2:'#b6ff3d',
    formation:'2–2', style:'Relentless press',
    players:[
      R(1,'H. Nguyen','GK','aegis','Canopy Guard',4,0,[60,44,62,89,87]),
      R(4,'S. Mamba','DEF','seismic','Root Quake',1,2,[72,56,64,94,86]),
      R(7,'R. Santos','LM','flash','Jungle Dash',2,1,[95,72,90,62,86]),
      R(10,'A. Kone','RM','phase','Vine Blink',1,3,[80,74,93,60,90]),
      R(9,'V. Osimhen','ST','meteor','Timber Cannon',1,2,[86,95,84,46,94]),
      R(5,'L. Green','DEF','iron','Bark Skin',5,0,[64,62,66,92,82]),
      R(8,'D. Mbeki','MID','thread','Leaf Thread',1,1,[78,76,91,72,88]),
      R(11,'W. Silva','ST','nova','Bloom Curve',2,2,[84,91,85,44,90]),
      R(17,'K. Yamamoto','RM','sky','Falcon Rise',4,0,[90,80,82,50,88]),
      R(21,'E. Ford','LM','gravity','Nature Pull',3,3,[72,66,80,68,86]),
    ]
  },
  {
    id:'nova', name:'Royal Nova', short:'NVA', city:'Cosmos', crest:'star',
    primary:0xa855f7, secondary:0x160a26, accent:0xff4fd8, css:'#a855f7', css2:'#ff4fd8',
    formation:'2–2', style:'Cosmic flair',
    players:[
      R(1,'C. Vega','GK','aegis','Nebula Ward',2,0,[63,46,59,91,90]),
      R(4,'R. Stone','DEF','seismic','Star Quake',5,1,[70,58,62,92,88]),
      R(7,'Z. Adeyemi','LM','flash','Comet Run',1,2,[96,74,89,58,92]),
      R(10,'S. Laurent','RM','phase','Warp Royale',3,3,[85,80,96,56,95]),
      R(9,'D. Cruz','ST','meteor','Supernova Kick',2,2,[83,98,83,44,97]),
      R(5,'K. Magnus','DEF','iron','Titan Plate',5,0,[67,60,66,93,85]),
      R(8,'N. Ali','MID','thread','Orbit Thread',4,1,[79,75,93,69,91]),
      R(11,'B. Ferreira','ST','nova','Galaxy Curve',2,3,[87,92,87,43,93]),
      R(17,'H. Sato','RM','sky','Zero-G Leap',4,0,[89,83,81,51,89]),
      R(21,'T. White','LM','gravity','Singularity',3,1,[75,69,83,67,89]),
    ]
  }
];

export const STADIUMS = [
  { id:'solaris', name:'Solaris Park', tag:'Golden hour', capacity:'62,400',
    skyTop:0x16264d, skyBottom:0xff8c52, fog:0x2b3550, grass:0x2e8b3e, grassDark:0x257234,
    key:0xffd0a0, rim:0x66aaff, roof:0xff7a3c, crowd:0xffb070, ambient:0.55, night:false },
  { id:'circuit', name:'Circuit Arena', tag:'Floodlit night', capacity:'71,000',
    skyTop:0x030716, skyBottom:0x0b2a4a, fog:0x081426, grass:0x1f7a3c, grassDark:0x196332,
    key:0xdff4ff, rim:0x22d3ee, roof:0x1f8fff, crowd:0x7fdfff, ambient:0.42, night:true },
  { id:'eclipse', name:'Eclipse Dome', tag:'Cosmic dusk', capacity:'58,800',
    skyTop:0x0d061c, skyBottom:0x4a1d5e, fog:0x1a1030, grass:0x267447, grassDark:0x1e5f3a,
    key:0xffd0f4, rim:0xff4fd8, roof:0xa855f7, crowd:0xd08bff, ambient:0.48, night:true },
];

export const DIFFICULTIES = {
  casual:{ label:'Casual', aiSpeed:0.82, reaction:0.55, accuracy:0.62, powerRate:0.5 },
  pro:{ label:'Pro', aiSpeed:1.0, reaction:0.32, accuracy:0.78, powerRate:0.85 },
  legend:{ label:'Legend', aiSpeed:1.13, reaction:0.18, accuracy:0.9, powerRate:1.15 },
};

export const SKIN_TONES = [0xf2c9a0,0xd9a066,0xa86b3c,0x7a4a26,0x5c351c,0xf7d7b8];
export const HAIR_COLORS = [0x1b1410,0x2b1b10,0x4a2c14,0x6b4a2a,0x111111,0x8a6a3a];
export const HAIR_STYLES = ['crop','fade','curls','long'];

export function cloneTeam(team){
  return { ...team, players: team.players.map((p,i)=>({ ...p, stats:{...p.stats}, teamId:team.id, idx:i,
    stamina:100, power:100, powerType:p.power, cooldown:0, active:i<5, card:0, sentOff:false,
    pos:{x:0,z:0}, facing:0, anim:0, vel:{x:0,z:0}, y:0, vy:0,
    slide:0, tackleCd:0, invuln:0, speedBoost:0, shield:0, frozen:0, celebrate:0, dive:0, saveCd:0,
    aiTimer:Math.random()*0.4, runPhase:Math.random()*6, expression:'focus', lastTouch:0 })) };
}
