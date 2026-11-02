// Original map layouts, authored as ASCII grids.
//   #  wall            .  paved ground      ,  sand ground
//   u  tunnel (roofed) c  low crate         C  tall crate stack
//   ^  raised platform s  step              A/B bombsite floor
//   T  attacker spawn  K  defender spawn
//   h  building interior (roofed; walls with windows where it meets the street)
//   D  building interior with doorways onto the street
export const MAPS = {
  dunehold: {
    name: 'Dunehold',
    description: 'Sun-baked fortress town. Long A lane, a market hall and apartments off mid, twin tunnels to B.',
    cell: 4,
    wallHeight: 7,
    sun: { x: 0.55, y: 1, z: 0.35 },
    grid: [
      '##############################',
      '#BBBBBB#####KKKKKK####AAAAAAA#',
      '#BBcBBB#####KKKKKK####AAAACAA#',
      '#BBBBBBDhhhDKKKKKK....AA^^AAA#',
      '#BBCBBBhhhhhK....K....AAssAAA#',
      '#BBBBBB###..........###AAAAAA#',
      '#BB..BB###....##....###AA.AAA#',
      '##.....###....##....###...####',
      '##..DhhhhhhD..##..DhhhhhD...##',
      '##..hhhhhhhh..##..hhhhhhh...##',
      '##uu########......#######...##',
      '##uu##hhhD..........Dhhh##..##',
      '##uu##hhhh..CC..CC..hhhh##..##',
      '##uu##hhhh..........hhhh##..##',
      '##uuuuuuuuuu,,,,,,########,,##',
      '##,,,,,,,,,,,,,,,,,,,,,,,,,,##',
      '###,,,,,,,,,,,,,,,,,,,,,,,,###',
      '###,,,,,####,,##,,####,,,,,###',
      '###,,c,,####TTTTTT####,,C,,###',
      '######,,####TTTTTT####,,######',
      '######,,,,,,TTTTTT,,,,,,######',
      '##############################',
    ],
  },
};

// Interior cells and the edges between them and the street.
export const INTERIOR = 'hD';
// Can you step from cell a to its neighbour b? Building walls only open at doorway cells.
export function passable(ca, cb) {
  const ia = INTERIOR.includes(ca), ib = INTERIOR.includes(cb);
  if (ia === ib) return true;
  return ia ? ca === 'D' : cb === 'D';
}
