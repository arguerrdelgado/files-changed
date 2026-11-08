/** Every text the card shows, in one place so it can be translated. */
export const labels = {
  filesChanged: (count: number): string => (count === 1 ? '1 archivo cambiado' : `${count} archivos cambiados`),
  newFile: 'nuevo',
} as const
