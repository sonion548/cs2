// Original map layouts, authored as ASCII grids.
//   #  wall            .  paved ground      ,  sand ground
//   u  tunnel (roofed) c  low crate         C  tall crate stack
//   ^  raised platform s  step              A/B bombsite floor
//   T  attacker spawn  K  defender spawn
export const MAPS = {
  dunehold: {
    name: 'Dunehold',
    description: 'Sun-baked fortress town. Long A lane, crate-filled mid, tunnels to B.',
    cell: 4,
    wallHeight: 7,
    sun: { x: 0.55, y: 1, z: 0.35 },
    grid: [
      '##############################',
      '#BBBBBB#####KKKKKK####AAAAAAA#',
      '#BBcBBB#####KKKKKK####AAAACAA#',
      '#BBBBBB.....KKKKKK....AA^^AAA#',
      '#BBCBBB.....K....K....AAssAAA#',
      '#BBBBBB###..........###AAAAAA#',
      '#BB..BB###....##....###AA.AAA#',
      '##.....###....##....###...####',
      '##..########..##..#######...##',
      '##..########..##..#######...##',
      '##uu########......#######...##',
      '##uu######..........######..##',
      '##uu######..CC..CC..######..##',
      '##uu######..........######..##',
      '##uu########,,,,,,########,,##',
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
