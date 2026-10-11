export function toVexKey(name: string): string {
  const match = /^([A-Ga-g][#b]*)(-?\d+)$/.exec(name)
  if (!match) return 'c/4'
  const [, letter, octave] = match
  return `${letter.toLowerCase()}/${octave}`
}
