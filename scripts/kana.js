const SMALL_TO_LARGE = new Map([
  ["ぁ", "あ"], ["ぃ", "い"], ["ぅ", "う"], ["ぇ", "え"], ["ぉ", "お"],
  ["ゃ", "や"], ["ゅ", "ゆ"], ["ょ", "よ"], ["っ", "つ"], ["ゎ", "わ"],
  ["ァ", "ア"], ["ィ", "イ"], ["ゥ", "ウ"], ["ェ", "エ"], ["ォ", "オ"],
  ["ャ", "ヤ"], ["ュ", "ユ"], ["ョ", "ヨ"], ["ッ", "ツ"], ["ヮ", "ワ"],
]);

export function normalizeKanaText(text) {
  return Array.from(String(text ?? ""))
    .map((char) => SMALL_TO_LARGE.get(char) ?? char)
    .join("");
}

export function toKanaCells(text) {
  return Array.from(normalizeKanaText(text));
}

export function kanaCellLength(text) {
  return toKanaCells(text).length;
}
