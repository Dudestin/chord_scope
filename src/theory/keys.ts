export interface KeyOption {
  spec: string
  label: string
  sharps: boolean
  minorTonic: string
}

export const KEY_OPTIONS: KeyOption[] = [
  { spec: 'Cb', label: 'Cb / Abm', sharps: false, minorTonic: 'Ab' },
  { spec: 'Gb', label: 'Gb / Ebm', sharps: false, minorTonic: 'Eb' },
  { spec: 'Db', label: 'Db / Bbm', sharps: false, minorTonic: 'Bb' },
  { spec: 'Ab', label: 'Ab / Fm',  sharps: false, minorTonic: 'F'  },
  { spec: 'Eb', label: 'Eb / Cm',  sharps: false, minorTonic: 'C'  },
  { spec: 'Bb', label: 'Bb / Gm',  sharps: false, minorTonic: 'G'  },
  { spec: 'F',  label: 'F / Dm',   sharps: false, minorTonic: 'D'  },
  { spec: 'C',  label: 'C / Am',   sharps: true,  minorTonic: 'A'  },
  { spec: 'G',  label: 'G / Em',   sharps: true,  minorTonic: 'E'  },
  { spec: 'D',  label: 'D / Bm',   sharps: true,  minorTonic: 'B'  },
  { spec: 'A',  label: 'A / F#m',  sharps: true,  minorTonic: 'F#' },
  { spec: 'E',  label: 'E / C#m',  sharps: true,  minorTonic: 'C#' },
  { spec: 'B',  label: 'B / G#m',  sharps: true,  minorTonic: 'G#' },
  { spec: 'F#', label: 'F# / D#m', sharps: true,  minorTonic: 'D#' },
  { spec: 'C#', label: 'C# / A#m', sharps: true,  minorTonic: 'A#' },
]
