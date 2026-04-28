// 닉네임 욕설/혐오 표현 필터.
// 100% 완벽한 차단은 불가능 (다양한 변형). 직설적인 표현만 차단.
// 서버 게이트가 진실. 클라이언트는 즉시 피드백 용도로만 사용.

const KO_BAD: string[] = [
  // 욕설 (음절 + 초성 변형)
  '시발', '씨발', '쒸발', '쉬발', '시바', '씨바', '시팔', '씨팔', 'ㅅㅂ',
  '병신', '병싄', '븅신', '븅싄', 'ㅂㅅ', '병ㅅ',
  '좆', '좇', '좆같', '좃같', '좋같', 'ㅈ같',
  '존나', '졸라', '존ㄴ', 'ㅈㄴ',
  '개새끼', '개색기', '개시키', '개샊', '개샹', '개색', '개쉑',
  '미친', '미췬', '미쳤', 'ㅁㅊ',
  '엿같', '엿먹',
  '지랄', '쥐랄', 'ㅈㄹ',
  '꺼져', '꺼정',
  '느금', '니애미', '니엄마', '니애비',
  '에미', '애미', '애비뒤',
  '닥쳐',
  // 인종/혐오/정치 (대표적 비방어)
  '한남', '김치녀', '메갈', '일베', '워마드',
];

const EN_BAD: string[] = [
  'fuck', 'fck', 'fuk', 'shit', 'sht', 'bitch', 'btch',
  'dick', 'cunt', 'asshole', 'bastard',
  'nigger', 'nigga', 'faggot', 'retard',
  'whore', 'slut',
];

const LEET: Record<string, string> = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't',
  '@': 'a', '$': 's', '!': 'i',
};

// 영문 leetspeak 정규화 + 공백/특수문자 제거
function normalizeEn(s: string): string {
  return s.toLowerCase()
    .replace(/[\s_\-.,;:'"`~()[\]{}<>]/g, '')
    .split('')
    .map(c => LEET[c] ?? c)
    .join('');
}

// 한국어는 단순 lowercase + 공백 제거
function normalizeKo(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '');
}

export function containsProfanity(nickname: string): boolean {
  if (typeof nickname !== 'string' || nickname.length === 0) return false;
  const ko = normalizeKo(nickname);
  for (const w of KO_BAD) if (ko.includes(w)) return true;
  const en = normalizeEn(nickname);
  for (const w of EN_BAD) if (en.includes(w)) return true;
  return false;
}
