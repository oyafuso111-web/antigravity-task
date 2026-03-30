export const getCategory = (name: string): number => {
  if (!name) return 2;
  
  // Emoji checking (Extended_Pictographic covers most modern emojis)
  const isEmoji = /^[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u.test(name);
  if (isEmoji) return 3;

  // Alphanumeric checking (Half-width and Full-width)
  const isAlphanumeric = /^[a-zA-Z0-9ａ-ｚＡ-Ｚ０-９]/.test(name);
  if (isAlphanumeric) return 1;

  // Everything else (Japanese Kana, Kanji, etc.)
  return 2;
};

export const sortProjectsCustom = (aName: string, bName: string): number => {
  const catA = getCategory(aName);
  const catB = getCategory(bName);
  
  if (catA !== catB) {
    return catA - catB;
  }
  
  return aName.localeCompare(bName, 'ja');
};
