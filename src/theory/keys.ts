export interface KeyOption {
  spec: string
  label: string
  sharps: boolean
}

export const KEY_OPTIONS: KeyOption[] = [
  { spec: 'Cb', label: 'Cb / Abm', sharps: false },
  { spec: 'Gb', label: 'Gb / Ebm', sharps: false },
  { spec: 'Db', label: 'Db / Bbm', sharps: false },
  { spec: 'Ab', label: 'Ab / Fm', sharps: false },
  { spec: 'Eb', label: 'Eb / Cm', sharps: false },
  { spec: 'Bb', label: 'Bb / Gm', sharps: false },
  { spec: 'F', label: 'F / Dm', sharps: false },
  { spec: 'C', label: 'C / Am', sharps: true },
  { spec: 'G', label: 'G / Em', sharps: true },
  { spec: 'D', label: 'D / Bm', sharps: true },
  { spec: 'A', label: 'A / F#m', sharps: true },
  { spec: 'E', label: 'E / C#m', sharps: true },
  { spec: 'B', label: 'B / G#m', sharps: true },
  { spec: 'F#', label: 'F# / D#m', sharps: true },
  { spec: 'C#', label: 'C# / A#m', sharps: true },
]
