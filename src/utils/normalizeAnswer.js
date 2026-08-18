export function normalizeAnswer(value = '') {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function isCorrectGuess(value, track) {
  if (!track) return false;
  const answer = normalizeAnswer(value);
  const title = normalizeAnswer(track.name);
  if (!answer) return false;
  if (answer === title) return true;

  const previous = Array.from({ length: title.length + 1 }, (_, i) => i);
  for (let i = 1; i <= answer.length; i++) {
    const current = [i];
    for (let j = 1; j <= title.length; j++) {
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (answer[i - 1] === title[j - 1] ? 0 : 1));
    }
    for (let j = 0; j <= title.length; j++) previous[j] = current[j];
  }
  return previous[title.length] <= Math.max(1, Math.floor(title.length * 0.12));
}
